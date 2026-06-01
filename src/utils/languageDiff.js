// Language stats diffing + fingerprinting for the "Most Used Languages"
// card (issue #18). Pure, framework-agnostic JS. The fingerprint is computed
// CLIENT-side only: the /api/github-stats route deliberately does NOT ship a
// `languagesFingerprint` field (see route.js:231-235), so the sole consumer
// is the client hook (useLanguagesUpdateSignal), which derives the fingerprint
// from the returned language list to decide whether the update banner appears.
//
// Language records have the shape produced by getAllLanguages():
//   { language: string, color: string, size: number, percentage: string }
// `percentage` is a 2-decimal string ("12.34"); everything here parses it
// defensively so a number or string both work.

// Parse a percentage value (string "12.34" or number) to a finite number,
// falling back to 0 on anything unparseable so a malformed row can't poison
// the diff with NaN.
function pct(value) {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Stable fingerprint of a language list — captures both the percentages
 * and the rank order, so a reorder with identical percentages still
 * registers as a change. Format: `name:percentage:rank` per language,
 * pipe-joined. Deterministic for a given list (no hashing needed — the
 * string itself is the signature and stays compact for the top-N list).
 *
 * @param {Array<{language: string, percentage: string|number}>} languages
 * @returns {string}
 */
export function languagesFingerprint(languages) {
  if (!Array.isArray(languages)) return "";
  return languages
    .map((l, i) => `${l?.language ?? ""}:${pct(l?.percentage).toFixed(2)}:${i}`)
    .join("|");
}

// 1-based rank for human-facing copy ("#2").
const rankLabel = (index) => `#${index + 1}`;

/**
 * Diff a previous language list against the latest one.
 *
 * Detects four kinds of change — newly added language, removed language,
 * percentage delta, and rank movement — and distils them into a single
 * prioritised `summaryMessage` for the update banner (most headline-worthy
 * change wins) plus a structured `details` object for any caller that
 * wants the full picture.
 *
 * @param {Array} prev - previously-seen language list (may be null/empty)
 * @param {Array} next - latest language list
 * @returns {{
 *   hasChanges: boolean,
 *   changeType: "added"|"removed"|"percentage"|"rank"|"none",
 *   summaryMessage: string|null,
 *   details: {
 *     added: string[],
 *     removed: string[],
 *     percentChanges: Array<{language: string, from: number, to: number, delta: number}>,
 *     rankChanges: Array<{language: string, from: number, to: number}>
 *   }
 * }}
 */
export function diffLanguages(prev, next) {
  const prevList = Array.isArray(prev) ? prev : [];
  const nextList = Array.isArray(next) ? next : [];

  const prevByName = new Map(prevList.map((l, i) => [l.language, { ...l, rank: i }]));
  const nextByName = new Map(nextList.map((l, i) => [l.language, { ...l, rank: i }]));

  const added = nextList
    .filter((l) => !prevByName.has(l.language))
    .map((l) => l.language);
  const removed = prevList
    .filter((l) => !nextByName.has(l.language))
    .map((l) => l.language);

  const percentChanges = [];
  const rankChanges = [];
  for (const [name, nextEntry] of nextByName) {
    const prevEntry = prevByName.get(name);
    if (!prevEntry) continue; // new language — covered by `added`
    const from = pct(prevEntry.percentage);
    const to = pct(nextEntry.percentage);
    // Compare at 2-dp to match the fingerprint's resolution — sub-0.01
    // float noise shouldn't register as a change.
    if (from.toFixed(2) !== to.toFixed(2)) {
      percentChanges.push({ language: name, from, to, delta: to - from });
    }
    if (prevEntry.rank !== nextEntry.rank) {
      rankChanges.push({ language: name, from: prevEntry.rank, to: nextEntry.rank });
    }
  }

  const details = { added, removed, percentChanges, rankChanges };
  const hasChanges =
    added.length > 0 ||
    removed.length > 0 ||
    percentChanges.length > 0 ||
    rankChanges.length > 0;

  if (!hasChanges) {
    return { hasChanges: false, changeType: "none", summaryMessage: null, details };
  }

  // Prioritised single-sentence summary — rarest / most newsworthy first.
  // 1) A language entering the top list, 2) one dropping out, 3) the
  // largest percentage move, 4) a rank shuffle.
  let changeType;
  let summaryMessage;

  if (added.length === 1) {
    changeType = "added";
    summaryMessage = `${added[0]} has been added to the top languages.`;
  } else if (added.length > 1) {
    changeType = "added";
    summaryMessage = `${added.length} new languages entered the top list.`;
  } else if (removed.length === 1) {
    changeType = "removed";
    summaryMessage = `${removed[0]} dropped out of the top languages.`;
  } else if (removed.length > 1) {
    changeType = "removed";
    summaryMessage = `${removed.length} languages dropped out of the top list.`;
  } else if (percentChanges.length > 0) {
    changeType = "percentage";
    // Headline the biggest absolute move.
    const top = percentChanges.reduce((a, b) =>
      Math.abs(b.delta) > Math.abs(a.delta) ? b : a,
    );
    const dir = top.delta > 0 ? "increased" : "decreased";
    summaryMessage = `${top.language} ${dir} by ${Math.abs(top.delta).toFixed(1)}%.`;
  } else {
    changeType = "rank";
    const top = rankChanges.reduce((a, b) =>
      Math.abs(b.to - b.from) > Math.abs(a.to - a.from) ? b : a,
    );
    // Lower index = higher rank, so a decrease in index is a move *up*.
    const dir = top.to < top.from ? "up" : "down";
    summaryMessage = `${top.language} moved ${dir} to ${rankLabel(top.to)}.`;
  }

  return { hasChanges: true, changeType, summaryMessage, details };
}
