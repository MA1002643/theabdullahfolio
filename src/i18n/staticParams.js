import { ROUTED_LOCALE_CODES } from './locales';

/**
 * `generateStaticParams` for anything under `[locale]` that does not inherit
 * the layout's list — metadata image routes (`opengraph-image.js`) are their
 * own route handlers and would otherwise render on demand (issue #82).
 */
export function localeParams() {
  return ROUTED_LOCALE_CODES.map((locale) => ({ locale }));
}
