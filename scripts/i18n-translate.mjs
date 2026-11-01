#!/usr/bin/env node
// Machine-translation pass for the message catalogues (issue #82).
//
//   npm run i18n:translate                      every locale, only what changed
//   npm run i18n:translate -- --locale ar,ja    just these locales
//   npm run i18n:translate -- --ns Home         just this namespace
//   npm run i18n:translate -- --force           retranslate everything selected
//   npm run i18n:translate -- --dry-run         report what WOULD be sent
//
// Incremental by construction. `messages/.i18n-lock.json` records, for every
// locale and key, the hash of the English string its translation was made from.
// A run sends only keys that are MISSING in a locale or whose English has
// CHANGED since (the hash differs), so editing one sentence costs one sentence
// per locale — and a human translator's edit is never overwritten, because a
// key whose English has not changed is never sent again.
//
// Every response is VALIDATED before it is written (scripts/i18n-lib.mjs
// `icuProblems`): a translation that drops a `{placeholder}`, renames a rich-
// text tag, changes a `select`'s branches or loses a plural's `other` branch is
// rejected and retried with the error stated. The model is told the rules; the
// validator is what makes them true.
//
// Calls go through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`, or the
// project's OIDC token after `vercel env pull`), with a plain "provider/model"
// string. Status stays `machine` in src/i18n/locales.js until a native speaker
// reviews the catalogue — this script never claims a review happened.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { LOCALES } from '../src/i18n/locales.js';
import {
  LOCK_FILE,
  MESSAGES_DIR,
  NOTES_DIR,
  flatten,
  icuProblems,
  loadNamespace,
  namespaces,
  readJson,
  shapeLike,
  sourceHash,
  writeJson,
} from './i18n-lib.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const MODEL = option('model') ?? process.env.I18N_MODEL ?? 'anthropic/claude-sonnet-5.5';
const CONCURRENCY = Number(option('concurrency') ?? 6);
const BATCH = Number(option('batch') ?? 60);
const DRY = flag('dry-run');
const FORCE = flag('force');
const onlyLocales = option('locale')?.split(',');
const onlyNs = option('ns')?.split(',');

const root = process.cwd();
const targets = LOCALES.filter(
  (l) => l.status !== 'source' && (!onlyLocales || onlyLocales.includes(l.code)),
);
const allNs = namespaces(root).filter((ns) => !onlyNs || onlyNs.includes(ns));

if (!DRY && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
  console.error('✗ AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN) is not set. Run with --dry-run, or set it in .env.local.');
  process.exit(1);
}

// ── House style per language ────────────────────────────────────────────────
// Register is a real decision per language, made once here rather than left to
// each batch to guess (and come out inconsistent across a page).
const REGISTER = {
  es: 'Use "tú" consistently; neutral international Spanish (avoid regionalisms).',
  pt: 'Brazilian Portuguese, "você", natural and warm.',
  fr: 'Use "vous". French typography: non-breaking space before : ; ! ? and inside « ».',
  de: 'Use "du" (the convention of developer portfolios and tech products). Compound nouns natural, no anglicisms where a common German word exists.',
  ru: 'Use "вы" (lowercase). Natural, not bureaucratic.',
  zh: 'Simplified Chinese (zh-Hans). Use full-width punctuation (，。：？！). No spaces between CJK and Latin is acceptable but keep brand names in Latin script.',
  ja: 'です/ます polite form. Full-width punctuation (、。). Keep it concise.',
  ko: '합니다/해요 polite style consistently (prefer 해요 for UI, 합니다 for longer prose). Natural Korean spacing.',
  ar: 'Modern Standard Arabic. Arabic punctuation (، ؛ ؟). Gender-neutral where possible.',
  ur: 'Natural modern Urdu in Nastaliq-friendly wording; Urdu punctuation (، ۔ ؟).',
  fa: 'Modern Persian; Persian punctuation (، ؛ ؟); use ZWNJ (half-space) correctly.',
  he: 'Modern Hebrew; prefer gender-neutral or plural forms for addressing the reader.',
  hi: 'Natural modern Hindi (Devanagari); common English tech terms may stay in Latin script where Indian developers use them.',
  it: 'Use "tu". Natural, concise.',
  tr: 'Use "sen" for UI, natural and concise.',
  vi: 'Natural Vietnamese; "bạn" for the reader.',
  pl: 'Natural Polish; address the reader with informal second person where UI-like, neutral forms in prose.',
  nl: 'Use "je/jij". Natural, concise.',
  id: 'Use "Anda". Natural, concise.',
};

// Keys written by hand in every locale and never sent to the model, not even
// under --force. The owner's name is transliterated, not translated: each
// script's conventional spelling (محمد عبدالله, ムハンマド・アブドゥッラー,
// Muhammed in Turkish) is a fact about the person, and a model asked twice can
// spell it two ways. Edit them in the catalogues directly.
const HAND_SET = new Set(['Common:owner.given', 'Common:owner.family', 'Common:owner.full']);

// "Muhammad Abdullah" is in this list for PROSE only (summaries, alt text,
// metadata), where it stays in Latin script as the name the CV and the profiles
// carry. Where the name is DISPLAYED as the site's masthead it is read from
// `Common.owner`, which is hand-set per locale (see HAND_SET).
const NEVER_TRANSLATE = [
  'Muhammad Abdullah', 'ma.codes', 'GitHub', 'Vercel', 'Next.js', 'React', 'TypeScript', 'JavaScript',
  'Node.js', 'Tailwind CSS', 'Spotify', 'LinkedIn', 'Google', 'MMU', 'Bolton', 'Greater Manchester',
  'Claude Code', 'Visual Studio Code', 'Lighthouse', 'Playwright', 'OwnTracks', 'PR', 'CV',
  'project names (theabdullahfolio, AfaaqX, culina, colophon, dhun, plenary, auxo, clearway, vigil, tailorhawk)',
  'organisation names (Unisys, Lidl GB, KFC, Showsec, C365Cloud, Adullam Homes Housing Association, Constant Security Services, Bolton College, Jodrell Bank)',
];

function systemPrompt(locale) {
  return [
    `You are a senior native ${locale.english} localiser for the personal portfolio site of a software engineer (Muhammad Abdullah, ma.codes).`,
    'The site is restrained, premium and precise: warm ember palette, editorial tone, honest claims. Translate so it reads as if written natively in the target language by a careful technical writer — never word-for-word.',
    `Target: ${locale.english} (${locale.endonym}, BCP 47 "${locale.hreflang}", ${locale.dir.toUpperCase()}). ${REGISTER[locale.code] ?? ''}`,
    'Strings are ICU MessageFormat. HARD RULES:',
    '- Keep every {placeholder} name exactly (do not translate names inside braces). You may move placeholders to fit the grammar.',
    '- Keep rich-text tags like <link>…</link> with the SAME tag names; translate only the text inside.',
    '- For {x, plural, …}: rewrite the branches using the TARGET language\'s CLDR plural categories (e.g. Arabic: zero one two few many other; Russian/Polish: one few many other; Japanese/Chinese/Korean/Vietnamese/Indonesian/Turkish: other only). Always include "other". Keep "#" where the number appears.',
    '- For {x, select, …}: keep exactly the same branch keys, translate the branch text.',
    '- Quote literal braces as \'{\' \'}\'. Do not introduce < or > characters.',
    '- Preserve leading/trailing spaces, line breaks, and symbols like →, ↗, ·, —, ×, %.',
    '- If the English is ALL CAPS (a display heading), use the natural display form of the target script (uppercase for Latin/Cyrillic/Greek; normal for scripts without case).',
    '- Respect any character limits in the context notes; UI labels must stay short.',
    `- Never translate: ${NEVER_TRANSLATE.join('; ')}. Code, file names, URLs, emails, keyboard keys and version numbers stay as they are.`,
    'Return ONLY the JSON object requested, with exactly the same keys.',
  ].join('\n');
}

function userPrompt(ns, entries, notes, retry) {
  const payload = Object.fromEntries(entries);
  const context = Object.fromEntries(
    entries.filter(([k]) => notes[k]).map(([k]) => [k, notes[k]]),
  );
  return [
    `Namespace "${ns}" (the file a page/component reads its copy from). Translate each value.`,
    Object.keys(context).length ? `Context notes per key:\n${JSON.stringify(context, null, 2)}` : '',
    retry ? `Your previous answer had problems — fix them:\n${retry}` : '',
    `Strings:\n${JSON.stringify(payload, null, 2)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function translateBatch(locale, ns, entries, notes) {
  const schema = z.object(Object.fromEntries(entries.map(([k]) => [k, z.string()])));
  let retry = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { output } = await generateText({
      model: MODEL,
      system: systemPrompt(locale),
      prompt: userPrompt(ns, entries, notes, retry),
      output: Output.object({ schema }),
      providerOptions: { gateway: { tags: ['i18n', `locale:${locale.code}`] } },
    });
    const problems = entries.flatMap(([key, english]) =>
      icuProblems(english, output[key]).map((p) => `- "${key}": ${p}`),
    );
    if (!problems.length) return output;
    retry = problems.join('\n');
    console.warn(`  ! ${locale.code}/${ns} attempt ${attempt}: ${problems.length} problem(s)`);
  }
  throw new Error(`${locale.code}/${ns}: could not produce a valid translation:\n${retry}`);
}

async function pool(tasks, size) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(size, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

const lock = readJson(join(root, LOCK_FILE));
let sent = 0;
let failed = 0;

const jobs = [];
for (const locale of targets) {
  for (const ns of allNs) {
    jobs.push(async () => {
      const english = flatten(loadNamespace(root, 'en', ns) ?? {});
      const existing = flatten(loadNamespace(root, locale.code, ns) ?? {});
      const hashes = lock[locale.code]?.[ns] ?? {};
      const notes = readJson(join(root, NOTES_DIR, `${ns}.json`));
      const todo = Object.entries(english).filter(
        ([key, value]) =>
          typeof value === 'string' &&
          !HAND_SET.has(`${ns}:${key}`) &&
          (FORCE || existing[key] === undefined || hashes[key] !== sourceHash(value)),
      );
      if (!todo.length) return;
      if (DRY) {
        console.log(`· ${locale.code}/${ns}: ${todo.length} key(s) would be translated`);
        sent += todo.length;
        return;
      }
      const translated = { ...existing };
      const nextHashes = { ...hashes };
      try {
        for (let i = 0; i < todo.length; i += BATCH) {
          const batch = todo.slice(i, i + BATCH);
          const out = await translateBatch(locale, ns, batch, notes);
          for (const [key, value] of batch) {
            translated[key] = out[key];
            nextHashes[key] = sourceHash(value);
          }
          sent += batch.length;
        }
      } catch (error) {
        failed += 1;
        console.error(`✗ ${error.message}`);
      }
      // Drop keys English no longer has, so a deleted string does not linger.
      for (const key of Object.keys(translated)) if (!(key in english)) delete translated[key];
      for (const key of Object.keys(nextHashes)) if (!(key in english)) delete nextHashes[key];
      const shaped = shapeLike(loadNamespace(root, 'en', ns) ?? {}, translated);
      mkdirSync(join(root, MESSAGES_DIR, locale.code), { recursive: true });
      writeJson(join(root, MESSAGES_DIR, locale.code, `${ns}.json`), shaped);
      lock[locale.code] = { ...(lock[locale.code] ?? {}), [ns]: nextHashes };
      writeJson(join(root, LOCK_FILE), sortKeys(lock));
      console.log(`✓ ${locale.code}/${ns}: ${todo.length} key(s)`);
    });
  }
}

function sortKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((k) => [k, sortKeys(value[k])]),
  );
}

await pool(jobs, CONCURRENCY);
console.log(`${DRY ? 'would send' : 'translated'} ${sent} string(s) with ${MODEL}${failed ? `, ${failed} batch(es) failed` : ''}`);
if (failed) process.exit(1);
