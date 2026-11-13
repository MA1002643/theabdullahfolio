// Ranked matching for the ⌘K palette (issue #41). Pure, no dependencies.
//
// The palette used to filter with `haystack.includes(query)`: every match was
// worth the same, so typing "pro" listed "Go to Projects" wherever it happened
// to sit in the registry, below a dozen keyword hits. This scores each action
// in tiers, the way a person reads a list:
//
//   label starts with the query            "Pro|jects"         1000
//   a word in the label starts with it     "Go to |Pro|jects"   800
//   the label contains it                  "Im|pro|ve"          600
//   its letters appear in order            "P|o|r|tf|o|lio"     300 − gaps
//   only the hint/keywords/section match   (no highlight)       100
//
// Within a tier, an earlier match beats a later one, so the order is total and
// deterministic: the same query always produces the same list.
//
// Folding. Matching ignores case AND diacritics, so "resume" finds "Résumé"
// and "uber" finds "Über". Folding can change a string's length ("İ" lowers
// to two code units; "é" decomposes to two and then loses its mark), so the
// label is folded one code point at a time while a map records which ORIGINAL
// index each folded unit came from. Highlight ranges are reported against the
// original label, which is what <Highlight> slices.

const MARKS = /\p{M}/gu;

/** Fold one string: lower case, no combining marks, whitespace collapsed. */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(MARKS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Folds `text` and returns the folded string plus `origin[i]`: the index in
// `text` of the code point that produced folded unit i.
function foldWithMap(text) {
  let folded = '';
  const origin = [];
  let index = 0;
  for (const ch of String(text ?? '')) {
    const piece = ch.normalize('NFD').replace(MARKS, '').toLowerCase();
    for (let k = 0; k < piece.length; k += 1) origin.push(index);
    folded += piece;
    index += ch.length;
  }
  origin.push(index);
  return { folded, origin };
}

const isWordChar = (ch) => /[\p{L}\p{N}]/u.test(ch);

// Turns folded [start, end) spans into ORIGINAL-label ranges, merging any that
// touch so a contiguous run highlights as one <mark>.
function toRanges(spans, origin, text) {
  const out = [];
  for (const [start, end] of spans) {
    const from = origin[start];
    // The end is the original index AFTER the code point of the last folded
    // unit in the span.
    const lastFrom = origin[end - 1];
    const cp = text.codePointAt(lastFrom);
    const to = lastFrom + (cp > 0xffff ? 2 : 1);
    const prev = out[out.length - 1];
    if (prev && prev[1] >= from) prev[1] = Math.max(prev[1], to);
    else out.push([from, to]);
  }
  return out;
}

/**
 * Scores `label` against an already-folded query.
 * @returns {{ score: number, ranges: Array<[number, number]> } | null}
 */
export function matchLabel(label, foldedQuery) {
  const text = String(label ?? '');
  if (!foldedQuery) return { score: 0, ranges: [] };
  const { folded, origin } = foldWithMap(text);
  const q = foldedQuery;
  const span = (at) => toRanges([[at, at + q.length]], origin, text);

  if (folded.startsWith(q)) {
    return { score: 1000 - Math.min(folded.length, 99) / 100, ranges: span(0) };
  }

  // Word-boundary prefix: the earliest occurrence preceded by a non-word char.
  for (let at = folded.indexOf(q, 1); at !== -1; at = folded.indexOf(q, at + 1)) {
    if (!isWordChar(folded[at - 1])) {
      return { score: 800 - Math.min(at, 199), ranges: span(at) };
    }
  }

  const at = folded.indexOf(q);
  if (at !== -1) return { score: 600 - Math.min(at, 199), ranges: span(at) };

  // Ordered subsequence, leftmost-greedy. Each skipped unit between two
  // matched ones costs a point, so "prj" ranks "Projects" above "Pages · json".
  const spans = [];
  let from = 0;
  let gaps = 0;
  let first = -1;
  for (const ch of q) {
    if (ch === ' ') continue;
    const hit = folded.indexOf(ch, from);
    if (hit === -1) return null;
    if (first === -1) first = hit;
    else gaps += hit - from;
    const last = spans[spans.length - 1];
    if (last && last[1] === hit) last[1] = hit + 1;
    else spans.push([hit, hit + 1]);
    from = hit + 1;
  }
  if (first === -1) return null;
  return {
    score: 300 - Math.min(gaps + first, 199),
    ranges: toRanges(spans, origin, text),
  };
}

// The secondary text an action can also be found by: what its hint says, its
// search keywords (English and translated) and the name of its group.
const secondaryText = (a) => fold(`${a.hint || ''} ${a.keywords || ''} ${a.section || ''}`);

/**
 * Scores one action. A label match wins; failing that, every word of the query
 * must appear somewhere in the label or the secondary text.
 */
export function scoreAction(action, foldedQuery) {
  const label = matchLabel(action.label, foldedQuery);
  const boost = Number.isFinite(action.boost) ? action.boost : 0;
  if (label) return { score: label.score + boost, ranges: label.ranges };
  const haystack = `${fold(action.label)} ${secondaryText(action)}`;
  const words = foldedQuery.split(' ').filter(Boolean);
  if (words.length && words.every((w) => haystack.includes(w))) {
    return { score: 100 + boost, ranges: [] };
  }
  return null;
}

/**
 * Filters and orders `actions` for `query`.
 *
 * An empty query returns every action in registry order. Otherwise only
 * matching actions survive, and the list stays grouped: sections are ordered
 * by their best-scoring member, and members within a section by score, ties
 * keeping registry order (a stable sort). Actions marked `always` are never
 * scored or filtered and keep their place at the END (the Ask command).
 *
 * @returns {{ items: object[], ranges: Map<string, Array<[number, number]>> }}
 */
export function rankActions(actions, query) {
  const q = fold(query);
  const ranges = new Map();
  if (!q) return { items: actions.filter(Boolean), ranges };

  const tail = [];
  const scored = [];
  actions.forEach((action, index) => {
    if (!action) return;
    if (action.always) {
      tail.push(action);
      return;
    }
    const hit = scoreAction(action, q);
    if (!hit) return;
    if (hit.ranges.length) ranges.set(action.id, hit.ranges);
    scored.push({ action, index, score: hit.score });
  });

  const sections = new Map();
  for (const entry of scored) {
    const key = entry.action.section ?? '';
    const group = sections.get(key);
    if (group) {
      group.members.push(entry);
      group.best = Math.max(group.best, entry.score);
    } else {
      sections.set(key, { first: entry.index, best: entry.score, members: [entry] });
    }
  }

  const byScore = (a, b) => b.score - a.score || a.index - b.index;
  const items = [...sections.values()]
    .sort((a, b) => b.best - a.best || a.first - b.first)
    .flatMap((group) => group.members.sort(byScore).map((m) => m.action));

  return { items: [...items, ...tail], ranges };
}
