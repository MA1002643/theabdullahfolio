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
