import { formatAge } from '@/utils/formatAge';
import { formatNumber, formatRelativeMs, intlTag } from '@/i18n/format';

// Locale-aware twins of the maintenance header's hand-rolled formatters
// (issue #82). English keeps the original compact output byte for byte — the
// strip's "2m 04s ago" ages and its digit-by-digit rolls are tuned to it — and
// every other locale goes through `Intl`, which already knows each language's
// grammar for "ago" and its own digits.

const isEnglish = (locale) => !locale || locale === 'en';

/**
 * The popover / sub-row age label. English: `formatAge` ("2m 04s ago").
 * Elsewhere: `Intl.RelativeTimeFormat` in its short style ("il y a 2 min").
 */
export function formatAgeFor(iso, now, locale) {
  if (isEnglish(locale)) return formatAge(iso, now);
  const from = Date.parse(iso);
  if (Number.isNaN(from)) return '';
  return formatRelativeMs(Math.max(0, now - from), locale, { style: 'short' });
}

/**
 * A count for a SIMPLE `{x}` message argument. ICU prints a raw number as
 * `String(n)`, which is exactly the English the strip has always shown, so
 * English gets the number untouched; other locales get their own digits.
 * (Plural arguments take the raw number everywhere — `#` formats itself.)
 */
export function localNumber(value, locale) {
  return isEnglish(locale) ? value : formatNumber(value, locale);
}

const digitCache = new Map();

/**
 * Western digits re-written in the locale's own digit set, one character at a
 * time — for the rolling-digit figures, which animate per character and so
 * cannot take a formatted string with grouping. Identity for English and for
 * every locale whose CLDR default is Latin digits.
 */
export function localDigits(text, locale) {
  const s = String(text ?? '');
  if (isEnglish(locale)) return s;
  let map = digitCache.get(locale);
  if (!map) {
    const nf = new Intl.NumberFormat(intlTag(locale), { useGrouping: false });
    map = Array.from({ length: 10 }, (_, d) => nf.format(d));
    digitCache.set(locale, map);
  }
  return s.replace(/[0-9]/g, (d) => map[Number(d)]);
}
