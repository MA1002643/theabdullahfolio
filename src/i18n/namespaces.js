// Message namespaces (issue #82). One JSON file per namespace per locale, at
// `messages/{locale}/{Namespace}.json`, whose top level is the namespace's own
// keys (the file name IS the namespace).
//
// Split for two reasons. Translators review a page at a time rather than one
// 3,000-line file. And the browser only receives what it renders: every
// namespace is available to Server Components, but a Client Component only sees
// what a `NextIntlClientProvider` above it was handed, so the root layout hands
// down GLOBAL and each route's layout adds its own (see IntlScope.jsx).
//
// tests/fitness/i18nNamespaces.test.js fails when this list and
// `messages/en/` disagree, so a new file cannot be silently left unloaded.

/**
 * Rendered on every page — chrome that lives in the root or (sub pages)
 * layouts: navigation, footer, privacy notice, palette, players. The 404's
 * `NotFound` is not here: [locale]/not-found.js hands it down itself.
 * `Privacy` ships its notice only: the preference centre fetches the rest of
 * the file when it opens (components/privacy/usePrivacyCopy.jsx), and the
 * consent status panel's slice is /privacy's own.
 */
export const GLOBAL_NAMESPACES = [
  'Common',
  'Locale',
  'Nav',
  'Footer',
  'Privacy.notice',
  'Palette',
  'Spotify',
];

/** Handed down by [locale]/not-found.js alone: no other route renders it. */
export const BOUNDARY_NAMESPACES = ['NotFound'];

/**
 * Route-scoped namespaces, keyed by the route's registry path. An entry may
 * be a dotted subtree (`'Data.journey'`): `Data` mirrors all of data.js, and
 * each route's CLIENT components read one slice of it, so shipping the whole
 * namespace put /about and /uses over the 8 kB budget. Server Components see
 * every namespace regardless, which is why /cv and /qualifications (whose
 * `Data` reads all happen on the server) list none.
 */
export const ROUTE_NAMESPACES = {
  '/': ['Home', 'LiveHeader'],
  '/about': ['About', 'Experience', 'Data.categories'],
  '/cv': ['Cv'],
  '/notes': ['Notes'],
  '/projects': ['Projects', 'Data.projects', 'Data.categories'],
  '/projects/[id]': ['ProjectDetail'],
  '/qualifications': ['Qualifications'],
  '/journey': ['Journey', 'Data.journey'],
  '/uses': ['Uses', 'Data.uses'],
  '/contact': ['Contact', 'Composer'],
  '/my-past': ['MyPast'],
  '/guestbook': ['Guestbook', 'Composer'],
  '/privacy': ['PrivacyPage', 'Privacy.status'],
  '/notes/[slug]': ['Notes'],
};

/** Server-only namespaces: metadata, never needed by a client component. */
export const SERVER_NAMESPACES = ['Meta'];

/**
 * Namespaces no route hands down whole. `UsesTools` holds a description for
 * every tool the /uses crawl can find (~100); the page hands down only the
 * curated tiles it server-renders, and the stack plate fetches the full file
 * for its locale alongside the live crawl (see useToolCopy.jsx).
 * `UsesPalette` is /uses' ⌘K copy, fetched at mount by UsesPalette.jsx and
 * never read before the palette opens.
 */
export const DEFERRED_NAMESPACES = ['UsesTools', 'UsesPalette'];

export const NAMESPACES = [
  ...new Set([
    ...[...GLOBAL_NAMESPACES, ...Object.values(ROUTE_NAMESPACES).flat()].map(
      (path) => path.split('.')[0],
    ),
    ...BOUNDARY_NAMESPACES,
    ...SERVER_NAMESPACES,
    ...DEFERRED_NAMESPACES,
  ]),
];
