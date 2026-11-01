// The routes the browser layers visit (issue #92): navigation, a11y, security,
// perf. One list, so "every route" means the same set in every suite.
//
// Written out BY HAND, like the route list in tests/e2e/seo.spec.js and for the
// same reason: a suite that read src/lib/seo/site.js could only ever agree with
// the registry, and the registry being wrong is one of the things these suites
// exist to catch. The hand list is kept honest from the other side instead:
// tests/fitness/routeRegistry.test.js fails when it and the registry disagree.

/** Every indexable static route (the sitemap registry's `ROUTES`). */
export const STATIC_ROUTES = [
  '/',
  '/about',
  '/cv',
  '/notes',
  '/projects',
  '/qualifications',
  '/journey',
  '/uses',
  '/contact',
  '/my-past',
  '/guestbook',
  '/privacy',
];

/**
 * One representative of each dynamic template, plus `/notes/testing`. That is
 * the same template as the note before it, but its content is not: it is the
 * page most of its readers arrive at from outside, and its wide tables and code
 * blocks are exactly what the axe and keyboard layers check on a phone.
 */
export const DYNAMIC_SAMPLES = ['/projects/1', '/notes/discoverability', '/notes/testing'];

export const ALL_ROUTES = [...STATIC_ROUTES, ...DYNAMIC_SAMPLES];

/** A path that must answer the site's own 404. */
export const MISSING_ROUTE = '/this-route-does-not-exist-92';

/**
 * The locales the browser layers visit beyond English (issue #82 follow-up).
 * Two, chosen for being the hardest, not the most read: Arabic is right to
 * left in a joined script (bidi, mirrored layout, `dir="rtl"`), Japanese is
 * CJK with no spaces between words (line breaking, the system font stack).
 * Between them they exercise every code path a third locale would. Before
 * this, every axe scan, render check and screenshot visited English only, and
 * a reversed email address on the right-to-left footer was found by the owner
 * rather than by CI.
 */
export const LOCALE_SAMPLES = [
  { code: 'ar', dir: 'rtl' },
  { code: 'ja', dir: 'ltr' },
];

/** A site path in a locale: `/about` + `ar` → `/ar/about`, `/` → `/ar`. */
export const inLocale = (path, code) => (path === '/' ? `/${code}` : `/${code}${path}`);

/** Every route of ALL_ROUTES in every sampled locale, with what it must declare. */
export const LOCALIZED_ROUTES = LOCALE_SAMPLES.flatMap(({ code, dir }) =>
  ALL_ROUTES.map((path) => ({ path: inLocale(path, code), code, dir })),
);
