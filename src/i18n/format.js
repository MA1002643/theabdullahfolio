import { DEFAULT_LOCALE, localeInfo } from './locales';

// `Intl` locale tags (issue #82).
//
// The URL locale and the formatting locale are not quite the same thing. The
// site's English is BRITISH English — dates read "25 October 2026", and the
// code base has always formatted with 'en-GB' — but the URL segment is plain
// `en`. Formatting with `en` would quietly Americanise every date on the site.
// So every `Intl.*` call takes its tag from here: 'en-GB' for English, the
// registry's hreflang (`zh-Hans`, `ar`, ...) for everything else, which is also
// what makes each locale use its own CLDR numbering system without anything
// being hard-coded (Arabic-Indic digits in `ar`, extended Arabic-Indic in
// `fa`, Western digits in `ur` and `hi`, as their CLDR defaults say).

/** The BCP 47 tag to hand to `Intl.*` for a URL locale. */
export function intlTag(locale) {
  return !locale || locale === DEFAULT_LOCALE ? 'en-GB' : localeInfo(locale).hreflang;
}

const RELATIVE_STEPS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

/**
 * "5 minutes ago" / "hace 5 minutos" / "قبل ٥ دقائق" from a millisecond
 * delta (positive = in the past), via `Intl.RelativeTimeFormat`. No catalogue
 * strings: the platform already knows every language's grammar for this.
 *
 * @param {number} deltaMs Milliseconds since the moment (past is positive).
 * @param {string} locale URL locale.
 * @param {{style?: 'long'|'short'|'narrow', numeric?: 'always'|'auto'}} [options]
 */
export function formatRelativeMs(deltaMs, locale, { style = 'long', numeric = 'auto' } = {}) {
  const seconds = Math.round(Math.abs(deltaMs) / 1000);
  const sign = deltaMs >= 0 ? -1 : 1;
  const rtf = new Intl.RelativeTimeFormat(intlTag(locale), { style, numeric });
  for (const [unit, size] of RELATIVE_STEPS) {
    if (seconds >= size || unit === 'second') {
      return rtf.format(sign * Math.floor(seconds / size), unit);
    }
  }
  return rtf.format(0, 'second');
}

/** A number in the locale's own digits and grouping. */
export function formatNumber(value, locale, options) {
  return new Intl.NumberFormat(intlTag(locale), options).format(value);
}
