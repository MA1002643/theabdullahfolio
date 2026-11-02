#!/usr/bin/env node
// Catalogue audit (issue #82). Runs in CI; exits 1 on any ERROR.
//
//   npm run i18n:audit            human report
//   npm run i18n:audit -- --json  machine-readable report
//
// For every locale in src/i18n/locales.js and every namespace in messages/en:
//
//   ERROR  missing      key exists in English, not in the locale
//   ERROR  outdated     English changed since the key was translated (the hash
//                       in messages/.i18n-lock.json no longer matches) — the
//                       translation describes a sentence the site no longer says
//   ERROR  structure    placeholders / rich-text tags / select branches differ
//                       from English, the ICU does not parse, or a plural has no
//                       `other` branch (scripts/i18n-lib.mjs `icuProblems`)
//   ERROR  orphan       a catalogue file or key English does not have
//   ERROR  unloaded     a namespace file that src/i18n/namespaces.js never loads
//   WARN   identical    same text as English — often correct (a brand, "CV",
//                       "Next.js"), so reported for review, never failed
//
// Missing keys still render (src/i18n/messages.js falls back to English), so a
// missing key is a quality failure, not an outage — which is exactly why it
// has to fail CI rather than be noticed by a visitor.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES } from '../src/i18n/locales.js';
import { NAMESPACES } from '../src/i18n/namespaces.js';
import {
  LOCK_FILE,
  MESSAGES_DIR,
  flatten,
  icuProblems,
  icuSignature,
  loadNamespace,
  namespaces,
  readJson,
  sourceHash,
} from './i18n-lib.mjs';

const root = process.cwd();
const asJson = process.argv.includes('--json');
const lock = readJson(join(root, LOCK_FILE));
const issues = [];
const add = (level, kind, locale, ns, key, detail = '') =>
  issues.push({ level, kind, locale, ns, key, detail });

const englishNs = namespaces(root);

for (const ns of englishNs) {
  if (!NAMESPACES.includes(ns)) add('error', 'unloaded', 'en', ns, '', 'add it to src/i18n/namespaces.js');
  const english = flatten(loadNamespace(root, 'en', ns));
  for (const [key, value] of Object.entries(english)) {
    const sig = icuSignature(value);
    if (sig.error) add('error', 'structure', 'en', ns, key, `English ICU does not parse: ${sig.error}`);
  }
}

for (const locale of LOCALES.filter((l) => l.status !== 'source')) {
  const dir = join(root, MESSAGES_DIR, locale.code);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  for (const file of files) {
    const ns = file.replace(/\.json$/, '');
    if (!englishNs.includes(ns)) add('error', 'orphan', locale.code, ns, '', 'no English source file');
  }
  for (const ns of englishNs) {
    const english = flatten(loadNamespace(root, 'en', ns));
    const target = flatten(loadNamespace(root, locale.code, ns) ?? {});
    const hashes = lock[locale.code]?.[ns] ?? {};
    for (const [key, source] of Object.entries(english)) {
      if (typeof source !== 'string') continue;
      if (target[key] === undefined) {
        add('error', 'missing', locale.code, ns, key);
        continue;
      }
      if (hashes[key] !== sourceHash(source)) add('error', 'outdated', locale.code, ns, key);
      for (const problem of icuProblems(source, target[key])) {
        add('error', 'structure', locale.code, ns, key, problem);
      }
      if (target[key] === source && /\p{L}{4,}/u.test(source)) {
        add('warn', 'identical', locale.code, ns, key);
      }
    }
    for (const key of Object.keys(target)) {
      if (!(key in english)) add('error', 'orphan', locale.code, ns, key, 'key not in English');
    }
  }
}

const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warn');

if (asJson) {
  console.log(JSON.stringify({ errors: errors.length, warnings: warnings.length, issues }, null, 2));
} else {
  const summary = {};
  for (const i of errors) summary[`${i.locale} ${i.kind}`] = (summary[`${i.locale} ${i.kind}`] ?? 0) + 1;
  for (const i of errors.slice(0, 40)) {
    console.error(`✗ ${i.locale}/${i.ns}${i.key ? `:${i.key}` : ''} — ${i.kind}${i.detail ? `: ${i.detail}` : ''}`);
  }
  if (errors.length > 40) console.error(`  … and ${errors.length - 40} more`);
  if (Object.keys(summary).length) console.error(summary);
  console.log(
    `${errors.length ? '✗' : '✓'} i18n audit: ${LOCALES.length - 1} locales × ${englishNs.length} namespaces — ` +
      `${errors.length} error(s), ${warnings.length} identical-to-English warning(s)`,
  );
}

process.exit(errors.length ? 1 : 0);
