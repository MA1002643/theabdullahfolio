// The pseudo-locale detector (issue #82 follow-up). Pure, so the rule that
// decides "this is plain English" is unit-tested (tests/unit/pseudoDetector.
// test.js) apart from the browser crawl that feeds it (tests/i18n/pseudo.spec.js).
//
// On /en-XA every catalogue message renders as `[Ȧƀǿǿŭŭŧ ḿḗḗ]`: no ASCII letter
// survives the transform (scripts/i18n-lib.mjs `pseudoText`), and the message
// is bracketed. So an ASCII letter OUTSIDE every bracket did not come from a
// catalogue. Inside a bracket it is an interpolated value (`{name}`, a repo, a
// count) — data the message carries, not prose it forgot to translate.
//
// Text arrives as SEGMENTS in document order (one per text node). The bracket
// depth carries across segments, because a message with rich text spans
// several nodes (`[… <fig>4</fig> …]`). A word does not: a segment boundary
// ends the run, so two adjacent elements never fuse into one "word".

/** ASCII letter runs (2+ letters, inner `.'’-` allowed) at bracket depth 0. */
export function plainRuns(segments) {
  const found = [];
  let depth = 0;
  segments.forEach((segment, index) => {
    let run = '';
    const flush = () => {
      const word = run.replace(/[.'’-]+$/, '');
      if ((word.match(/[A-Za-z]/g) || []).length >= 2) found.push({ word, index });
      run = '';
    };
    for (const ch of String(segment)) {
      if (ch === '[') {
        flush();
        depth += 1;
      } else if (ch === ']') {
        flush();
        depth = Math.max(0, depth - 1);
      } else if (depth === 0 && (/[A-Za-z]/.test(ch) || (run && /[.'’-]/.test(ch)))) {
        run += ch;
      } else {
        flush();
      }
    }
    flush();
  });
  return found;
}

/**
 * The words that are allowed to stay in plain ASCII on a pseudo page, because
 * they are NAMES, not prose: they would read the same in every language. Kept
 * short on purpose — a name that appears in running text belongs in the
 * catalogue (where it is accented with the rest), and a whole block of names
 * (a tool list, a repo name, a guestbook entry) belongs under `translate="no"`,
 * the HTML attribute that already means "do not translate this".
 */
export const LITERAL_WORDS = new Set([
  // A key name, printed as on the key: sonner appends its hotkey ("alt+T")
  // to the notifications region's label, outside any message.
  'alt',
]);

/**
 * Plain-English findings for one page: `{ word, text, index }` per leak, with the
 * whole segment it sat in so the report says WHERE, deduplicated.
 */
export function leaks(segments, allow = LITERAL_WORDS) {
  const seen = new Set();
  const out = [];
  for (const { word, index } of plainRuns(segments)) {
    if (allow.has(word)) continue;
    const text = String(segments[index]).trim().replace(/\s+/g, ' ').slice(0, 120);
    const key = `${word}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ word, text, index });
  }
  return out;
}
