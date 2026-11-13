#!/usr/bin/env node
// Machine translation for the engineering notes (docs/*.md, 2026-11-10).
//
//   npm run notes:translate                        every locale, only what changed
//   npm run notes:translate -- --locale ar,ja      just these locales
//   npm run notes:translate -- --doc testing       just docs/testing.md
//   npm run notes:translate -- --force             retranslate everything selected
//   npm run notes:translate -- --dry-run           report what WOULD be sent
//   npm run notes:translate -- --check             exit 1 if any block is untranslated
//
// The unit is a markdown block, keyed by the hash of its English
// (src/lib/notes/segments.js). `docs/i18n/<locale>/<doc>.json` maps each hash to
// its translation. A run sends only blocks with no entry, so editing one
// paragraph of docs/seo.md costs one paragraph per locale, and entries for
// blocks the English no longer has are dropped, so the cache never grows stale
// text. Fenced code and blocks with no letters are never sent.
//
// Every response is VALIDATED (`markdownProblems`, scripts/notes-lib.mjs): a
// block that loses an inline code span, changes a link target, breaks a table
// row or a list is rejected and retried with the problem stated. A block that
// still fails after three attempts is left out and reported. The page then
// renders its English inside a `lang="en"` island and says so, which beats
// publishing a broken table.
//
// Calls go through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`, or the
// project's OIDC token after `vercel env pull`), like npm run i18n:translate,
// and with the same house style per language.

import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { LOCALES } from '../src/i18n/locales.js';
import { translatableBlocks } from '../src/lib/notes/segments.js';
import { NEVER_TRANSLATE, REGISTER, readJson, writeJson } from './i18n-lib.mjs';
import { markdownProblems } from './notes-lib.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const MODEL = option('model') ?? process.env.I18N_MODEL ?? 'anthropic/claude-sonnet-5.5';
const CONCURRENCY = Number(option('concurrency') ?? 12);
// Source characters per request. Large enough to give the model a passage's
// context, small enough that one failed response costs little to redo.
const BUDGET = Number(option('chars') ?? 6000);
const MAX_BLOCKS = 30;
const DRY = flag('dry-run');
const CHECK = flag('check');
const FORCE = flag('force');
const onlyLocales = option('locale')?.split(',');
const onlyDocs = option('doc')?.split(',');

const root = process.cwd();
const DOCS = join(root, 'docs');
const CACHE = join(DOCS, 'i18n');

const targets = LOCALES.filter(
  (l) => l.status !== 'source' && (!onlyLocales || onlyLocales.includes(l.code)),
);
const docs = readdirSync(DOCS)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
  .filter((d) => !onlyDocs || onlyDocs.includes(d));

if (!DRY && !CHECK && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
  console.error('✗ AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN) is not set. Run with --dry-run, or set it in .env.local.');
  process.exit(1);
}

function systemPrompt(locale) {
  return [
    `You are a senior native ${locale.english} technical translator. You are translating the engineering notes of a software engineer's portfolio site (Muhammad Abdullah, ma.codes): decision records about how the site is built, tested and made discoverable.`,
    'Write it as a careful native technical writer would: precise, plain, and natural in the target language, never word-for-word. Keep the author\'s first-person voice and the exact technical meaning, including every number, date, unit and qualifier.',
    `Target: ${locale.english} (${locale.endonym}, BCP 47 "${locale.hreflang}", ${locale.dir.toUpperCase()}). ${REGISTER[locale.code] ?? ''}`,
    'Each input is ONE markdown block. HARD RULES:',
    '- Copy every inline code span (text in `backticks`) byte for byte. Never translate inside backticks.',
    '- Keep markdown syntax exactly: heading markers (#), list markers and their indentation, blockquote markers (>), emphasis (** and *), and link syntax [text](url). Translate the link TEXT, never the URL.',
    '- A table keeps the same number of rows, one row per line, and the same number of "|" separators in every row. The divider row (| --- |) is copied unchanged. Never put a "|" inside cell text.',
    '- A list keeps the same items in the same order, each starting on its own line with the same marker and indentation.',
    '- Prose lines may be re-wrapped freely: a single line break inside a paragraph is not significant.',
    '- Copy HTML tags, URLs, file paths, environment variable names, commands, CSS/JS identifiers, issue and PR references (#32), section references (§10) and version numbers unchanged.',
    `- Never translate: ${NEVER_TRANSLATE.join('; ')}. Product, library and tool names stay in Latin script (Next.js, Playwright, Vitest, axe, Lighthouse, Search Console, Vercel, Upstash, framer-motion, next-intl…).`,
    '- Do not add, drop, summarise or explain anything. No notes, no commentary.',
    'Return ONLY the JSON object requested: one translation per input id.',
  ].join('\n');
}

function userPrompt(doc, batch, retry) {
  return [
    `Document: docs/${doc}.md. Consecutive blocks from it, in order.`,
    retry ? `Your previous answer had problems in some blocks — fix them:\n${retry}` : '',
    `Blocks:\n${JSON.stringify(batch.map((b) => ({ id: b.hash, markdown: b.text })), null, 2)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

const schema = z.object({
  translations: z.array(z.object({ id: z.string(), markdown: z.string() })),
});

/** Translations for a batch: `{hash: text}` for the blocks that validated. */
async function translateBatch(locale, doc, batch) {
  const done = {};
  const reasons = {};
  let todo = batch;
  let retry = '';
  for (let attempt = 1; attempt <= 3 && todo.length; attempt += 1) {
    let output;
    try {
      ({ output } = await generateText({
        model: MODEL,
        system: systemPrompt(locale),
        prompt: userPrompt(doc, todo, retry),
        output: Output.object({ schema }),
        providerOptions: { gateway: { tags: ['i18n', 'notes', `locale:${locale.code}`] } },
      }));
    } catch (error) {
      retry = '';
      console.warn(`  ! ${locale.code}/${doc} attempt ${attempt}: ${error.message.split('\n')[0]}`);
      continue;
    }
    const byId = Object.fromEntries(output.translations.map((t) => [t.id, t.markdown]));
    const problems = [];
    const failed = [];
    for (const block of todo) {
      // Trailing whitespace and surrounding blank lines are not part of a
      // block (they separate blocks); a model that adds them is not wrong.
      const text = byId[block.hash]?.replace(/^\n+|\s+$/g, '');
      const found = text === undefined ? ['missing from the answer'] : markdownProblems(block.text, text);
      if (found.length) {
        failed.push(block);
        reasons[block.hash] = found.join('; ');
        problems.push(`- block ${block.hash}: ${found.join('; ')}`);
      } else {
        done[block.hash] = text;
      }
    }
    todo = failed;
    retry = problems.join('\n');
    if (todo.length) console.warn(`  ! ${locale.code}/${doc} attempt ${attempt}: ${todo.length} block(s) rejected`);
  }
  for (const block of todo) {
    console.error(`  ✗ ${locale.code}/${doc}: block ${block.hash} left in English (${block.text.slice(0, 60).replace(/\n/g, ' ')}…): ${reasons[block.hash] ?? 'request failed'}`);
  }
  return { done, failed: todo.length };
}

/** Consecutive blocks grouped to a character budget, document order kept. */
function batches(blocks) {
  const out = [];
  let current = [];
  let size = 0;
  for (const block of blocks) {
    if (current.length && (size + block.text.length > BUDGET || current.length >= MAX_BLOCKS)) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(block);
    size += block.text.length;
  }
  if (current.length) out.push(current);
  return out;
}

async function pool(tasks, size) {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      await tasks[index]();
    }
  });
  await Promise.all(workers);
}

// One cache per locale and document, held in memory and written after every
// batch, so an interrupted run keeps what it paid for.
const caches = new Map();
const tasks = [];
let missing = 0;
let failed = 0;
let sent = 0;

for (const doc of docs) {
  const blocks = translatableBlocks(readFileSync(join(DOCS, `${doc}.md`), 'utf8'));
  for (const locale of targets) {
    const file = join(CACHE, locale.code, `${doc}.json`);
    const existing = readJson(file);
    // Document order, and only blocks the English still has.
    const cache = Object.fromEntries(
      blocks.filter((b) => !FORCE && b.hash in existing).map((b) => [b.hash, existing[b.hash]]),
    );
    const todo = blocks.filter((b) => !(b.hash in cache));
    const stale = Object.keys(existing).filter((h) => !blocks.some((b) => b.hash === h)).length;
    missing += todo.length;

    const write = () => {
      const ordered = Object.fromEntries(
        blocks.filter((b) => b.hash in cache).map((b) => [b.hash, cache[b.hash]]),
      );
      mkdirSync(join(CACHE, locale.code), { recursive: true });
      writeJson(file, ordered);
    };

    if (DRY || CHECK) {
      if (todo.length || stale) {
        console.log(`· ${locale.code}/${doc}: ${todo.length} block(s) to translate (${todo.reduce((n, b) => n + b.text.length, 0)} chars)${stale ? `, ${stale} stale` : ''}`);
      }
      continue;
    }
    caches.set(file, cache);
    // Pruning stale entries is a write of its own, even with nothing to send.
    if (stale && !todo.length) write();
    for (const batch of batches(todo)) {
      tasks.push(async () => {
        const result = await translateBatch(locale, doc, batch);
        Object.assign(cache, result.done);
        failed += result.failed;
        sent += batch.length;
        write();
        console.log(`✓ ${locale.code}/${doc}: ${Object.keys(result.done).length}/${batch.length} block(s)  [${sent}/${missing}]`);
      });
    }
  }
}

if (DRY || CHECK) {
  console.log(`${missing} untranslated block(s) across ${targets.length} locale(s) and ${docs.length} document(s)`);
  process.exit(CHECK && missing ? 1 : 0);
}

await pool(tasks, CONCURRENCY);
console.log(`translated ${sent - failed} of ${missing} block(s) with ${MODEL}${failed ? `; ${failed} left in English (see above)` : ''}`);
if (failed) process.exit(1);
