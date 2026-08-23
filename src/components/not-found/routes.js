// Single source of truth for the site's recoverable sub-pages. Pure data — no
// React/DOM imports — so the typo matcher (suggestRoute.js) can consume it while
// still being reason-about-in-isolation, and the 404 suggestion chips
// (NotFoundClient.jsx) render from the SAME list. With one registry the matcher
// and the UI can no longer drift out of sync.
//
// Home ("/") is intentionally omitted — the TAKE ME BACK portal already covers
// it — so this list is only the sub-pages worth recovering a typo *toward*.
//
// Order matters twice over: it's the tie-break order for the matcher (first wins
// when two routes are equidistant from the typed segment) AND the left-to-right
// order of the suggestion chips. Keep the most likely guesses higher.
//
// Keep in sync with `src/app/(sub pages)/*`. Icons are a UI-only concern and
// live with the chips in NotFoundClient (keyed by `segment`), out of this pure
// data module.
export const ROUTES = [
  { segment: 'about', href: '/about', label: 'About' },
  { segment: 'projects', href: '/projects', label: 'Projects' },
  { segment: 'qualifications', href: '/qualifications', label: 'Qualifications' },
  { segment: 'contact', href: '/contact', label: 'Contact' },
  { segment: 'journey', href: '/journey', label: 'Journey' },
  { segment: 'my-past', href: '/my-past', label: 'My Past' },
];
