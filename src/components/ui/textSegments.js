// How to cut a string into pieces for per-glyph animation without breaking the
// writing system (issue #82).
//
// The site's signature motions — the PageTitle ignite, the footer's split-flap
// cascade, the per-letter hover roll — wrap every character in its own
// inline-block span. For Latin, Cyrillic, Greek, Hebrew and CJK that is
// harmless. For two families it destroys the text:
//
//   • JOINING scripts (Arabic, Persian, Urdu, Syriac, N'Ko, Mongolian...). A
//     letter's shape depends on its neighbours — initial, medial, final and
//     isolated forms — and shaping runs WITHIN an inline box, never across
//     one. Put each letter in its own box and every letter falls back to its
//     isolated form: "العربية" renders as a row of disconnected letters, which
//     reads to an Arabic speaker the way "A B O U T" reads to an English one,
//     only worse, because some words become unreadable.
//   • Brahmic ABUGIDAS (Devanagari for Hindi, and its relatives). A conjunct
//     such as "क्ष" is several code points — and, in browsers whose ICU predates
//     Unicode 15.1, several GRAPHEMES — that must be shaped as one glyph. Split
//     them and the virama shows as a stray mark.
//
// So those scripts are cut by WORD instead: each word stays one shaped run,
// and the cascade still moves, just in coarser steps. Everything else is cut
// by grapheme cluster (`Intl.Segmenter`), never by UTF-16 code unit, so an
// emoji, a flag or a letter with a combining accent stays whole. For the
// site's own English the result is byte-identical to the old `split('')`.

// Scripts whose rendering depends on shaping ACROSS letters. Deliberately
// broad: the cost of a false positive is a coarser animation, the cost of a
// false negative is broken text.
const SHAPED_SCRIPTS =
  /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Mongolian}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Myanmar}\p{Script=Khmer}\p{Script=Tibetan}]/u;

// Scripts written without spaces between words. `split(' ')` returns one
// giant "word" for a Japanese sentence, which as a `nowrap` run can never
// wrap; these are cut with the platform's dictionary-based word segmenter.
const UNSPACED_SCRIPTS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}]/u;

/** True when per-character splitting would break how `text` renders. */
export function breaksWhenSplit(text) {
  return SHAPED_SCRIPTS.test(String(text ?? ''));
}

const segmenter = (granularity) =>
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity })
    : null;

/** User-perceived characters (grapheme clusters), not code units. */
export function graphemes(text) {
  const s = String(text ?? '');
  const seg = segmenter('grapheme');
  return seg ? Array.from(seg.segment(s), (part) => part.segment) : Array.from(s);
}

/**
 * The units a per-glyph animation should wrap, in order, spaces included as
 * their own single-space units. Graphemes for most text; whole words (and the
 * spaces between them) for scripts that shape across letters.
 */
export function glyphUnits(text) {
  const s = String(text ?? '');
  if (!breaksWhenSplit(s)) return graphemes(s);
  return s.split(/( )/).filter((unit) => unit !== '');
}

/**
 * Words with the gap that precedes each one, for animations that move word by
 * word (the privacy notice's fire ramp, the split-flap cascade). Spaced text
 * splits on single spaces exactly as `text.split(' ')` did, so English output
 * is unchanged; unspaced scripts (Chinese, Japanese) are cut into SCRIPT RUNS
 * so they still break into pieces and can still wrap.
 *
 * Not `Intl.Segmenter({ granularity: 'word' })`, which this used to be: its
 * Chinese/Japanese cuts come from a dictionary, and Chromium ships a smaller
 * one than Node's full ICU. The same sentence was cut differently on the server
 * and in the browser, the spans did not match, and /ja/about threw a hydration
 * error (React #418) — found by the localized browser checks (issue #82
 * follow-up). A cut that decides which elements render must give the same
 * answer on every runtime, so this one is a pure function of the characters:
 *
 *   • each Han character and each hiragana is a chunk of its own — CJK line
 *     breaking allows a break between almost any two of them, and a run of
 *     them (a whole Chinese sentence is one) must never become one unbreakable
 *     `nowrap` piece;
 *   • a katakana run (a loanword, with the long-vowel mark ー) and a Latin
 *     word stay whole: ウェブ, JavaScript;
 *   • punctuation stays on the chunk before it, so no line starts with 、 or 。;
 *     an opening bracket instead joins the chunk after it;
 *   • Thai and Lao, which have no script changes to cut on, go per grapheme
 *     cluster — still a break opportunity everywhere, and clusters never split
 *     a shaped glyph.
 *
 * @returns {{ word: string, gap: string }[]} `gap` is ' ' or ''.
 */
const RUN_CLASSES = [
  ['katakana', /[\p{Script=Katakana}\u30fc\uff70]/u],
  // One chunk per grapheme: Han and hiragana (any boundary may break), Thai
  // and Lao (clusters keep shaped glyphs whole).
  ['cluster', /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Thai}\p{Script=Lao}]/u],
  ['open', /[\p{Ps}\p{Pi}]/u],
  ['punct', /[\p{P}\p{S}]/u],
];

const runClass = (unit) => {
  for (const [name, re] of RUN_CLASSES) if (re.test(unit)) return name;
  return 'other';
};

export function wordChunks(text) {
  const s = String(text ?? '');
  if (!UNSPACED_SCRIPTS.test(s)) {
    return s.split(' ').map((word, i) => ({ word, gap: i > 0 ? ' ' : '' }));
  }
  const out = [];
  let gap = '';
  let current = null;
  let currentClass = null;
  const push = () => {
    if (current) out.push(current);
    current = null;
    currentClass = null;
  };
  for (const unit of graphemes(s)) {
    if (/^\s+$/.test(unit)) {
      push();
      gap = ' ';
      continue;
    }
    const cls = runClass(unit);
    const joins =
      Boolean(current) &&
      cls !== 'open' &&
      (cls === 'punct' || currentClass === 'open' || (cls === currentClass && cls !== 'cluster'));
    if (!joins) {
      push();
      current = { word: '', gap: out.length > 0 ? gap : '' };
      gap = '';
    }
    current.word += unit;
    // A chunk that began with an opening bracket takes on the class of the
    // first real character after it.
    if (currentClass === 'open' && cls !== 'open') currentClass = cls;
    else if (cls !== 'punct' || !currentClass) currentClass = cls;
  }
  push();
  return out;
}
