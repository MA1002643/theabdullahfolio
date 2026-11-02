"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";

import { DEFAULT_LOCALE } from "@/i18n/locales";
import { intlTag } from "@/i18n/format";

// Locale plumbing shared by the /about cards (issue #82).
//
// The cards were written against English and paint numbers IMPERATIVELY —
// count-ups write `node.textContent` every frame, so there is no JSX for ICU's
// `{n, number}` to reach. These helpers are the one place those frames get
// their digits from. English keeps the exact legacy strings (`String(n)`,
// `n.toFixed(2)`, `n.toLocaleString()`), so every pinned English assertion and
// the visual baselines are byte-for-byte unchanged; every other locale goes
// through `Intl.NumberFormat(intlTag(locale))`, which is what gives Arabic its
// Arabic-Indic digits and Persian its extended ones without a lookup table.

const isEnglish = (locale) => !locale || locale === DEFAULT_LOCALE;

// One NumberFormat per (locale, shape). Count-ups call these ~120 times a
// second per counter, and constructing an Intl formatter is the expensive half
// of formatting.
const formatterCache = new Map();
function numberFormat(locale, key, options) {
  const id = `${locale}|${key}`;
  let fmt = formatterCache.get(id);
  if (!fmt) {
    fmt = new Intl.NumberFormat(intlTag(locale), options);
    formatterCache.set(id, fmt);
  }
  return fmt;
}

/**
 * Digit formatters for one locale.
 *
 *   int(n)       — a whole number with NO grouping (the legacy `String(n)` /
 *                  `${Math.round(v)}` paint used by every count-up).
 *   fixed(n, d)  — `d` decimals, no grouping (the legacy `n.toFixed(d)`).
 *   grouped(n)   — grouped thousands (the legacy `n.toLocaleString()`).
 *   pad2(n)      — two-digit zero-padded ("04"), for the sync-age clock.
 */
export function aboutDigits(locale) {
  if (isEnglish(locale)) {
    return {
      int: (n) => String(n),
      fixed: (n, d) => Number(n).toFixed(d),
      // `en-GB` rather than the runtime default: the server (Node, en-US) and a
      // British browser must paint the same grouping, and en-GB/en-US agree on
      // "1,234" — so this is the legacy output, made deterministic.
      grouped: (n) => Number(n).toLocaleString("en-GB"),
      pad2: (n) => String(n).padStart(2, "0"),
    };
  }
  return {
    int: (n) => numberFormat(locale, "int", { useGrouping: false, maximumFractionDigits: 0 }).format(n),
    fixed: (n, d) =>
      numberFormat(locale, `fixed${d}`, {
        useGrouping: false,
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      }).format(n),
    grouped: (n) => numberFormat(locale, "grouped", {}).format(n),
    pad2: (n) =>
      numberFormat(locale, "pad2", { useGrouping: false, minimumIntegerDigits: 2 }).format(n),
  };
}

/** `aboutDigits` for the active locale, memoised per locale. */
export function useAboutDigits() {
  const locale = useLocale();
  return useMemo(() => aboutDigits(locale), [locale]);
}

// Per-character reveals (card titles, the update banner) cut their text with
// `glyphUnits` from @/components/ui/textSegments — the site's one splitter,
// which keeps joining scripts (Arabic, Urdu, Persian) and Devanagari whole per
// word. Nothing here duplicates it.

// ── Dates the GitHub-stats API pre-formats in English ─────────────────────────
// /api/github-stats ships dates as en-US display strings ("Oct 12",
// "Oct 12, 2024", "Oct 1, 2025 - Present") because the streak FINGERPRINT is
// computed over them (see streakDiff.js) — changing the wire format would
// re-fire every visitor's "dates changed" banner. So the wire stays English and
// the CLIENT re-renders it for non-English readers. English renders the wire
// string untouched.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Oct 12, 2024" / "Oct 12" → a UTC Date, or null when it isn't one. */
function parseWireDate(text, now = new Date()) {
  const m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2})(?:, (\d{4}))?$/.exec(String(text ?? "").trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  // The API drops the year for the current year (formatDate in route.js).
  const year = m[3] ? Number(m[3]) : now.getUTCFullYear();
  return { date: new Date(Date.UTC(year, month, Number(m[2]))), hasYear: Boolean(m[3]) };
}

/**
 * A single wire date ("Oct 12" / "Oct 12, 2024") in the reader's language.
 * Returns the wire string itself for English or for anything unparseable
 * ("N/A", "—"), so a format the parser doesn't know degrades to today's text.
 */
export function localizeWireDate(text, locale) {
  if (isEnglish(locale)) return text;
  const parsed = parseWireDate(text);
  if (!parsed) return text;
  return new Intl.DateTimeFormat(intlTag(locale), {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(parsed.hasYear ? { year: "numeric" } : {}),
  }).format(parsed.date);
}

// English placeholder strings the API substitutes for missing values. They are
// display text, not data, so a non-English reader gets the catalogue's words;
// English keeps the wire string (identical to today).
const WIRE_PLACEHOLDERS = {
  "N/A": "notAvailable",
  "No description": "noDescription",
  Unknown: "unknown",
};

/** A wire placeholder ("N/A", "No description", "Unknown") translated; anything else unchanged. */
export function localizeWirePlaceholder(text, locale, t) {
  if (isEnglish(locale) || typeof text !== "string") return text;
  const key = WIRE_PLACEHOLDERS[text];
  return key ? t(`wire.${key}`) : text;
}

/**
 * A streak range ("Oct 1, 2025 - Present", "No current streak") in the
 * reader's language. `t` is the `About.streak` translator: the sentinels and
 * the "start – end" frame are catalogue strings, the dates are Intl.
 */
export function localizeStreakRange(range, locale, t) {
  if (isEnglish(locale) || typeof range !== "string") return range;
  const sentinels = {
    "No current streak": "noCurrent",
    "No streak found": "noneFound",
    "No data": "noData",
  };
  if (sentinels[range]) return t(`wire.${sentinels[range]}`);
  const parts = range.split(" - ");
  if (parts.length !== 2) return range;
  const side = (s) => {
    if (s === "Present") return t("wire.present");
    if (s === "N/A") return t("wire.notAvailable");
    return localizeWireDate(s, locale);
  };
  return t("wire.span", { start: side(parts[0]), end: side(parts[1]) });
}
