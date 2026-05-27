// Shared month / year duration helpers for the experience summary. All
// month math is in *whole calendar months elapsed* (exclusive) — Feb 2026
// → May 2026 = 3, not 4 — so the same formula works for closed ranges
// and for "Current" ranges measured against today. Display formatting
// follows the "X+ years/months" convention from the issue #17 spec.

// Lowercase month-name → 0-indexed month for `new Date(year, month, 1)`.
// Both 3-letter and full names so the parser tolerates either form on
// the resume (the current CV uses 3-letter, but spec allows long form).
const MONTH_INDEX = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

// Whole calendar months between two Dates (exclusive end). Negative if
// `end` precedes `start`; clamped to 0 by the caller when that's
// nonsensical (e.g. employment span). Day-of-month is intentionally
// ignored so "Feb 2026 → Apr 5 2026" still reads as 2 months.
// UTC accessors used throughout so the result is independent of the
// server's local timezone — Vercel functions run in UTC, but local
// `npm run dev` in any non-UTC zone (BST, PST, etc.) would otherwise
// drift the month boundary across midnight and produce off-by-one
// months for first-of-month inputs.
export function monthsBetween(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) return 0;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth())
  );
}

// Human-readable duration matching the spec: "5+ years", "2+ months",
// "1+ year" (singular for exactly-1). The "+" suffix signals "at least"
// since we floor partial years and don't double-count partial months.
// `formatDuration(0)` returns "0+ months" — caller can decide whether to
// hide that, but the helper itself returns a valid string for every
// non-negative input.
export function formatDuration(months) {
  const m = Math.max(0, Math.floor(Number(months) || 0));
  if (m >= 12) {
    const years = Math.floor(m / 12);
    return `${years}+ ${years === 1 ? "year" : "years"}`;
  }
  return `${m}+ ${m === 1 ? "month" : "months"}`;
}

// Parse a single date token from the resume PDF. Tolerates the formats
// the spec enumerates plus the variants actually present in the current
// CV: "Feb 2026", "Feb/2026", "February 2026", "2024", and the literal
// "Current" / "Present" sentinels (both treated as today). Returns a
// Date pinned to the first of the month, or null on anything it can't
// recognize — callers should treat null as "skip this role" rather than
// guessing, so an unexpected format produces no role rather than a wrong
// one.
export function parseResumeDateToken(token) {
  if (typeof token !== "string") return null;
  const t = token.trim().toLowerCase();
  if (t.length === 0) return null;

  // Open-ended endpoint. Spec lists "Current"; resumes in the wild also
  // commonly use "Present". Treating both as "now" since the next
  // monthsBetween call quantizes to month granularity anyway.
  if (t === "current" || t === "present") return new Date();

  // All constructed dates pin to the 1st of the month at 00:00 UTC so
  // downstream `.toISOString().slice(0, 10)` formatting can't drift
  // across a day boundary based on the server's timezone. `Date.UTC`
  // is the only constructor form that produces a deterministic instant
  // for a given (year, month, day) tuple regardless of process locale.

  // "<month> <year>" with space, slash, or hyphen separator. The
  // hyphen form is unusual but cheap to accept; the slash form is in
  // the spec. `[\s/-]+` (NOT `[\s/-]`) tolerates collapsed-but-still-
  // multiple separator runs — PDF text extraction commonly produces
  // tokens like "Feb  2024" (two spaces) or "Feb \t2024", which the
  // single-char form silently failed to match and dropped the entire
  // role from the aggregate.
  const monthYear = t.match(/^([a-z]+)[\s/-]+(\d{4})$/);
  if (monthYear) {
    const month = MONTH_INDEX[monthYear[1]];
    const year = parseInt(monthYear[2], 10);
    if (month !== undefined && !Number.isNaN(year)) {
      return new Date(Date.UTC(year, month, 1));
    }
  }

  // Bare year ("2024") — falls back to January so duration math still
  // works. Loses the start-of-year precision but no resume omits month
  // for ongoing roles in practice; this is for closed-range fallbacks.
  const yearOnly = t.match(/^(\d{4})$/);
  if (yearOnly) {
    const year = parseInt(yearOnly[1], 10);
    if (!Number.isNaN(year)) return new Date(Date.UTC(year, 0, 1));
  }

  return null;
}
