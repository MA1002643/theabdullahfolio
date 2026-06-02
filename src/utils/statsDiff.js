/**
 * Compute a per-stat diff between two GitHub-stats snapshots (issue #19).
 *
 * Both arguments have the shape of `data.stats.stats` from
 * `/api/github-stats`: `{ stars, commits, prs, issues, contributedTo, ... }`.
 * Either may be null/undefined — `prev` is null on the first load (no
 * snapshot yet) and the whole object can be missing while a fetch is in
 * flight — so the caller can pass raw state without pre-guarding.
 *
 * Returns `{ hasChanged: false }` (plus the per-stat shape, all deltas 0)
 * when there's nothing meaningful to announce:
 *   - first load (`prev` is null), so no banner appears on a fresh visit;
 *   - either snapshot missing entirely;
 *   - both present but no tracked value changed.
 *
 * `summaryMessage` uses signed deltas joined by " | ", e.g.
 * `"Total Stars +5 | Total Commits +50 | Total PRs -2"`. Only the stats
 * that actually moved appear in the message, but every stat is present in
 * the returned object so a consumer can render a full per-stat breakdown.
 *
 * @param {object|null} prevStats - previous stats snapshot, or null on first load
 * @param {object|null} currentStats - latest stats snapshot
 * @returns {{
 *   hasChanged: boolean,
 *   stars: {prev:number,current:number,delta:number,increased:boolean},
 *   commits: {prev:number,current:number,delta:number,increased:boolean},
 *   prs: {prev:number,current:number,delta:number,increased:boolean},
 *   issues: {prev:number,current:number,delta:number,increased:boolean},
 *   contributedTo: {prev:number,current:number,delta:number,increased:boolean},
 *   summaryMessage: string,
 * }}
 */

// Field key → human label, in the display order used for the banner message.
// These are intentionally SHORT-FORM banner labels, not the card's full
// stat-line labels: the card shows "Total Stars Earned" and "Total Commits
// (last year)", but those would be unwieldy in a pipe-joined one-liner like
// "Total Stars +5 | Total Commits +50". The labels are trimmed to the core
// noun so the banner stays compact while still clearly mapping to each row.
const STAT_FIELDS = [
  { key: "stars", label: "Total Stars" },
  { key: "commits", label: "Total Commits" },
  { key: "prs", label: "Total PRs" },
  { key: "issues", label: "Total Issues" },
  { key: "contributedTo", label: "Contributed to" },
];

// Coerce any stat value to a finite number. `?? 0` (not `|| 0`) preserves a
// legitimate 0; `Number(...)` tolerates a future string-typed payload. This
// mirrors computeRepoDiff so a cached `prev` that pre-dates a field can't
// produce `NaN` deltas ("Total Stars +NaN").
function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function emptyField() {
  return { prev: 0, current: 0, delta: 0, increased: false };
}

export function computeStatsDiff(prevStats, currentStats) {
  // First load or a snapshot still missing: report no change. Returning the
  // full per-stat shape (all zeros) keeps the contract stable so callers can
  // destructure `result.stars.delta` etc. unconditionally.
  if (!prevStats || !currentStats) {
    return {
      hasChanged: false,
      stars: emptyField(),
      commits: emptyField(),
      prs: emptyField(),
      issues: emptyField(),
      contributedTo: emptyField(),
      summaryMessage: "",
    };
  }

  const result = { hasChanged: false, summaryMessage: "" };
  const messages = [];

  for (const { key, label } of STAT_FIELDS) {
    const prev = num(prevStats[key]);
    const current = num(currentStats[key]);
    const delta = current - prev;
    result[key] = { prev, current, delta, increased: delta > 0 };

    if (delta !== 0) {
      result.hasChanged = true;
      // Signed delta: "+5" for a gain, "-20" for a loss (the leading minus
      // comes free from the negative number). Stats can move either way —
      // an unstar, a deleted PR/issue, or a recount — so both directions
      // are surfaced rather than suppressing decreases.
      const sign = delta > 0 ? "+" : "";
      messages.push(`${label} ${sign}${delta}`);
    }
  }

  result.summaryMessage = messages.join(" | ");
  return result;
}
