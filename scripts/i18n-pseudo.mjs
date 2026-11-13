#!/usr/bin/env node
// Writes the pseudo-locale catalogue (messages/en-XA/, gitignored) from English.
//
//   npm run i18n:pseudo
//
// Run before a build that sets NEXT_PUBLIC_I18N_PSEUDO=1 (CI's build job does
// both). The site then serves every page at /en-XA/…, where every catalogue
// string reads `[Ȧƀǿǿŭŭŧ ḿḗḗ]` and anything still in plain ASCII letters
// came from somewhere other than a catalogue: a hard-coded label, an English
// fallback, a string built in code. tests/i18n/pseudo.spec.js crawls every
// route there and fails on what it finds.
//
// Generated, never committed: it is a pure function of messages/en, so a
// committed copy could only ever be stale. The transform is `pseudoCatalogue`
// in scripts/i18n-lib.mjs.

import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PSEUDO_LOCALE } from '../src/i18n/locales.js';
import { translatableBlocks } from '../src/lib/notes/segments.js';
import { MESSAGES_DIR, loadNamespace, namespaces, pseudoCatalogue, writeJson } from './i18n-lib.mjs';
import { pseudoMarkdown } from './notes-lib.mjs';

const root = process.cwd();
const dir = join(root, MESSAGES_DIR, PSEUDO_LOCALE.code);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const names = namespaces(root);
for (const ns of names) writeJson(join(dir, `${ns}.json`), pseudoCatalogue(loadNamespace(root, 'en', ns)));
console.log(`✓ ${PSEUDO_LOCALE.code}: ${names.length} namespaces pseudo-localised from English → ${dir}`);

// The engineering notes too (docs/i18n/en-XA/, gitignored): every translatable
// block accented with its markdown and literals kept, so the gate checks the
// notes' translation WIRING — a title, summary or paragraph read from the
// English instead of the cache shows up as plain English on /en-XA/notes/….
const notesDir = join(root, 'docs', 'i18n', PSEUDO_LOCALE.code);
rmSync(notesDir, { recursive: true, force: true });
mkdirSync(notesDir, { recursive: true });
const docs = readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md'));
for (const file of docs) {
  const blocks = translatableBlocks(readFileSync(join(root, 'docs', file), 'utf8'));
  writeJson(
    join(notesDir, file.replace(/\.md$/, '.json')),
    Object.fromEntries(blocks.map((b) => [b.hash, pseudoMarkdown(b.text)])),
  );
}
console.log(`✓ ${PSEUDO_LOCALE.code}: ${docs.length} notes pseudo-localised → ${notesDir}`);
