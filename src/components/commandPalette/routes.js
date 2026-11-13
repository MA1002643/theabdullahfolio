// The site's route list for every page's ⌘K "Navigate" section — pure data,
// like not-found/routes.js. Three palettes (journey, guestbook, uses) used to
// each carry a private copy of this array, which is exactly how a new route
// goes missing from one of them; now they all read from here and drop only
// their own entry (`routesExcept`). The palette COMPONENT stays page-agnostic
// — this is config the page configs share, not palette behaviour.
//
// `label` is the English name; `navKey` is where the visitor's-language name
// lives (`Nav.routes.<navKey>`, issue #82). The palette translates any action
// carrying a `navKey` at render time, so the three page configs that spread
// `routeActions(...)` need no translator of their own.
export const SITE_ROUTES = [
  { label: 'Home', href: '/', navKey: 'home' },
  { label: 'About', href: '/about', navKey: 'about' },
  { label: 'Projects', href: '/projects', navKey: 'projects' },
  { label: 'Qualifications', href: '/qualifications', navKey: 'qualifications' },
  { label: 'Contact', href: '/contact', navKey: 'contact' },
  { label: 'Journey', href: '/journey', navKey: 'journey' },
  { label: 'Guestbook', href: '/guestbook', navKey: 'guestbook' },
  { label: 'Uses', href: '/uses', navKey: 'uses' },
  { label: 'My Past', href: '/my-past', navKey: 'myPast' },
  // Added with the sitewide palette (issue #41): the three registry routes
  // the per-page palettes never listed. Every indexable route in
  // src/lib/seo/site.js is now reachable from ⌘K (tests/unit/siteActions.test.js).
  { label: 'CV', href: '/cv', navKey: 'cv' },
  { label: 'Notes', href: '/notes', navKey: 'notes' },
  { label: 'Privacy', href: '/privacy', navKey: 'privacy' },
];

// Every route except the page the palette is mounted on — nobody needs a
// "go to the page you are on" command.
export const routesExcept = (href) => SITE_ROUTES.filter((r) => r.href !== href);

// The shared action shape for a route jump. `go` is the page's navigate
// function (Ember Passage when the provider is present, router.push otherwise).
export const routeActions = (routes, go) =>
  routes.map((r) => ({
    id: `go${r.href.replace('/', '-') || '-home'}`,
    label: r.label,
    hint: r.href,
    section: 'Navigate',
    // Localisation hooks read by CommandPalette (issue #82): the label from
    // `Nav.routes.<navKey>`, the group name from `Palette.sections.navigate`,
    // and the search terms from `Palette.keywords.navigate` IN ADDITION to
    // these English ones, so `about` still finds About in every language.
    navKey: r.navKey,
    sectionKey: 'navigate',
    keywords: 'go jump route page',
    perform: () => go(r.href, r.label),
  }));
