import { formatDuration } from './dateMath';

// Employment figures for /about, derived from `journeyData` — the same array
// /journey renders, which src/app/data.js documents as the complete
// employment record.
//
// This replaced a runtime parse of public/Muhammad_Abdullah_CV.pdf. Two
// reasons, in order of importance:
//
//   1. ONE SOURCE. The CV and journeyData are separate documents that drifted
//      (Unisys was APR–JUL on one and MAY–SEP on the other), so /about and
//      /journey stated different employment histories for the same job with
//      nothing to catch it. Deriving both pages from one array makes that
//      class of disagreement unrepresentable rather than merely tested for.
//   2. The CV showed only the software roles, so /about's figure silently
//      meant "employment, as presented on a CV" while sitting next to a total
//      that meant something broader.
//
// ── Overlap is why this is not a sum ────────────────────────────────────────
// The CV's two roles were consecutive, so adding their durations happened to
// be right. journeyData's are NOT: the retail and security posts run
// concurrently with the placement and with each other (Lidl GB spans
// SEP 2021 – APR 2025, straddling Unisys entirely). Summing role durations
// would claim more months of employment than have elapsed since the first job
// started — a figure that grows faster than time.
//
// So the headline is the UNION of the intervals: months in which at least one
// role was held. Per-role durations are still reported for the breakdown
// modal's bars, which means the bars can legitimately add up to MORE than the
// headline. That is a property of holding two jobs at once, not an arithmetic
// error — someone with two concurrent roles has two durations and one span of
// having been employed.
//
// Months are EXCLUSIVE of the end month, matching `monthsBetween` in
// ./dateMath and therefore the personal-projects span this figure is drawn
// beside in the same bar. components/journey/TimelineNode deliberately uses
// the inclusive convention for its per-card tenure readout, because that is
// the one a CV or LinkedIn profile prints. Both are correct where they are.

/** Month index from `YYYY-MM`, or NaN. `2023-04` → 2023 * 12 + 3. */
function toMonthIndex(value) {
  if (typeof value !== 'string') return NaN;
  const [year, month] = value.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return NaN;
  if (month < 1 || month > 12) return NaN;
  return year * 12 + (month - 1);
}

/** Total length of a set of `[start, end)` month intervals, counting overlap once. */
function unionMonths(spans) {
  if (spans.length === 0) return 0;
  // Sort by start; then a single sweep merges anything that touches. `<=` is
  // deliberate: with exclusive ends, a role ending JUL and another starting JUL
  // are contiguous employment, not a gap.
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [openStart, openEnd] = sorted[0];
  for (const [start, end] of sorted.slice(1)) {
    if (start <= openEnd) {
      openEnd = Math.max(openEnd, end);
    } else {
      total += openEnd - openStart;
      [openStart, openEnd] = [start, end];
    }
  }
  return total + (openEnd - openStart);
}

/**
 * Employment summary from the journey record.
 *
 * Shape-compatible with what the CV parser used to return, so
 * components/about and its breakdown modal are unchanged: `{ months, display,
 * roles }` with each role carrying `{ company, role, start, end, months,
 * display }`.
 *
 * @param {Array<object>} entries `journeyData`, or any array of the same shape.
 * @param {Date} [now] Clock for open-ended roles. Injectable so tests are not
 *   time-dependent.
 * @returns {{months: number, display: string, roles: Array<object>}} Summary.
 */
export function employmentFromJourney(entries, now = new Date()) {
  // UTC for the same reason `monthsBetween` uses it: a non-UTC dev machine
  // must not shift the month boundary and move the figure by one.
  const nowIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();

  const spans = [];
  const roles = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    // `career` only. The education and milestone types share this array but are
    // not employment, and the volunteering posts sit under `milestone` — a
    // deliberate line, since counting them would inflate the figure with
    // unpaid time the CV never claimed.
    if (entry?.type !== 'career') continue;

    const startIndex = toMonthIndex(entry.start);
    if (Number.isNaN(startIndex)) continue;
    // `end: null` means still running — the array's own convention for an open
    // entry, which the atlas also closes on the live clock.
    const endIndex = entry.end == null ? nowIndex : toMonthIndex(entry.end);
    if (Number.isNaN(endIndex)) continue;

    // A future-dated or malformed span contributes nothing rather than a
    // negative, which would silently subtract from the union.
    const months = Math.max(0, endIndex - startIndex);
    spans.push([startIndex, startIndex + months]);

    // `org · role` is the split data.js documents: the role is the title's
    // first ' · ' segment, the same derivation the journey atlas uses for its
    // bar captions.
    const role = String(entry.title ?? '').split(' · ')[0] || entry.org;
    roles.push({
      company: entry.org,
      role,
      start: `${entry.start}-01`,
      end: entry.end == null ? null : `${entry.end}-01`,
      months,
      display: `${formatDuration(months)} with ${entry.org} as a ${role}`,
    });
  }

  const months = unionMonths(spans);
  return { months, display: formatDuration(months), roles };
}
