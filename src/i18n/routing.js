import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, ROUTED_LOCALE_CODES } from './locales';

// Routing for issue #82. Three settings here are deliberate departures from
// next-intl's defaults, and each one protects something the site already had.
//
// `localePrefix: 'as-needed'` — English stays UNPREFIXED. Every URL Search
// Console has indexed, every canonical the #32 work declared and every inbound
// link names `ma.codes/about`; prefixing the default locale would 308 the whole
// site and restart its indexing history. `/en/about` still resolves, by
// redirecting to `/about`, so there is exactly one English URL per page.
//
// `localeDetection: false` — no implicit redirects. Google recommends against
// locale-adaptive redirects (its crawler sends no Accept-Language and would only
// ever see one version), and a shared English link should open in English. The
// one redirect this site does make — honouring an EXPLICIT choice stored in
// `NEXT_LOCALE` — lives in src/proxy.js, where it can be scoped to that cookie.
//
// `localeCookie: false` — next-intl would otherwise write the cookie on every
// prefixed document request, turning "I followed a link to /ja/about once" into
// a sticky preference. The cookie is written ONLY by the language selector,
// which is what makes it a choice rather than a trace (and what the privacy
// inventory can truthfully describe as strictly necessary).
//
// `alternateLinks: false` — hreflang is published in the HTML <head> by
// `alternatesFor()` instead, where it can be omitted for the English-only
// note pages. The middleware's `Link` header would advertise translations of
// documents that are not translated.
export const routing = defineRouting({
  // The public locales, plus the CI-only pseudo-locale when the build enables
  // it (src/i18n/locales.js).
  locales: ROUTED_LOCALE_CODES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
  localeDetection: false,
  localeCookie: false,
  alternateLinks: false,
});
