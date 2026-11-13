import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assembleNote,
  blockHash,
  splitBlocks,
  translatableBlocks,
} from '@/lib/notes/segments';
import { localizeLinks, readNote, readNotes, renderNote } from '@/lib/notes/readNotes';
import { noteMetaDescription } from '@/lib/seo/noteMeta';
import { markdownProblems, pseudoMarkdown } from '../../scripts/notes-lib.mjs';

// The engineering notes in every locale (2026-11-10). They were English by
// decision under issue #82; they are now translated a markdown block (or table
// row) at a time, keyed by the hash of the English, from docs/i18n/<locale>/.
//
// What can go wrong, and what each block below pins:
//   1. Reassembly that changes the ENGLISH — the translated page is built from
//      the same segments, so a lossy split breaks every locale at once.
//   2. A stale cache rendering wrong text, or silently dropping a passage —
//      untranslated blocks must come back as their English, counted and
//      marked `lang="en"`, never vanish.
//   3. A translation that breaks the markdown: lost code, a moved link
//      target, a table row with a cell too many.
//   4. Links between notes that drop the reader back into English.

const DOC = [
  '# Title',
  '',
  'Opening paragraph, wrapped',
  'across two lines with `code`.',
  '',
  '```js',
  'const a = 1;',
  '',
  'const b = 2;',
  '```',
  '',
  '| Layer | Fix |',
  '|---|---|',
  '| Unit | Tested `x`. |',
  '| E2E | Covered. |',
  '',
  '- one',
  '- two',
  '',
  '---',
  '',
  'Closing paragraph.',
  '',
].join('\n');

describe('segments', () => {
  it('reassembles the English byte for byte from its segments', () => {
    expect(assembleNote(DOC, {}).markdown).toBe(DOC);
    for (const file of ['seo', 'testing', 'multilingual']) {
      const md = readFileSync(`docs/${file}.md`, 'utf8');
      // A run of trailing newlines collapses to one, which renders the same.
      expect(assembleNote(md, {}).markdown, file).toBe(md.replace(/\n+$/, '\n'));
    }
  });

  it('keeps a fence whole across its blank lines and never sends it', () => {
    const fence = splitBlocks(DOC).find((b) => b.code);
    expect(fence.text).toBe('```js\nconst a = 1;\n\nconst b = 2;\n```');
    expect(fence.translatable).toBe(false);
  });

  it('splits a table into rows joined by single newlines', () => {
    const rows = splitBlocks(DOC).filter((b) => b.row);
    expect(rows.map((r) => r.sep)).toEqual(['\n\n', '\n', '\n', '\n']);
    // The divider has no letters, so it is never sent.
    expect(rows[1].translatable).toBe(false);
  });

  it('skips blocks with no letters, and repeats', () => {
    const texts = translatableBlocks(`${DOC}\nClosing paragraph.\n`).map((b) => b.text);
    expect(texts).not.toContain('---');
    expect(texts.filter((t) => t === 'Closing paragraph.')).toHaveLength(1);
  });
});

describe('assembly in another locale', () => {
  const cache = {
    [blockHash('# Title')]: '# Titre',
    [blockHash('| Unit | Tested `x`. |')]: '| Unité | `x` testé. |',
    [blockHash('Closing paragraph.')]: 'Paragraphe final.',
  };

  it('uses each cached translation and counts what fell back', () => {
    const out = assembleNote(DOC, cache);
    expect(out.markdown).toContain('# Titre');
    expect(out.markdown).toContain('| Unité | `x` testé. |');
    expect(out.markdown).toContain('Paragraphe final.');
    expect(out.titleTranslated).toBe(true);
    // Opening paragraph, header row, the E2E row, the list.
    expect(out.fallback).toBe(4);
    // Nothing dropped: the untranslated English is still there.
    expect(out.markdown).toContain('Opening paragraph, wrapped');
  });

  it('marks English passages as English, but never inside a table', () => {
    const html = renderNote(assembleNote(DOC, cache, { markFallback: true }).markdown, 'fr');
    expect(html).toMatch(/<div lang="en" dir="ltr" class="note-untranslated">\s*<p>Opening paragraph/);
    // The table survived as one table, with the untranslated row inside it.
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html).toContain('<td>E2E</td>');
  });

  it('never wraps the title, which renderNote strips from the very start', () => {
    const out = assembleNote(DOC, {}, { markFallback: true }).markdown;
    expect(out.startsWith('# Title\n')).toBe(true);
    expect(renderNote(out)).not.toContain('<h1');
  });
});

describe('markdownProblems', () => {
  it('accepts a faithful translation, re-wrapped', () => {
    expect(
      markdownProblems(
        'Run `npm test` and read\n[the notes](/notes/testing).',
        'Lancez `npm test` et lisez [les notes](/notes/testing).',
      ),
    ).toEqual([]);
  });

  it('allows an extra code span, but not a missing one', () => {
    expect(markdownProblems('Set the sitemap.', 'Définissez le `sitemap`.')).toEqual([]);
    expect(markdownProblems('Run `a` and `a`.', 'Lancez `a`.').length).toBeGreaterThan(0);
  });

  it('rejects a wrap that starts a line with a list marker', () => {
    expect(markdownProblems('Steps 1 and 3 run\nfirst.', 'Adım\n1. ve 3. önce.')[0]).toMatch(/list marker/);
  });

  it.each([
    ['translated code', 'Run `npm test`.', 'Lancez `npm essai`.'],
    ['moved link target', '[a](/notes/testing)', '[a](/fr/notes/testing)'],
    ['extra table cell', '| a | b |', '| a | b | c |'],
    ['lost list item', '- one\n- two', '- un'],
    ['changed heading level', '## Two', '# Deux'],
    ['dropped HTML tag', 'A <br> B', 'A B'],
    ['empty', 'Text.', '  '],
  ])('rejects %s', (_, english, translation) => {
    expect(markdownProblems(english, translation).length).toBeGreaterThan(0);
  });
});

describe('pseudoMarkdown', () => {
  it('accents text and leaves code, links and tags alone', () => {
    const out = pseudoMarkdown('Run `npm test`, see [notes](/notes/testing) <br> https://ma.codes now');
    expect(out).toContain('`npm test`');
    expect(out).toContain('](/notes/testing)');
    expect(out).toContain('<br>');
    expect(out).toContain('https://ma.codes');
    expect(out).not.toMatch(/\bRun\b|\bnow\b/);
    expect(markdownProblems('Run `npm test`, see [notes](/notes/testing) <br> https://ma.codes now', out)).toEqual([]);
  });
});

describe('links between notes', () => {
  it('keep the reader in their language, and touch nothing else', () => {
    const html = '<a href="/notes/testing#x">t</a><a href="/cv.pdf">c</a><a href="/notes">n</a><a href="https://x.dev/notes/a">e</a>';
    expect(localizeLinks(html, 'ar')).toBe(
      '<a href="/ar/notes/testing#x">t</a><a href="/cv.pdf">c</a><a href="/ar/notes">n</a><a href="https://x.dev/notes/a">e</a>',
    );
    expect(localizeLinks(html, 'en')).toBe(html);
  });
});

describe('readNotes in a locale', () => {
  // A throwaway repository: one document, one locale's cache, one catalogue.
  const root = mkdtempSync(path.join(tmpdir(), 'notes-i18n-'));
  mkdirSync(path.join(root, 'docs', 'i18n', 'fr'), { recursive: true });
  mkdirSync(path.join(root, 'messages', 'fr'), { recursive: true });
  const md = '# Caching\n\nIssue #99.\n\nBody text.\n';
  writeFileSync(path.join(root, 'docs', 'caching.md'), md);
  writeFileSync(
    path.join(root, 'docs', 'i18n', 'fr', 'caching.json'),
    JSON.stringify({ [blockHash('# Caching')]: '# Mise en cache' }),
  );
  writeFileSync(
    path.join(root, 'messages', 'fr', 'Notes.json'),
    JSON.stringify({ meta: { composed: 'Registre — {title}. {n} lignes.' } }),
  );

  it('translates the title, and says which strings are still English', () => {
    const note = readNote('caching', { locale: 'fr', root });
    expect(note.title).toBe('Mise en cache');
    expect(note.titleLang).toBe('fr');
    // The summary block has no entry, so it is the English, marked as such.
    expect(note.summary).toBe('Issue #99.');
    expect(note.summaryLang).toBe('en');
    expect(note.untranslated).toBe(2);
    // The facts about the committed file stay the English file's.
    expect(note.lines).toBe(5);
    expect(note.source).toBe('docs/caching.md');
  });

  it('describes itself from the same source as in English, in French', () => {
    const english = readNote('caching', { root });
    // English composes (the summary misses the window), so French composes.
    expect(english.description).toBe(noteMetaDescription(english, { root }));
    expect(readNote('caching', { locale: 'fr', root }).description).toBe(
      'Registre — Mise en cache. 5 lignes.',
    );
  });

  it('renders English unchanged in English', () => {
    const note = readNote('caching', { root });
    expect(note.body).toBe(md);
    expect(note.untranslated).toBe(0);
  });

  it('serves every shipped note in every locale with a title', () => {
    for (const note of readNotes({ locale: 'ar' })) {
      expect(note.title, note.slug).toBeTruthy();
      expect(note.description, note.slug).toBeTruthy();
    }
  });
});
