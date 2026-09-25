// /sitemap.xml (issue #32, W1). GENERATED, never hand-maintained (P1).
//
// The site had no sitemap at all before this (verified: 404 in production),
// which left 21 indexable URLs undeclared and made `/projects/1`…`/projects/11`
// reachable only by a crawler successfully rendering and then following the
// `/projects` listing — a single point of failure for the entire project corpus
// (F8).
//
// ── Why this file hand-lists nothing ────────────────────────────────────────
// Two sources feed it and both are already the source of truth for something
// else:
//
//   • `ROUTES` (src/lib/seo/site.js) — the same registry the canonical builder,
//     robots.js and llms.txt read.
//   • `projectsData` (src/app/data.js) — the SAME array
//     `generateStaticParams()` enumerates in
//     src/app/(sub pages)/projects/[id]/page.js.
//
// That second one is a correctness requirement, not a convenience. That route
// sets `dynamicParams = false`, so any URL NOT produced by
// `generateStaticParams()` is rejected at the routing layer with a 404. A
// hand-listed sitemap entry for a project that had been removed from the data
// would therefore declare a URL that answers 404 — the exact class of error
// Search Console reports as a coverage failure. Deriving both from one array
// makes the two provably equal (risk §10.3).
//
// tests/unit/sitemapDrift.test.js enforces the other direction: a new `page.js`
// on disk with no registry entry fails CI.

import { projectsData } from '@/app/data';
import { readNotes } from '@/lib/notes/readNotes';
import { absoluteUrl } from '@/lib/seo/canonical';
import { lastModifiedFor } from '@/lib/seo/lastModified';
import {
  CV_ASSET,
  ROUTES,
  SHARED_ROUTE_SOURCES,
  SUB_PAGE_SHARED_SOURCES,
} from '@/lib/seo/site';

// Static: the registry and the project data are both build-time constants, and
// `lastModifiedFor` shells out to git — which must happen at build, never per
// request.
export const dynamic = 'force-static';

// Every project page shares one modification source set. Computed once rather
// than per project: all 11 are rendered by the same template from the same
// data file, so the answer is identical for each and would otherwise cost 11
// git spawns to learn that.
//
// `src/components/project-detail`, NOT `src/components/projects`. The two are a
// sibling pair with confusingly similar names and this list named the wrong one
// until 2026-09-12. `components/projects` renders the /projects LISTING — the
// cards, the filter tabs, the scene behind them — and is already the listing
// route's own `sources` entry in site.js; the detail route imports nothing from
// it. The detail route renders out of `components/project-detail` (the aurora,
// the lantern sweep, the intro headline, the scene loader and the WebGL scene
// behind it).
//
// Naming the listing directory here broke `<lastmod>` in BOTH directions, which
// is why it is worth a paragraph. A change to the detail scene, intro or loader
// left all eleven dates untouched — the stale half, and the obvious one. But a
// change to a listing card also re-stamped all eleven detail URLs as modified,
// which is a date asserting a change that did not happen to those documents:
// the same fabrication `new Date()` would commit, arrived at by aliasing rather
// than by reading the clock. P4 rules out both.
//
// `SHARED_ROUTE_SOURCES` is appended for the same reason it is appended to every
// registry entry — see the note beside it in site.js. Two of its three entries
// are imported here outright: the detail page calls `projectPage(project)` from
// `schema.js`, which in turn calls `absoluteUrl` from `canonical.js`. The third,
// the registry itself, is reached only TRANSITIVELY through those two — they
// read `ORIGIN` for the canonical each page declares about itself and for the
// `@id`s, and `IDENTITY` for the `Person` the page points its authorship at.
// Editing the site identity, the URL normaliser or the graph's shape rewrites
// all eleven documents, so each has to move their date.
//
// Pinned by the `project detail sources` cases in tests/unit/sitemapDrift.test.js,
// which resolve this route's real import graph off disk.
export const PROJECT_SOURCES = [
  'src/app/(sub pages)/projects/[id]/page.js',
  'src/app/data.js',
  'src/components/project-detail',
  // Detail-only, and therefore listed here rather than in either shared set:
  // `projectMetaDescription()` composes each project's meta description from
  // the record's own facts instead of reusing its on-page blurb, so a change to
  // how that sentence is built rewrites the snippet a crawler displays for all
  // eleven URLs — and no other route calls it.
  'src/lib/seo/projectMeta.js',
  // The `programmingLanguage` source and its reader. Detail-only for the same
  // reason as projectMeta.js above — no other route publishes a language claim
  // — and BOTH are listed because they fail differently: the JSON changes when
  // a refresh finds new languages (a change to what is published), and the
  // reader changes when the withholding rules change (also a change to what is
  // published, for a different set of projects). Watching only the reader would
  // leave a refreshed language list insisting the documents were unchanged.
  'src/lib/seo/projectLanguages.js',
  'src/data/project-languages.json',
  // The detail route's own card handlers. Listed as files for the same reason
  // the entry above names `page.js` rather than the directory — `[id]/` also
  // holds `loading.js`, which renders nothing a crawler reads — and they are
  // detail-only: these two draw the card for all ELEVEN project URLs, so an
  // edit to either redraws every project preview on the site. Nothing else
  // watches them, because a page does not import its `opengraph-image.js`;
  // Next composes the two, so no dependency walk can reach them.
  'src/app/(sub pages)/projects/[id]/opengraph-image.js',
  'src/app/(sub pages)/projects/[id]/twitter-image.js',
  ...SHARED_ROUTE_SOURCES,
  // These eleven live inside the `(sub pages)` group too, so they render the
  // group layout, its footer and its two nav links, and take their metadata
  // through `sectionMetadata()` exactly as the eight section routes do.
  ...SUB_PAGE_SHARED_SOURCES,
];

// What every note page renders from BESIDES its own markdown file: the route
// template, the reader that parses it, and the shared sets every route carries.
// Listed separately from the per-note source so `lastModifiedFor` can date each
// document by its own history while still moving all of them when the template
// or the parser changes — which genuinely does rewrite every note.
export const NOTE_SHARED_SOURCES = [
  'src/app/(sub pages)/notes/[slug]/page.js',
  'src/lib/notes/readNotes.js',
  // The description composer and the window it measures against. `readNotes`
  // attaches the finished string to every record, so a change to either one
  // rewrites what EVERY note publishes as its meta description and as its
  // `TechArticle` description — a change to the documents' metadata that the
  // documents themselves cannot show, which is precisely the case `<lastmod>`
  // is here to carry.
  'src/lib/seo/noteMeta.js',
  'src/lib/seo/descriptionWindow.js',
  // The detail route's own card handlers, listed for exactly the reason the
  // eleven project pages list theirs: a page does not import its
  // `opengraph-image.js` — Next composes the pair by convention — so no
  // dependency walk can reach them, and the omission is invisible in review
  // because nothing looks wrong at either end.
  //
  // These two draw the preview for EVERY note URL. Redraw one and what every
  // crawler and unfurler DISPLAYS for the document changes, while the markup
  // does not move (the `<meta>` tag keeps the same URL), so `<lastmod>` is the
  // only signal there is — and it was swearing the documents were unchanged.
  'src/app/(sub pages)/notes/[slug]/opengraph-image.js',
  'src/app/(sub pages)/notes/[slug]/twitter-image.js',
  ...SHARED_ROUTE_SOURCES,
  ...SUB_PAGE_SHARED_SOURCES,
];

export default function sitemap() {
  // `lastModified` is omitted (undefined) wherever git cannot answer — see the
  // module note in src/lib/seo/lastModified.js. Next drops undefined fields, so
  // no URL ever carries a fabricated date (P4).
  const routeEntries = ROUTES.filter((route) => route.indexable).map(
    (route) => ({
      url: absoluteUrl(route.path),
      lastModified: lastModifiedFor(route.sources),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    }),
  );

  const projectLastModified = lastModifiedFor(PROJECT_SOURCES);
  const projectEntries = projectsData.map((project) => ({
    url: absoluteUrl(`/projects/${project.id}`),
    lastModified: projectLastModified,
    changeFrequency: 'monthly',
    // Below the /projects listing (0.9) that collects them, above /my-past.
    // These are the pages carrying the most specific, most rankable content on
    // the site, so they sit high.
    priority: 0.7,
  }));

  // The engineering notes (W8), one URL per document in `docs/`. Generated from
  // the SAME `readNotes()` call that `generateStaticParams()` enumerates in
  // src/app/(sub pages)/notes/[slug]/page.js — the identical correctness
  // requirement the project pages have, and for the identical reason: that
  // route sets `dynamicParams = false`, so a sitemap entry for a slug the
  // reader does not produce would declare a URL answering 404.
  //
  // `lastModified` is computed PER NOTE rather than once for the set. Unlike
  // the eleven project pages — which share a template and a data file, so any
  // edit genuinely does touch all of them — each note is its own document with
  // its own history, and dating them together would restamp every note whenever
  // one was edited.
  const noteEntries = readNotes().map((note) => ({
    url: absoluteUrl(`/notes/${note.slug}`),
    lastModified: lastModifiedFor([note.source, ...NOTE_SHARED_SOURCES]),
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  // The CV PDF (W1b). Declared because it is indexable BY DECISION — leaving a
  // deliberately-indexed document to be discovered through a footer link only
  // is exactly the accidental posture F6 was about.
  const cvEntry = {
    url: absoluteUrl(CV_ASSET.path),
    lastModified: lastModifiedFor(CV_ASSET.sources),
    changeFrequency: CV_ASSET.changeFrequency,
    priority: CV_ASSET.priority,
  };

  return [...routeEntries, ...projectEntries, ...noteEntries, cvEntry];
}
