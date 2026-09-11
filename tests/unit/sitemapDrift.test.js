import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { projectsData } from '@/app/data';
import { absoluteUrl } from '@/lib/seo/canonical';
import { CV_ASSET, ROUTES } from '@/lib/seo/site';

// ── The test that keeps the sitemap honest ──────────────────────────────────
// Issue #32, W5. P1 says "generated, never hand-maintained", and the sitemap IS
// generated — but generation alone does not stop it going stale. It is generated
// from the route REGISTRY, so a new page added to `src/app` with no registry
// entry is silently absent from the sitemap, from llms.txt, and from the
// canonical helper, and nothing anywhere complains.
//
// This test walks the app-router tree on disk, converts every `page.js` into the
// URL it serves, and asserts each one is either declared in the registry or
// listed in `EXCLUDED` below WITH A WRITTEN REASON. Adding a route without doing
// one of those two things fails CI.
//
// It is the single test that makes P1 real rather than aspirational, which is
// why it walks the FILESYSTEM rather than importing a list. A test that read the
// same registry the sitemap reads could only ever agree with it.

const APP_DIR = path.join(process.cwd(), 'src', 'app');

// Routes that exist on disk and are deliberately NOT in the sitemap. Every entry
// needs a reason, and the reason is the point: an unexplained exclusion is
// indistinguishable from an oversight, which is the failure this test exists to
// catch. Adding a key here is a reviewable decision.
const EXCLUDED = {
  '/not-found':
    "Next's 404 boundary. It is not a URL anyone can navigate to, and Next " +
    'marks it noindex on its own (pinned by notFoundMetadata.test.js).',
};

/**
 * Convert an app-router directory path into the URL path it serves.
 *
 * The two transformations that matter:
 *   • Route GROUPS — `(sub pages)` — are organisational only and contribute
 *     nothing to the URL, so they are stripped. Every content route on this site
 *     lives inside one, so getting this wrong would make the test compare
 *     `/(sub pages)/about` against `/about` and fail on all nine.
 *   • DYNAMIC segments — `[id]` — are kept in bracket form. They are expanded
 *     separately below, from the same `projectsData` the sitemap uses.
 *
 * @param {string} relativeDir Directory path relative to `src/app`.
 * @returns {string} The URL path, leading slash, no trailing slash.
 */
function routePathFor(relativeDir) {
  const segments = relativeDir
    .split(path.sep)
    .filter(Boolean)
    // A route group is any segment wrapped in parentheses.
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

/**
 * Every route served by a `page.js` under `src/app`.
 *
 * @returns {string[]} URL paths, `[id]` segments left in bracket form.
 */
function discoverRoutes() {
  const found = [];

  const walk = (absoluteDir, relativeDir) => {
    for (const entry of readdirSync(absoluteDir)) {
      const absolute = path.join(absoluteDir, entry);
      if (statSync(absolute).isDirectory()) {
        // `@`-prefixed directories are parallel-route slots and `_`-prefixed
        // ones are Next's private-folder convention (this repo uses `_utils`
        // under api/). Neither produces a URL.
        if (entry.startsWith('@') || entry.startsWith('_')) continue;
        walk(absolute, path.join(relativeDir, entry));
      } else if (entry === 'page.js' || entry === 'page.jsx') {
        found.push(routePathFor(relativeDir));
      }
    }
  };

  walk(APP_DIR, '');
  // `not-found.js` is not a `page.js` but IS a rendered route boundary, so it is
  // surfaced here to force a decision about it rather than letting it fall
  // outside the test's view entirely.
  found.push('/not-found');
  return found;
}

describe('sitemap drift', () => {
  const discovered = discoverRoutes();

  it('finds the routes we expect to find (the walker itself works)', () => {
    // Guard on the guard. Every assertion below is of the form "everything
    // discovered is declared", which passes vacuously if the walker discovers
    // NOTHING — a broken path or a changed Next convention would turn this
    // whole suite green while proving nothing. So: assert the walker found a
    // plausible number of routes, and spot-check two it must always see.
    expect(discovered.length).toBeGreaterThanOrEqual(10);
    expect(discovered).toContain('/');
    expect(discovered).toContain('/projects/[id]');
  });

  it('declares every page.js on disk in the registry or in EXCLUDED', () => {
    const declared = new Set(ROUTES.map((route) => route.path));
    // The dynamic project route is declared by being GENERATED — sitemap.js
    // expands it from `projectsData`. It is legitimately absent from the
    // registry, which holds static patterns only.
    declared.add('/projects/[id]');

    const undeclared = discovered.filter(
      (route) => !declared.has(route) && !(route in EXCLUDED),
    );

    expect(
      undeclared,
      `These routes exist on disk but are in neither src/lib/seo/site.js's ROUTES ` +
        `nor the EXCLUDED map in this test:\n  ${undeclared.join('\n  ')}\n\n` +
        `Add a registry entry (so the route gets a sitemap URL, a canonical and ` +
        `a line in llms.txt), or add it to EXCLUDED with a written reason.`,
    ).toEqual([]);
  });

  it('declares no registry route that does not exist on disk', () => {
    // The other direction, and it matters just as much: a sitemap URL for a
    // deleted page is a declared 404, which Search Console reports as a
    // coverage error. A deletion that left the registry entry behind would not
    // be caught by the test above.
    const orphaned = ROUTES.map((route) => route.path).filter(
      (route) => !discovered.includes(route),
    );

    expect(
      orphaned,
      `These registry routes have no page.js on disk, so the sitemap declares ` +
        `URLs that answer 404:\n  ${orphaned.join('\n  ')}`,
    ).toEqual([]);
  });

  it('keeps every EXCLUDED entry real, and explained', () => {
    for (const [route, reason] of Object.entries(EXCLUDED)) {
      // A stale exclusion is clutter that outlives the thing it described, and
      // it weakens the test: the next person reads it as precedent.
      expect(
        discovered,
        `EXCLUDED lists "${route}" but nothing on disk serves it — remove it.`,
      ).toContain(route);
      // Enough words to actually be a reason rather than a shrug.
      expect(
        reason.length,
        `The reason given for excluding "${route}" is too short to be one.`,
      ).toBeGreaterThan(30);
    }
  });
});

describe('sitemap contents', () => {
  // The sitemap module is imported lazily inside the tests rather than at the
  // top of the file because it shells out to git on import (lastModified.js).
  // Keeping that off the module-load path means a failure there reports against
  // the test that caused it.

  it('covers all 21 indexable URLs plus the CV', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    // 9 registry routes + 11 project pages + the CV = 21.
    const expectedCount =
      ROUTES.filter((route) => route.indexable).length +
      projectsData.length +
      1;
    expect(urls).toHaveLength(expectedCount);

    // No duplicates. Two entries for one URL is not an error a validator
    // catches, and it is how a hand-edited sitemap usually first goes wrong.
    expect(new Set(urls).size).toBe(urls.length);

    for (const route of ROUTES) {
      if (!route.indexable) continue;
      expect(urls).toContain(absoluteUrl(route.path));
    }
    for (const project of projectsData) {
      expect(urls).toContain(absoluteUrl(`/projects/${project.id}`));
    }
    expect(urls).toContain(absoluteUrl(CV_ASSET.path));
  });

  it('emits absolute URLs on the canonical origin, with no trailing slashes', async () => {
    const { default: sitemap } = await import('@/app/sitemap');

    for (const { url } of sitemap()) {
      expect(url.startsWith('https://')).toBe(true);
      // The root is the bare origin (`https://ma.codes`); nothing else may end
      // in a slash, because the site serves no trailing slashes and a sitemap
      // URL that differs from the canonical is a second URL for one page.
      expect(url.endsWith('/')).toBe(false);
    }
  });

  it('never fabricates a lastModified (P4)', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const now = Date.now();

    for (const entry of sitemap()) {
      // Absent is allowed and expected on Vercel, where the build has no `.git`
      // — see src/lib/seo/lastModified.js. What is NOT allowed is a date
      // stamped at build time, which is the reflex implementation and the thing
      // P4 forbids. A real commit date is necessarily in the past; `new Date()`
      // lands within milliseconds of now.
      if (entry.lastModified === undefined) continue;
      const stamped = new Date(entry.lastModified).getTime();
      expect(
        now - stamped,
        `${entry.url} has a lastModified within 60s of now, which means it was ` +
          `stamped at build time rather than read from git.`,
      ).toBeGreaterThan(60_000);
    }
  });
});
