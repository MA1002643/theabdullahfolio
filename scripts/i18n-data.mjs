#!/usr/bin/env node
// Derives the English content catalogues from src/app/data.js (issue #82).
//
//   node scripts/i18n-data.mjs           write messages/en/Data.json + Nav links
//   node scripts/i18n-data.mjs --check   exit 1 if they are out of date (CI)
//
// `data.js` stays the single English source: it feeds the sitemap, the JSON-LD
// graph and the CV, none of which are translated, and it is where the owner
// edits a role or a project. The catalogue is GENERATED from it so the English
// that translators work from can never drift from the English the site
// renders. tests/fitness/i18nDataCatalogue.test.js runs `--check`.
//
// Keys are STABLE IDENTIFIERS from the data (project id, journey id, a slug of
// a fixed label), never array positions: reordering the timeline must not
// re-point every translation at the wrong entry.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

// data.js is an ES module with no imports, so it can be loaded directly.
const { projectsData, journeyData, usesData, BtnList } = await import(
  pathToFileURL(join(root, 'src/app/data.js')).href
);

export const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const projects = Object.fromEntries(
  projectsData.map((p) => [String(p.id), { description: p.description }]),
);

const categories = Object.fromEntries(
  [...new Set(projectsData.map((p) => p.category))].map((c) => [c, c]),
);

const journey = Object.fromEntries(
  journeyData.map((j) => [
    j.id,
    {
      title: j.title,
      description: j.description,
      // Tags are an object keyed by position-independent slugs, not an array,
      // so the ICU-aware tooling treats each as an ordinary message.
      tags: Object.fromEntries(j.tags.map((tag) => [slug(tag), tag])),
    },
  ]),
);

const machine = Object.fromEntries(
  usesData.machine.map((row) => [
    slug(row.label),
    {
      label: row.label,
      value: row.value,
      ...(row.note ? { note: row.note } : {}),
      ...(row.hrefLabel ? { hrefLabel: row.hrefLabel } : {}),
    },
  ]),
);

const bench = Object.fromEntries(
  usesData.bench.map((row) => [slug(row.role), { role: row.role, detail: row.detail }]),
);

// Case-study prose (issue #31), keyed by project id, then chapter TYPE (each
// appears once per project), then each entry's own `id`. Only visitor-facing
// prose is mirrored: srcs, hrefs, dimensions and `derive` keys are not copy.
// Every array entry MUST carry an `id`; a missing one fails here rather than
// silently keying a translation by position.
const keyed = (list, where, pick) =>
  Object.fromEntries(
    (list ?? []).map((entry) => {
      if (!entry?.id) throw new Error(`i18n-data: ${where} has an entry with no \`id\``);
      return [entry.id, pick(entry)];
    }),
  );

const chapterCopy = (projectId, chapter) => {
  const where = `projects[${projectId}].caseStudy.${chapter.type}`;
  const out = {};
  if (chapter.title) out.title = chapter.title;
  if (chapter.body) out.body = chapter.body;
  if (chapter.facts) out.facts = keyed(chapter.facts, where, (f) => ({ label: f.label, value: f.value }));
  if (chapter.steps)
    out.steps = keyed(chapter.steps, where, (s) => ({
      title: s.title,
      body: s.body,
      ...(s.media?.alt ? { alt: s.media.alt } : {}),
    }));
  if (chapter.items)
    out.items = keyed(chapter.items, where, (item) =>
      Object.fromEntries(
        ['title', 'body', 'label', 'alt', 'caption'].filter((k) => item[k]).map((k) => [k, item[k]]),
      ),
    );
  return out;
};

const caseStudies = Object.fromEntries(
  projectsData
    .filter((p) => p.caseStudy)
    .map((p) => {
      const cs = p.caseStudy;
      return [
        String(p.id),
        {
          ...(cs.role ? { role: cs.role } : {}),
          ...(cs.thesis ? { thesis: cs.thesis } : {}),
          ...(cs.hero?.alt ? { heroAlt: cs.hero.alt } : {}),
          chapters: Object.fromEntries(cs.chapters.map((c) => [c.type, chapterCopy(p.id, c)])),
        },
      ];
    }),
);

const data = { projects, categories, journey, uses: { machine, bench }, caseStudies };
const navLinks = Object.fromEntries(BtnList.map((b) => [b.icon, b.label]));

const serialise = (value) => `${JSON.stringify(value, null, 2)}\n`;

const targets = [
  { file: join(root, 'messages/en/Data.json'), value: data },
];

// Nav.json is shared with hand-written keys, so only its `links` block is
// generated; everything else in the file is preserved.
const navFile = join(root, 'messages/en/Nav.json');
let nav = {};
try {
  nav = JSON.parse(readFileSync(navFile, 'utf8'));
} catch {
  nav = {};
}
targets.push({ file: navFile, value: { ...nav, links: navLinks } });

let stale = false;
for (const { file, value } of targets) {
  const next = serialise(value);
  let current = '';
  try {
    current = readFileSync(file, 'utf8');
  } catch {
    current = '';
  }
  if (current === next) continue;
  stale = true;
  if (check) {
    console.error(`✗ ${file.replace(`${root}/`, '')} is out of date — run: node scripts/i18n-data.mjs`);
  } else {
    writeFileSync(file, next);
    console.log(`✓ wrote ${file.replace(`${root}/`, '')}`);
  }
}

if (check && stale) process.exit(1);
if (!stale) console.log('✓ content catalogues are up to date');
