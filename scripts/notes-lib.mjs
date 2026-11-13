// Checks and transforms for translated note blocks (docs/i18n/, 2026-11-10).
// Pure functions, shared by scripts/notes-translate.mjs, scripts/i18n-pseudo.mjs
// and the unit tests (tests/unit/notesTranslation.test.js).
//
// The model is TOLD to keep the markdown intact. `markdownProblems` is what
// makes that true: a translation that loses an inline code span, changes a
// link's target, drops a table cell or a list item is rejected and retried
// with the problem stated, exactly as `icuProblems` does for the catalogues.

import { pseudoText } from './i18n-lib.mjs';

// Inline code first, so everything after it is measured on the text with the
// code taken out: a `<lastmod>` inside backticks is code, not an HTML tag.
const CODE_SPAN = /(`+)[\s\S]*?\1/g;
const LINK_TARGET = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const HTML_TAG = /<\/?([a-zA-Z][\w-]*)\b[^>]*>/g;
const BARE_URL = /https?:\/\/[^\s)<>\]`"]+/g;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s/;

const sorted = (list) => [...list].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const all = (text, re) => [...text.matchAll(re)].map((m) => m[0]);
const withoutCode = (text) => text.replace(CODE_SPAN, ' ');
/** Pipes that delimit cells: not escaped, not inside code. */
const pipes = (line) => (withoutCode(line).replace(/\\\|/g, '').match(/\|/g) ?? []).length;

/**
 * Why a translated block is not a faithful markdown copy of its English, as a
 * list of human-readable problems (empty when it is).
 *
 * @param {string} english
 * @param {string} translation
 * @returns {string[]}
 */
export function markdownProblems(english, translation) {
  if (typeof translation !== 'string' || !translation.trim()) return ['empty translation'];
  const problems = [];

  // Every English span must survive, as many times as it appears. An EXTRA
  // span is allowed: a translator that sets one more term in backticks
  // changes the typography of a word, not the markdown, and rejecting it
  // left ten blocks in English on the first full run (2026-11-10).
  const enCode = all(english, CODE_SPAN);
  const pool = all(translation, CODE_SPAN);
  const missing = enCode.filter((span) => {
    const at = pool.indexOf(span);
    if (at < 0) return true;
    pool.splice(at, 1);
    return false;
  });
  if (missing.length) {
    problems.push(
      `inline code must be copied verbatim; missing or altered: ${missing.slice(0, 3).join(' ')}`,
    );
  }

  const enText = withoutCode(english);
  const trText = withoutCode(translation);
  const enLinks = [...enText.matchAll(LINK_TARGET)].map((m) => m[1]);
  const trLinks = [...trText.matchAll(LINK_TARGET)].map((m) => m[1]);
  if (!same(enLinks, trLinks)) problems.push(`link targets must be unchanged: ${enLinks.join(' ') || '(none)'}`);

  const enTags = [...enText.matchAll(HTML_TAG)].map((m) => m[0]);
  const trTags = [...trText.matchAll(HTML_TAG)].map((m) => m[0]);
  if (!same(enTags, trTags)) problems.push(`HTML tags must be unchanged: ${enTags.join(' ') || '(none)'}`);

  const strip = (t) => t.replace(LINK_TARGET, ']');
  if (!same(all(strip(enText), BARE_URL), all(strip(trText), BARE_URL))) {
    problems.push('bare URLs must be unchanged');
  }

  const enLines = english.split('\n');
  const trLines = translation.split('\n');

  const lead = (line) => line.match(/^\s*/)[0];
  if (lead(enLines[0]) !== lead(trLines[0])) problems.push('keep the first line\'s indentation exactly');

  const heading = (line) => line.match(/^\s*(#{1,6})\s/)?.[1] ?? '';
  if (heading(enLines[0]) !== heading(trLines[0])) problems.push(`keep the heading level (${heading(enLines[0]) || 'not a heading'})`);

  const quote = (lines) => lines.filter((l) => /^\s*>/.test(l)).length > 0;
  if (quote(enLines) !== quote(trLines)) problems.push('keep the blockquote markers (>)');

  const enRows = enLines.filter((l) => /^\s*\|/.test(l));
  const trRows = trLines.filter((l) => /^\s*\|/.test(l));
  if (enRows.length !== trRows.length) {
    problems.push(`a table must keep ${enRows.length} row(s), one per line (yours has ${trRows.length})`);
  } else {
    enRows.forEach((row, i) => {
      if (pipes(row) !== pipes(trRows[i])) {
        problems.push(`table row ${i + 1} must keep ${pipes(row)} cell separator(s) "|" (do not add or remove "|" in cell text)`);
      }
    });
  }

  const items = (lines) =>
    lines.map((l) => l.match(LIST_ITEM)).filter(Boolean).map((m) => `${m[1].length}:${/\d/.test(m[2]) ? '1.' : m[2]}`);
  const enItems = items(enLines);
  const trItems = items(trLines);
  if (enItems.join() !== trItems.join()) {
    problems.push(
      enItems.length === 0
        ? 'a line in your answer starts with a list marker (such as "1." or "-"), which markdown would turn into a list; re-wrap so no line starts with one'
        : `keep the list's ${enItems.length} item(s), markers and indentation (yours has ${trItems.length})`,
    );
  }

  if (/^\s*(`{3,}|~{3,})/m.test(translation)) problems.push('do not add a code fence');

  const strong = (t) => (withoutCode(t).match(/\*\*/g) ?? []).length;
  if (strong(translation) % 2 !== strong(english) % 2) problems.push('unbalanced ** emphasis markers');

  return problems;
}

// What the pseudo transform must never touch: code, link targets, HTML tags,
// URLs and entities. Everything between them is text.
const LITERAL = new RegExp(
  [CODE_SPAN.source, LINK_TARGET.source, HTML_TAG.source, BARE_URL.source, '&#?\\w+;'].join('|'),
  'g',
);

/**
 * A block in the pseudo-locale: letters accented, markdown and literals kept.
 * `pseudoText` maps only a–z and A–Z, so heading, list, table and emphasis
 * syntax (none of it letters) survives untouched.
 */
export function pseudoMarkdown(block) {
  let out = '';
  let last = 0;
  for (const match of block.matchAll(LITERAL)) {
    out += pseudoText(block.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return out + pseudoText(block.slice(last));
}
