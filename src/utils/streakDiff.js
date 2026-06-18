/**
 * Diff + fingerprint helpers for the Current Streak card (issue #21).
 *
 * Both arguments have the shape of `data.stats.streaks` from
 * `/api/github-stats`:
 *
 *   {
 *     totalContributions: { value: number, dateRange: string },
 *     currentStreak:      { value: number, dateRange: string },
 *     longestStreak:      { value: number, dateRange: string },
 *   }
 *
 * Either may be null/undefined — `prev` is null on the first load (no snapshot
 * yet) and the whole object can be missing while a fetch is in flight — so the
 * caller can pass raw state without pre-guarding.
 *
 * NOTE on the payload shape vs. the original issue spec: the route exposes a
 * pre-formatted `dateRange` STRING per block, not separate start/end fields, so
 * date-change detection diffs that string (a `changed` boolean) rather than
 * per-endpoint `currentStreakStart` / `currentStreakEnd` deltas. The
 * `totalContributions` block's range is the rolling 1-year window
 * ("<a year ago> - Present"), which shifts every day even when nothing
 * meaningful changed — so its date is deliberately EXCLUDED from both the diff
 * and the fingerprint to avoid a spurious "dates changed" banner on every
 * day-rollover. Its numeric `value` is still tracked. The current/longest
 * ranges are stable unless the streak itself moves, so those are included.
 */

// Coerce any value to a finite number. `?? 0` (not `|| 0`) preserves a real 0;
// `Number(...)` tolerates a future string-typed payload. Mirrors statsDiff.
function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Normalise a streak block ({ value, dateRange }) into a comparable shape.
function block(streaks, key) {
  const b = streaks?.[key] ?? {};
  return { value: num(b.value), dateRange: String(b.dateRange ?? "") };
}

function emptyCount() {
  return { prev: 0, current: 0, delta: 0, increased: false };
}

function emptyDates() {
  return { prev: "", current: "", changed: false };
}

function emptyDiff(hasChanged = false) {
  return {
    hasChanged,
    changes: {
      totalContributions: emptyCount(),
      currentStreak: emptyCount(),
      longestStreak: emptyCount(),
      currentStreakDates: emptyDates(),
      longestStreakDates: emptyDates(),
    },
    summaryMessage: "",
  };
}

/**
 * Compare two streak snapshots. Returns `{ hasChanged: false, ... }` (full
 * shape, all zeros) when there's nothing meaningful to announce: first load
 * (`prev` null), either snapshot missing, or no tracked field moved.
 *
 * `summaryMessage` joins the changed fields with " | ", e.g.
 * `"Total Contributions +12 | Current Streak +2"` or
 * `"Longest Streak +5 | Current Streak dates changed"`. A block's value delta
 * takes precedence over its date change (a streak that grows changes both, and
 * the count is the more informative line), so "dates changed" only appears for
 * a block whose value held but whose range moved.
 *
 * @param {object|null} prev - previous streak snapshot, or null on first load
 * @param {object|null} next - latest streak snapshot
 */
export function computeStreakDiff(prev, next) {
  if (!prev || !next) return emptyDiff(false);

  const p = {
    total: block(prev, "totalContributions"),
    current: block(prev, "currentStreak"),
    longest: block(prev, "longestStreak"),
  };
  const c = {
    total: block(next, "totalContributions"),
    current: block(next, "currentStreak"),
    longest: block(next, "longestStreak"),
  };

  const countField = (a, b) => {
    const delta = b.value - a.value;
    return { prev: a.value, current: b.value, delta, increased: delta > 0 };
  };
  const dateField = (a, b) => ({
    prev: a.dateRange,
    current: b.dateRange,
    changed: a.dateRange !== b.dateRange,
  });

  const changes = {
    totalContributions: countField(p.total, c.total),
    currentStreak: countField(p.current, c.current),
    longestStreak: countField(p.longest, c.longest),
    currentStreakDates: dateField(p.current, c.current),
    longestStreakDates: dateField(p.longest, c.longest),
  };

  const messages = [];
  const pushCount = (label, field) => {
    if (field.delta !== 0) {
      const sign = field.delta > 0 ? "+" : "";
      messages.push(`${label} ${sign}${field.delta}`);
      return true;
    }
    return false;
  };

  // Value deltas first (most informative). A block's value move suppresses its
  // own "dates changed" note since the two co-occur when a streak grows.
  pushCount("Total Contributions", changes.totalContributions);
  const currentCounted = pushCount("Current Streak", changes.currentStreak);
  const longestCounted = pushCount("Longest Streak", changes.longestStreak);

  if (!currentCounted && changes.currentStreakDates.changed) {
    messages.push("Current Streak dates changed");
  }
  if (!longestCounted && changes.longestStreakDates.changed) {
    messages.push("Longest Streak dates changed");
  }

  const hasChanged = messages.length > 0;
  return { hasChanged, changes, summaryMessage: messages.join(" | ") };
}

// The three count blocks (the date ranges are tracked separately and never pulse).
const STREAK_COUNT_FIELDS = ["totalContributions", "currentStreak", "longestStreak"];

/**
 * From a `computeStreakDiff` result, the count-block keys whose value INCREASED
 * this cycle — a subset of
 * `['totalContributions','currentStreak','longestStreak']`. Powers the Current
 * Streak card's post-banner heartbeat on each risen number + its label. Only
 * increases pulse (a broken streak / recount never does), matching the "going
 * up" intent and the stats/languages cards' rise-only rule. Date-range changes
 * are intentionally excluded.
 *
 * @param {object|null} diff - the object returned by `computeStreakDiff`
 * @returns {Array<'totalContributions'|'currentStreak'|'longestStreak'>}
 */
export function streakIncreasedFields(diff) {
  if (!diff || !diff.changes) return [];
  return STREAK_COUNT_FIELDS.filter((k) => diff.changes[k]?.increased);
}

/**
 * Deterministic fingerprint of a streak snapshot — a stable, ordered signature
 * of exactly the fields `computeStreakDiff` tracks (the three values + the
 * current/longest date ranges; the rolling totalContributions range is
 * excluded for the reason documented above). Computed client-side from the
 * data itself (not a server field) so it also works on the bundled fallback
 * and can never drift from a server value. Returns null for an absent payload
 * so the caller can skip recording a baseline until real data lands.
 *
 * @param {object|null} streaks
 * @returns {string|null}
 */
export function streakFingerprint(streaks) {
  if (!streaks || typeof streaks !== "object") return null;
  // Placeholder guard: the About page seeds state with `streaks: {}` while the
  // first fetch is in flight (the loading/default shape). That empty object has
  // NONE of the tracked blocks, so without this check `block()` would coerce
  // each to `{ value: 0, dateRange: "" }` and return a non-null all-zeros
  // fingerprint — which the hook would record as a baseline, then flag a false
  // "updated" banner the instant the first real streak payload arrived. Treat a
  // payload missing every expected block as ABSENT so the baseline is only
  // recorded once real data is present.
  const hasRealBlock =
    "totalContributions" in streaks ||
    "currentStreak" in streaks ||
    "longestStreak" in streaks;
  if (!hasRealBlock) return null;
  const total = block(streaks, "totalContributions");
  const current = block(streaks, "currentStreak");
  const longest = block(streaks, "longestStreak");
  // Pipe-joined ordered signature. JSON.stringify of an explicitly-ordered
  // tuple keeps it deterministic without depending on object key order.
  return JSON.stringify([
    total.value,
    current.value,
    current.dateRange,
    longest.value,
    longest.dateRange,
  ]);
}
