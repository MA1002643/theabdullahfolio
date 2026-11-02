import { englishAbout } from "@/i18n/sourceTranslator";

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
 * The words come from the catalogue (issue #82): `t` is the `About`
 * translator, and each moved stat is ONE message (`changes.stats.<key>`) with
 * the signed delta as an ICU number, so a language that puts the number first
 * can. `t` defaults to the English translator (src/i18n/sourceTranslator.js),
 * so a caller that passes none gets exactly the English it always did.
 *
 * @param {object|null} prevStats - previous stats snapshot, or null on first load
 * @param {object|null} currentStats - latest stats snapshot
 * @param {(key: string, values?: object) => string} [t] - `useTranslations('About')`
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

// Field keys, in the display order used for the banner message. Each one's
// SHORT-FORM banner label lives in `About.changes.stats.<key>` (messages/en/
// About.json), not the card's full stat-line label: the card shows "Total Stars
// Earned" and "Total Commits (last year)", but those would be unwieldy in a
// pipe-joined one-liner like "Total Stars +5 | Total Commits +50". The labels
// are trimmed to the core noun so the banner stays compact while still clearly
// mapping to each row.
const STAT_FIELDS = [
  { key: "stars" },
  { key: "commits" },
  { key: "prs" },
  { key: "issues" },
  { key: "contributedTo" },
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

export function computeStatsDiff(prevStats, currentStats, t = englishAbout) {
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

  for (const { key } of STAT_FIELDS) {
    const prev = num(prevStats[key]);
    const current = num(currentStats[key]);
    const delta = current - prev;
    result[key] = { prev, current, delta, increased: delta > 0 };

    if (delta !== 0) {
      result.hasChanged = true;
      // Signed delta: "+5" for a gain, "-20" for a loss — the catalogue's
      // `::sign-always group-off` skeleton prints exactly what the old
      // `${sign}${delta}` template did, in the reader's digits. Stats can move
      // either way — an unstar, a deleted PR/issue, or a recount — so both
      // directions are surfaced rather than suppressing decreases.
      if (t) messages.push(t(`changes.stats.${key}`, { delta }));
    }
  }

  result.summaryMessage = t ? messages.join(t("changes.pipe")) : "";
  return result;
}

/**
 * From a `computeStatsDiff` result, the field keys whose value INCREASED this
 * cycle — `['stars','commits','prs','issues','contributedTo']` filtered to the
 * ones that went up. Powers the GitHub Stats card's post-banner heartbeat on
 * each risen stat's label + number. Only increases are flagged (a decrease — an
 * unstar, a recount — never pulses), matching the "going up" intent and the
 * languages/repo cards' rise-only rule.
 *
 * @param {object|null} diff - the object returned by `computeStatsDiff`
 * @returns {Array<'stars'|'commits'|'prs'|'issues'|'contributedTo'>}
 */
export function statsIncreasedFields(diff) {
  if (!diff) return [];
  return STAT_FIELDS.map((f) => f.key).filter((k) => diff[k]?.increased);
}
