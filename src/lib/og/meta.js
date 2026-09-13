// Per-page metadata helper (issue #88 v2). Next merges metadata objects
// SHALLOWLY between layout and page — a page that sets `openGraph` at
// all replaces the root layout's whole openGraph object, dropping
// siteName/type/locale for that page. Every sub-page therefore builds
// its metadata through this helper, which restates the shared fields so
// no page can accidentally shed them.

import { alternatesFor } from '@/lib/seo/canonical';

const SITE = 'Muhammad Abdullah';

export function sectionMetadata({ title, description, path }) {
  const fullTitle = `${title} · ${SITE}`;
  return {
    title,
    description,
    // Self-referential canonical (issue #32, W1 / F3). It goes HERE rather
    // than in each page's own metadata export for exactly the shallow-merge
    // reason above, and the consequence is worth stating: `alternates` set on
    // a page REPLACES the root layout's `alternates` wholesale, so a route
    // that declared its own would silently shed whatever the root adds later
    // (`languages`, when #82 lands). One helper, nine section routes and all
    // eleven project pages — and no route can forget it, because forgetting
    // the helper means forgetting its title and share card too, which is
    // visible immediately.
    //
    // The homepage does NOT flow through here (it has no sectionMetadata
    // call), so its canonical is declared directly in src/app/layout.js.
    alternates: alternatesFor(path),
    openGraph: {
      type: 'website',
      locale: 'en_GB',
      siteName: SITE,
      url: path,
      title: fullTitle,
      description,
    },
    // No `images` here on purpose: this object REPLACES the root twitter
    // object (shallow merge), which is what stops sub-pages inheriting
    // the homepage's /og/home card — and the build-hashed URL of a
    // route's own card isn't knowable in config. Each route's
    // twitter-image.js (a re-export of its opengraph-image.js) supplies
    // the explicit twitter:image instead.
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
    },
  };
}
