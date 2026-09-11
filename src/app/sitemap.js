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
import { absoluteUrl } from '@/lib/seo/canonical';
import { lastModifiedFor } from '@/lib/seo/lastModified';
import { CV_ASSET, ROUTES } from '@/lib/seo/site';

// Static: the registry and the project data are both build-time constants, and
// `lastModifiedFor` shells out to git — which must happen at build, never per
// request.
export const dynamic = 'force-static';

// Every project page shares one modification source set. Computed once rather
// than per project: all 11 are rendered by the same template from the same
// data file, so the answer is identical for each and would otherwise cost 11
// git spawns to learn that.
const PROJECT_SOURCES = [
  'src/app/(sub pages)/projects/[id]/page.js',
  'src/app/data.js',
  'src/components/projects',
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

  // The CV PDF (W1b). Declared because it is indexable BY DECISION — leaving a
  // deliberately-indexed document to be discovered through a footer link only
  // is exactly the accidental posture F6 was about.
  const cvEntry = {
    url: absoluteUrl(CV_ASSET.path),
    lastModified: lastModifiedFor(CV_ASSET.sources),
    changeFrequency: CV_ASSET.changeFrequency,
    priority: CV_ASSET.priority,
  };

  return [...routeEntries, ...projectEntries, cvEntry];
}
