// The site's route list for every page's ⌘K "Navigate" section — pure data,
// like not-found/routes.js. Three palettes (journey, guestbook, uses) used to
// each carry a private copy of this array, which is exactly how a new route
// goes missing from one of them; now they all read from here and drop only
// their own entry (`routesExcept`). The palette COMPONENT stays page-agnostic
// — this is config the page configs share, not palette behaviour.
export const SITE_ROUTES = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Projects', href: '/projects' },
  { label: 'Qualifications', href: '/qualifications' },
  { label: 'Contact', href: '/contact' },
  { label: 'Journey', href: '/journey' },
  { label: 'Guestbook', href: '/guestbook' },
  { label: 'Uses', href: '/uses' },
  { label: 'My Past', href: '/my-past' },
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
    keywords: 'go jump route page',
    perform: () => go(r.href, r.label),
  }));
