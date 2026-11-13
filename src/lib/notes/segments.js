import { createHash } from 'node:crypto';

// The unit the engineering notes are translated in (the notes follow-up to
// issue #82): one markdown BLOCK, the text between two blank lines, with a
// fenced code block kept whole however many blank lines it holds.
//
// ── Why blocks, keyed by the hash of their English ──────────────────────────
// `docs/seo.md` and `docs/testing.md` are edited on almost every commit
// (CLAUDE.md §2–3). A translation of the whole file would be stale after the
// next one; a translation keyed by a block's own English text goes stale ONE
// BLOCK at a time. `npm run notes:translate` sends only the blocks whose hash
// no translation exists for, so editing a paragraph costs one paragraph per
// locale, and the rest of a document stays translated untouched.
//
// A block with no translation yet is not dropped and not guessed: the page
// renders its English, inside a `lang="en" dir="ltr"` island so a screen
// reader switches voice for it, and says above the document that some
// passages are still English (`assembleNote` reports how many).
//
// ── Tables are translated a ROW at a time ──────────────────────────────────
// A table is one markdown block, and the defects table in docs/testing.md is
// over a hundred rows that gain one per bug found. As one unit it would be a
// single 50 KB request, stale in full every time a row is added. Each row is
// its own segment instead, joined to the one before by a single newline, so a
// new row costs one row per locale and a long table is batched like prose.
//
// ── What is never sent ──────────────────────────────────────────────────────
// Fenced code and any block with no letter in it (a rule, a table divider):
// both read the same in every language, and code must stay byte-for-byte what
// the repository holds.

/** The 12-hex-digit key of a block, the same form as `.i18n-lock.json`. */
export const blockHash = (text) =>
  createHash('sha256').update(String(text)).digest('hex').slice(0, 12);

const FENCE = /^\s*(`{3,}|~{3,})/;

/**
 * A markdown document as an ordered list of segments: blocks, and table rows.
 *
 * Blank lines separate blocks and are not kept: reassembling with exactly one
 * blank line between blocks renders the same HTML, since CommonMark treats any
 * run of blank lines as one separator. A fence that abuts a paragraph is split
 * from it, so a code block never travels inside a prose block to the model.
 * `sep` is what joins a segment to the one before it: a blank line between
 * blocks, a single newline between the rows of one table.
 *
 * @param {string} markdown
 * @returns {{text: string, code: boolean, row: boolean, sep: string, translatable: boolean, hash: string}[]}
 */
export function splitBlocks(markdown) {
  const blocks = [];
  let current = [];
  let fence = null;

  const segment = (text, { code = false, row = false, sep = '\n\n' } = {}) => ({
    text,
    code,
    row,
    sep,
    translatable: !code && /\p{L}/u.test(text),
    hash: blockHash(text),
  });

  const push = (code) => {
    if (!current.length) return;
    if (!code && current.every((line) => line.trimStart().startsWith('|'))) {
      current.forEach((line, i) => {
        blocks.push(segment(line, { row: true, sep: i === 0 ? '\n\n' : '\n' }));
      });
    } else {
      blocks.push(segment(current.join('\n'), { code }));
    }
    current = [];
  };

  for (const line of markdown.split('\n')) {
    if (fence) {
      current.push(line);
      const trimmed = line.trim();
      // A fence closes on a run of the SAME character at least as long as the
      // opener, with nothing else on the line.
      if (
        trimmed.length >= fence.length &&
        trimmed === fence[0].repeat(trimmed.length)
      ) {
        fence = null;
        push(true);
      }
      continue;
    }
    const open = line.match(FENCE);
    if (open) {
      push(false);
      fence = open[1];
      current.push(line);
      continue;
    }
    if (!line.trim()) {
      push(false);
      continue;
    }
    current.push(line);
  }
  // An unclosed fence runs to the end of the document, as CommonMark reads it.
  push(Boolean(fence));
  return blocks;
}

/**
 * The translatable blocks of a document, unique by hash, in document order.
 * What the translation script works through, and what a cache is checked
 * against.
 */
export function translatableBlocks(markdown) {
  const seen = new Set();
  return splitBlocks(markdown).filter((block) => {
    if (!block.translatable || seen.has(block.hash)) return false;
    seen.add(block.hash);
    return true;
  });
}

const ISLAND_OPEN = '<div lang="en" dir="ltr" class="note-untranslated">';
const ISLAND_CLOSE = '</div>';

/**
 * A document in another language, from its English and a translation cache.
 *
 * Every translatable block is replaced by `cache[hash]` where one exists.
 * The rest keep their English and are counted. With `markFallback`, each run
 * of consecutive English blocks is wrapped in an HTML island declaring its
 * language; CommonMark parses markdown between HTML block tags when they stand
 * on their own lines with blank lines round the content, which is why the
 * tags get blocks of their own.
 *
 * The first block is never wrapped. It is the H1, which `renderNote` strips by
 * matching it at the very start of the document, and the page renders the
 * title itself (with its own `lang`). Nor is a table row: an HTML block
 * between two rows would end the table. An untranslated row keeps its English
 * inside the translated table, and is counted like any other.
 *
 * @param {string} markdown The English source.
 * @param {Record<string, string>} cache Translations keyed by `blockHash`.
 * @param {{markFallback?: boolean}} [options]
 * @returns {{markdown: string, translated: number, fallback: number, titleTranslated: boolean}}
 */
export function assembleNote(markdown, cache = {}, { markFallback = false } = {}) {
  const blocks = splitBlocks(markdown);
  let out = '';
  let run = [];
  let translated = 0;
  let fallback = 0;
  let titleTranslated = false;

  const emit = (text, sep) => {
    out += out ? sep + text : text;
  };
  const flush = () => {
    if (!run.length) return;
    if (markFallback) {
      emit(ISLAND_OPEN, '\n\n');
      emit(run.join('\n\n'), '\n\n');
      emit(ISLAND_CLOSE, '\n\n');
    } else {
      emit(run.join('\n\n'), '\n\n');
    }
    run = [];
  };

  blocks.forEach((block, index) => {
    const translation = block.translatable ? cache[block.hash] : undefined;
    if (block.translatable && typeof translation === 'string') {
      translated += 1;
      if (index === 0) titleTranslated = true;
      flush();
      emit(translation, block.sep);
      return;
    }
    if (!block.translatable) {
      flush();
      emit(block.text, block.sep);
      return;
    }
    fallback += 1;
    if (index === 0 || block.row) {
      flush();
      emit(block.text, block.sep);
      return;
    }
    run.push(block.text);
  });
  flush();

  return {
    markdown: `${out}\n`,
    translated,
    fallback,
    titleTranslated,
  };
}
