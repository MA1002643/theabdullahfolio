import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
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
 * `not-found.js` is not a `page.js` but IS a rendered route boundary, so it is
 * surfaced here too — to force a decision about it rather than letting it fall
 * outside the test's view entirely.
 *
 * It is found BY THE WALK, like everything else, and that is the whole point.
 * An earlier cut appended `/not-found` unconditionally after the walk, which
 * made "keeps every EXCLUDED entry real" below vacuous for the single entry
 * that map holds: the assertion that something on disk still serves the
 * excluded route passed whether or not the file existed. A guard against stale
 * exclusions that cannot observe its own subject is not a guard.
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
      } else if (entry === 'not-found.js' || entry === 'not-found.jsx') {
        // Nested boundaries are named for the segment they cover, so a future
        // `(sub pages)/projects/[id]/not-found.js` surfaces as its own route
        // and has to be declared or excluded on its own terms. Only the root
        // one exists today, and it is the `/not-found` EXCLUDED names.
        const segment = routePathFor(relativeDir);
        found.push(segment === '/' ? '/not-found' : `${segment}/not-found`);
      }
    }
  };

  walk(APP_DIR, '');
  return found;
}

/**
 * Module specifiers a file imports, as repo-relative paths.
 *
 * Handles the three shapes that matter here, and skipping any of them breaks
 * the walk in a way that is quiet rather than loud:
 *
 *   • `@/…` — the alias, resolved against `src/`.
 *   • `./…` and `../…` — resolved against the IMPORTING file's directory.
 *     Not optional: `schema.js` and `canonical.js` both reach the registry as
 *     `from './site'`, so a walker that followed only the alias declares
 *     `src/lib/seo/site.js` unreachable from a route that publishes it on
 *     every page. That is precisely the false negative this walk exists for.
 *   • dynamic `import("…")` — `scene-loader.jsx` pulls the whole WebGL scene
 *     in through `dynamic(() => import("@/components/project-detail/scene"))`,
 *     and a walker blind to it stops at the loader.
 *
 * Bare specifiers (`next/image`, `three`) are dropped: they are dependencies,
 * not sources, and a commit to this repository cannot touch them.
 *
 * Deliberately regex over the source text rather than a real parse: the
 * alternative is a parser dependency to read a handful of import lines, and a
 * specifier this misses shows up as a MISSING edge (a walker that
 * under-reports cannot raise a false failure, only stay quiet) — which the
 * vacuity guards below are there to catch.
 *
 * @param {string} relativeFile Repo-relative path to a source file.
 * @returns {string[]} Repo-relative module paths, extension as written.
 */
function importsFrom(relativeFile) {
  const source = readFileSync(path.join(process.cwd(), relativeFile), 'utf8');
  const directory = path.posix.dirname(relativeFile);

  return [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)]
    .map((match) => match[1])
    .map((specifier) => {
      if (specifier.startsWith('@/')) return `src/${specifier.slice(2)}`;
      if (specifier.startsWith('.'))
        return path.posix.join(directory, specifier);
      return null;
    })
    .filter(Boolean);
}

/**
 * Resolve a `@/…` specifier to the file on disk it actually loads.
 *
 * Webpack's resolver is not available here, so this reproduces the only two
 * shapes this repository uses: an extensionless file (`@/lib/seo/site` →
 * `src/lib/seo/site.js`) and a directory index (`@/components/projects` →
 * `src/components/projects/index.jsx`).
 *
 * @param {string} specifier Repo-relative module path, extension optional.
 * @returns {string|null} The file's repo-relative path, or null if unresolved.
 */
function resolveModule(specifier) {
  const candidates = [
    specifier,
    `${specifier}.js`,
    `${specifier}.jsx`,
    `${specifier}/index.js`,
    `${specifier}/index.jsx`,
  ];
  for (const candidate of candidates) {
    // Source files only. The detail page also imports its background image by
    // relative path, and that resolves to a real file whose bytes are not
    // JavaScript — following it would mean running the import regex over a
    // WebP.
    if (!/\.jsx?$/.test(candidate)) continue;
    try {
      if (statSync(path.join(process.cwd(), candidate)).isFile())
        return candidate;
    } catch {
      // Not this shape; try the next.
    }
  }
  return null;
}

/**
 * Every `src/…` module a route publishes from, following imports TRANSITIVELY.
 *
 * Direct imports are not the right question, and assuming they were is what
 * made the first cut of the stray check below wrong. A route publishes
 * whatever ends up in its HTML, and the most consequential inputs arrive
 * indirectly: `[id]/page.js` never imports `@/lib/seo/site`, yet the registry's
 * `ORIGIN` and `IDENTITY` reach every one of its eleven documents through
 * `canonical.js` (the self-declared canonical URL) and `schema.js` (the
 * JSON-LD `@id`s and the `Person` the page credits). A depth-1 walk calls that
 * file unreachable and reports watching it as a mistake.
 *
 * Bare specifiers (`next/image`, `three`) are not followed: they are
 * dependencies, not sources, and a commit cannot touch them.
 *
 * @param {string} entryFile Repo-relative path to the route's page file.
 * @returns {Set<string>} Resolved repo-relative paths, entry file included.
 */
function publishedFrom(entryFiles, barriers = []) {
  const entries = [entryFiles].flat();
  const reached = new Set(entries);
  const queue = [...entries];

  while (queue.length > 0) {
    const current = queue.pop();
    // A BARRIER is reported as reached but never traversed THROUGH, which is
    // how "does this route consume the module itself?" is asked separately from
    // "can the module be reached at all?". Every route can reach
    // `src/app/data.js`, because the registry imports it to count builds for the
    // `/projects` description — but a route that reaches it ONLY that way
    // renders nothing from it, and dating that route by a project record would
    // be an over-stamp. Barring the registry is what separates the two.
    if (barriers.includes(current)) continue;

    for (const specifier of importsFrom(current)) {
      const resolved = resolveModule(specifier);
      // An unresolvable specifier is skipped rather than thrown on: it means
      // this walker does not understand a shape, and going quiet is the safe
      // direction (see `importsFrom`).
      if (!resolved || reached.has(resolved)) continue;
      reached.add(resolved);
      queue.push(resolved);
    }
  }

  return reached;
}

/**
 * The files a route renders from: its `page.js`, plus its `layout.js` if it has
 * one.
 *
 * Both, because on this site the layout is where several routes' published
 * metadata and JSON-LD actually live — `/about`, `/qualifications` and
 * `/guestbook` have client-component pages that cannot export `metadata`, so a
 * pass-through layout owns it. A walk from `page.js` alone would miss the half
 * of `/qualifications` that reads `journeyData` and publishes it as credentials.
 *
 * @param {string} routePath Registry route path (`/`, `/about`, …).
 * @returns {string[]} Repo-relative entry files that exist on disk.
 */
function entryFilesFor(routePath) {
  const directory =
    routePath === '/' ? 'src/app' : `src/app/(sub pages)${routePath}`;
  return ['page.js', 'layout.js']
    .map((file) => `${directory}/${file}`)
    .filter((file) => {
      try {
        return statSync(path.join(process.cwd(), file)).isFile();
      } catch {
        return false;
      }
    });
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

  it('takes every lastModified from git, never from the clock (P4)', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const { lastModifiedFor } = await import('@/lib/seo/lastModified');

    // Absent is allowed and expected on Vercel, where the build has no `.git`
    // — see src/lib/seo/lastModified.js. What is NOT allowed is a date stamped
    // at build time, which is the reflex implementation P4 forbids.
    //
    // This is asserted by IDENTITY, not by age. An earlier cut required every
    // date to be more than 60s old, on the reasoning that `new Date()` lands
    // within milliseconds of now — which is true, and still made the test fail
    // whenever someone committed a source file and ran the suite inside a
    // minute. Comparing against `lastModifiedFor` instead is exact, has no
    // timing in it at all, and is a stricter statement: the entry must be the
    // value the git module produced for that route's own sources. (The module
    // memoises, so this is the same cached instance sitemap() received — and
    // whether the module itself invents dates is settled separately, against
    // controlled git output, in lastModified.test.js.)
    const entries = sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));

    for (const route of ROUTES) {
      if (!route.indexable) continue;
      const entry = byUrl.get(absoluteUrl(route.path));
      expect(entry.lastModified).toBe(lastModifiedFor(route.sources));
    }
    expect(byUrl.get(absoluteUrl(CV_ASSET.path)).lastModified).toBe(
      lastModifiedFor(CV_ASSET.sources),
    );

    // All eleven project pages share ONE lookup by design (they are one
    // template over one data file), so they must also share one value —
    // a per-entry `new Date()` is the shape that would break this.
    const projectStamps = new Set(
      projectsData.map(
        (project) =>
          byUrl.get(absoluteUrl(`/projects/${project.id}`)).lastModified,
      ),
    );
    expect(projectStamps.size).toBe(1);

    // And nothing may claim to have been modified in an implausible future.
    //
    // NOTE: this asserts the eleven share ONE value, not that the value is the
    // right one. Which sources produce it is settled by `project detail
    // sources` below — the two together are what make the date correct rather
    // than merely consistent.
    //
    // The tolerance is the point. A committer date comes from the clock of the
    // machine that made the commit, so a bare `<= Date.now()` is the same
    // wall-clock trap the age check was: a commit authored on a machine running
    // a little fast, checked out and tested inside that skew, would fail on
    // data that is entirely correct. A day absorbs any realistic skew while
    // still catching the thing actually worth catching — a date years out,
    // which would put a nonsense `<lastmod>` in front of a crawler.
    const SKEW_TOLERANCE_MS = 24 * 60 * 60 * 1000;
    const ceiling = Date.now() + SKEW_TOLERANCE_MS;
    for (const entry of entries) {
      if (entry.lastModified === undefined) continue;
      expect(
        new Date(entry.lastModified).getTime(),
        `${entry.url} carries a lastModified more than a day in the future, ` +
          `which is past any clock skew and into bad data.`,
      ).toBeLessThanOrEqual(ceiling);
    }
  });
});

// ── The sources behind those eleven dates ───────────────────────────────────
// `PROJECT_SOURCES` named `src/components/projects` — the /projects LISTING
// directory — while the detail route renders out of the sibling
// `src/components/project-detail`. Nothing failed, because a source list that
// points somewhere real always produces a well-formed date; it was simply the
// wrong file's date. Wrong in both directions, too: a change to the detail
// scene moved no `<lastmod>`, and a change to a listing card moved all eleven.
//
// The suite above could not have caught it. It asserts the eleven entries all
// equal `lastModifiedFor(PROJECT_SOURCES)` and all share one value — both of
// which stayed true with the wrong directory in the list, because they check
// the plumbing rather than what is plumbed to.
//
// So this reads the detail route's REAL imports off disk and checks the list
// against them, the same way `sitemap drift` above walks the real route tree
// rather than trusting a list someone maintains.
describe('project detail sources', () => {
  // Written with forward slashes, not `path.join`, because it is compared by
  // string equality against a PROJECT_SOURCES entry — and those are repo paths
  // in git's spelling, which is `/` on every platform.
  const DETAIL_PAGE = 'src/app/(sub pages)/projects/[id]/page.js';

  // Component directories the detail route imports from that are deliberately
  // NOT watched. Same contract as `EXCLUDED` above: every entry needs a written
  // reason, because an unexplained omission is indistinguishable from the
  // oversight this test exists to catch.
  const UNWATCHED_COMPONENTS = {
    'src/components/seo':
      'Shared JSON-LD serialiser, not content. It renders into nine routes ' +
      'and none of them list it in `sources` either — watching it here would ' +
      'date these eleven pages by an infrastructure commit that changed ' +
      'nothing a reader or a crawler sees.',
  };


  /**
   * Whether a `sources` entry accounts for an imported module.
   *
   * Three shapes, because `sources` entries are written as they are committed
   * and imports as they are written: an exact file path, a directory the module
   * sits under, or a file whose extension the specifier omits (`@/app/data`
   * resolving to `src/app/data.js`).
   */
  const covers = (source, specifier) =>
    specifier === source ||
    specifier.startsWith(`${source}/`) ||
    `${specifier}.js` === source ||
    `${specifier}.jsx` === source;

  it('watches every component directory the detail route renders from', async () => {
    const { PROJECT_SOURCES } = await import('@/app/sitemap');
    const imported = importsFrom(DETAIL_PAGE).filter((specifier) =>
      specifier.startsWith('src/components/'),
    );

    // Guard on the guard. Every assertion here is "everything imported is
    // watched", which passes vacuously if the regex matches nothing — a
    // reformatted import block or a moved file would turn this green while
    // proving nothing.
    expect(imported.length).toBeGreaterThanOrEqual(4);

    const unwatched = imported.filter(
      (specifier) =>
        !PROJECT_SOURCES.some((source) => covers(source, specifier)) &&
        !Object.keys(UNWATCHED_COMPONENTS).some((dir) =>
          covers(dir, specifier),
        ),
    );

    expect(
      unwatched,
      `The project detail route renders these modules, but PROJECT_SOURCES in ` +
        `src/app/sitemap.js does not watch them — so every /projects/<id> ` +
        `<lastmod> is blind to changes in them:\n  ${unwatched.join('\n  ')}\n\n` +
        `Add the directory to PROJECT_SOURCES, or add it to ` +
        `UNWATCHED_COMPONENTS in this test with a written reason.`,
    ).toEqual([]);
  });

  it('watches nothing the detail route does not actually render', async () => {
    const { PROJECT_SOURCES } = await import('@/app/sitemap');
    const published = [...publishedFrom(DETAIL_PAGE)];

    // Guard on the guard, in the dimension this check actually depends on: a
    // walker that resolved nothing beyond the entry file would make every
    // source look like a stray, and one that stopped at depth 1 would have
    // called `src/lib/seo/site.js` unreachable — the exact false positive this
    // rewrite exists to remove. Both would be loud rather than silent, but the
    // floor states the expectation rather than leaving it to the failure text.
    expect(published.length).toBeGreaterThanOrEqual(15);
    expect(published).toContain('src/lib/seo/site.js');

    // The direction that catches the bug this suite was written for. A stray
    // entry does not fail anything on its own — it quietly widens the date to
    // cover commits that never touched these eleven documents, which is a
    // `<lastmod>` asserting a change that did not happen.
    const strays = PROJECT_SOURCES.filter(
      (source) =>
        // The route file itself is the one entry with no import to match.
        source !== DETAIL_PAGE &&
        !published.some((module) => covers(source, module)),
    );

    expect(
      strays,
      `PROJECT_SOURCES in src/app/sitemap.js watches these paths, but the ` +
        `detail route neither is nor reaches them through its imports, so a ` +
        `commit touching one would re-stamp all eleven /projects/<id> URLs as ` +
        `modified when nothing about those pages changed:\n  ` +
        `${strays.join('\n  ')}\n\n` +
        `(src/components/projects is the /projects LISTING — see ` +
        `src/lib/seo/site.js, where it belongs to that route's own sources.)`,
    ).toEqual([]);
  });

  it('names the route file that PROJECT_SOURCES expects to find', () => {
    // `DETAIL_PAGE` is matched against a PROJECT_SOURCES entry by string
    // equality above, so if the route ever moves, the stray check would report
    // the old path as a stray rather than saying the file is gone. Assert it
    // exists so the failure names the real problem.
    expect(() =>
      statSync(path.join(process.cwd(), DETAIL_PAGE)),
    ).not.toThrow();
  });
});

// ── The registry is itself a published source ───────────────────────────────
// `src/lib/seo/site.js` supplies each route's `title` and `description`, and
// those are not internal bookkeeping: they are the `<title>`, the meta
// description, the OG and Twitter card fields, the description stated in the
// JSON-LD, and the line `/llms.txt` prints. `ORIGIN` and `IDENTITY` from the
// same file reach every page through `canonical.js` and `schema.js`.
//
// No `sources` list named it until 2026-09-12, so editing a description changed
// five published surfaces at a URL while swearing in the sitemap that the URL
// had not changed. Same defect as the project source list pointing at the
// listing directory, one level up: the registry could rewrite the crawl surface
// without moving the date that tells a crawler to come and look.
describe('registry as a source', () => {
  it('lists the registry in every route source set', async () => {
    const { ROUTES, SHARED_ROUTE_SOURCES } = await import('@/lib/seo/site');
    const { PROJECT_SOURCES } = await import('@/app/sitemap');

    // Assert the shared list is what it claims to be before asserting with it:
    // emptied, every check below would pass while watching nothing.
    expect(SHARED_ROUTE_SOURCES).toContain('src/lib/seo/site.js');

    const missing = ROUTES.filter(
      (route) =>
        !SHARED_ROUTE_SOURCES.every((shared) => route.sources.includes(shared)),
    ).map((route) => route.path);

    expect(
      missing,
      `These routes do not watch the registry that supplies their title and ` +
        `description, so editing either would change what crawlers and ` +
        `assistants read while leaving <lastmod> untouched:\n  ` +
        `${missing.join('\n  ')}`,
    ).toEqual([]);

    // The eleven project pages are generated rather than registered, so they
    // carry their own list and have to be asserted separately — exactly the
    // split that let them be forgotten in the first place.
    for (const shared of SHARED_ROUTE_SOURCES) {
      expect(
        PROJECT_SOURCES,
        `PROJECT_SOURCES in src/app/sitemap.js is missing "${shared}". The ` +
          `project pages publish ORIGIN and IDENTITY too, through canonical.js ` +
          `and schema.js.`,
      ).toContain(shared);
    }
  });

  it('keeps every shared source a real file', async () => {
    const { SHARED_ROUTE_SOURCES } = await import('@/lib/seo/site');

    // A shared source that no longer exists is worse than none: `git log` over
    // a path with no commits returns empty, which `lastModifiedFor` reads as
    // "unknowable" — so a renamed registry would not fail anything here, it
    // would quietly drop `<lastmod>` from all 21 URLs at once.
    for (const source of SHARED_ROUTE_SOURCES) {
      expect(
        () => statSync(path.join(process.cwd(), source)),
        `SHARED_ROUTE_SOURCES names "${source}", which does not exist.`,
      ).not.toThrow();
    }
  });

  it('does not disturb the per-route sources already declared', async () => {
    const { ROUTES } = await import('@/lib/seo/site');

    // `ROUTES` is now built by mapping over the definitions, so a mistake in
    // that map (dropping `sources`, replacing rather than appending) would be
    // invisible: every route would still have a source list, just the wrong
    // one. Spot-check the two entries whose own sources are most specific.
    const uses = ROUTES.find((route) => route.path === '/uses');
    expect(uses.sources).toEqual(
      expect.arrayContaining([
        'src/app/(sub pages)/uses',
        'src/lib/uses',
        'src/components/uses',
      ]),
    );

    const projects = ROUTES.find((route) => route.path === '/projects');
    expect(projects.sources).toEqual(
      expect.arrayContaining([
        'src/app/(sub pages)/projects/page.js',
        'src/app/data.js',
        'src/components/projects',
      ]),
    );

    // And every route still carries a route-specific source beyond the shared
    // one, which is what would catch an append that had become a replace.
    for (const route of ROUTES) {
      expect(
        route.sources.length,
        `${route.path} has no sources of its own beyond the shared list.`,
      ).toBeGreaterThan(1);
    }
  });
});

// ── The shared data module ──────────────────────────────────────────────────
// `src/app/data.js` holds `projectsData`, `journeyData`, `usesData` and
// `BtnList` — CONTENT, rendered into server HTML as text, links and structured
// data, not infrastructure. The homepage was the third route found publishing
// from it without watching it: `page.js` counts `projectsData` for the `sr-only`
// summary and `Navigation` maps `BtnList` into the eight orbit links, so a
// twelfth project or a renamed nav entry rewrote the homepage's HTML while its
// `<lastmod>` stood still.
//
// The line this draws is the interesting part, and a blanket "watch everything
// reachable" rule would get it wrong. EVERY route can reach the data module,
// because the registry imports `projectsData` to count builds for the
// `/projects` description — so `/contact`, `/my-past` and `/guestbook` reach it
// while rendering nothing from it, and watching it there would re-stamp three
// URLs every time a project record changed. Walking with the registry as a
// BARRIER separates the two: what is left is first-hand use.
describe('shared data module as a source', () => {
  const DATA_MODULE = 'src/app/data.js';
  const REGISTRY = 'src/lib/seo/site.js';

  it('is watched by exactly the routes that render from it', async () => {
    const { ROUTES } = await import('@/lib/seo/site');

    const wrong = [];
    for (const route of ROUTES) {
      const entries = entryFilesFor(route.path);
      // Guard on the guard: a route whose entry files cannot be found would
      // reach nothing and silently pass as "does not render from it".
      expect(
        entries.length,
        `Found no page.js or layout.js for ${route.path}.`,
      ).toBeGreaterThan(0);

      const rendersFromIt = publishedFrom(entries, [REGISTRY]).has(DATA_MODULE);
      const watchesIt = route.sources.includes(DATA_MODULE);

      if (rendersFromIt !== watchesIt) {
        wrong.push(
          rendersFromIt
            ? `${route.path} renders from ${DATA_MODULE} but does not watch it ` +
              `— adding or renaming an entry changes its HTML with no <lastmod> move`
            : `${route.path} watches ${DATA_MODULE} but reaches it only through ` +
              `${REGISTRY} — a project record would re-stamp it for nothing`,
        );
      }
    }

    expect(wrong, `\n  ${wrong.join('\n  ')}\n`).toEqual([]);
  });

  it('separates first-hand use from reach-through-the-registry', async () => {
    const { ROUTES } = await import('@/lib/seo/site');

    // The barrier is the whole mechanism, so assert it actually does something
    // rather than trusting that it does. Without it every route reaches the
    // data module and the check above collapses into "all nine must watch it",
    // which is the over-stamp it exists to avoid.
    const unbarriered = ROUTES.filter((route) =>
      publishedFrom(entryFilesFor(route.path)).has(DATA_MODULE),
    );
    const barriered = ROUTES.filter((route) =>
      publishedFrom(entryFilesFor(route.path), [REGISTRY]).has(DATA_MODULE),
    );

    expect(unbarriered.length).toBe(ROUTES.length);
    expect(barriered.length).toBeLessThan(unbarriered.length);

    // And name the split, so the intent is legible rather than only counted.
    expect(barriered.map((route) => route.path).sort()).toEqual([
      '/',
      '/about',
      '/journey',
      '/projects',
      '/qualifications',
      '/uses',
    ]);
  });

  it('watches it for the project pages too', async () => {
    const { PROJECT_SOURCES } = await import('@/app/sitemap');

    // Not covered by the loop above — the eleven are generated rather than
    // registered — and the most obviously true case of all: `projectsData` is
    // the record each page renders.
    expect(PROJECT_SOURCES).toContain(DATA_MODULE);
  });
});

// ── Inputs no import graph can see ──────────────────────────────────────────
// `/uses` is the one route whose content is the REPOSITORY. `readBuildFacts()`
// opens `package.json`, `package-lock.json`, `.nvmrc`, `vercel.json`, the
// workflow directory, both test directories and the API route tree, and prints
// what it finds — the Node version, dependency versions, the cron schedule, the
// schematic's stage labels, the spec and route counts.
//
// None of that is an import, so the module walk above is blind to it by
// construction: these are `fs.readFileSync` calls against paths that exist only
// as string literals. `src/lib/uses` was in the source list from the start and
// covers the READER; it says nothing about what the reader reads, so a
// dependency bump rewrote the bill of materials while `<lastmod>` held still.
//
// Same philosophy as the walker, different mechanism: derive the expectation
// from the reader's own source rather than from a list someone maintains.
describe('uses build facts', () => {
  const READER = 'src/lib/uses/buildFacts.js';

  /**
   * Path literals in a file that name something real on disk.
   *
   * A deliberately blunt instrument — every quoted string in the file, filtered
   * to those that `stat` resolves from the repository root. That over-reports
   * in principle (a literal could coincide with a real path without being read)
   * and the over-report is the safe direction: it forces a decision about a new
   * path rather than letting one slip in silently, which is the same trade the
   * `EXCLUDED` map above makes.
   *
   * @param {string} relativeFile Repo-relative path to the reader.
   * @returns {string[]} Repo-relative paths it names, sorted.
   */
  function pathLiteralsIn(relativeFile) {
    const source = readFileSync(path.join(process.cwd(), relativeFile), 'utf8');
    const literals = new Set(
      [...source.matchAll(/['"`]([^'"`\n]{2,60})['"`]/g)].map(
        (match) => match[1],
      ),
    );
    return [...literals]
      .filter((literal) => {
        try {
          statSync(path.join(process.cwd(), literal));
          return true;
        } catch {
          return false;
        }
      })
      .sort();
  }

  it('watches every repository path the build-facts reader opens', async () => {
    const { ROUTES } = await import('@/lib/seo/site');
    const uses = ROUTES.find((route) => route.path === '/uses');
    const inputs = pathLiteralsIn(READER);

    // Guard on the guard. If the regex or the reader's shape ever changes so
    // that nothing is extracted, every assertion below passes vacuously — and
    // this is the check most exposed to that, since it is scraping source text
    // for string literals rather than following a structure.
    expect(inputs.length).toBeGreaterThanOrEqual(8);
    expect(inputs).toContain('package.json');
    expect(inputs).toContain('package-lock.json');

    const unwatched = inputs.filter(
      (input) =>
        !uses.sources.some(
          (source) => input === source || input.startsWith(`${source}/`),
        ),
    );

    expect(
      unwatched,
      `readBuildFacts() reads these and prints them on /uses, but the route's ` +
        `sources do not watch them, so the page's stated facts can change with ` +
        `no <lastmod> move:\n  ${unwatched.join('\n  ')}\n\n` +
        `Add them to the /uses entry in src/lib/seo/site.js.`,
    ).toEqual([]);
  });

  it('does not watch build-fact paths the reader stopped reading', async () => {
    const { ROUTES, SHARED_ROUTE_SOURCES } = await import('@/lib/seo/site');
    const uses = ROUTES.find((route) => route.path === '/uses');
    const inputs = pathLiteralsIn(READER);

    // The other direction. `/uses` is the most frequently re-stamped route on
    // the site, so a path left behind after the reader stopped opening it is a
    // standing over-stamp — and the only list that would ever say so is this
    // one, since nothing else connects the registry entry to the reader.
    //
    // Only paths OUTSIDE `src/` are checked: the rest of the entry is source
    // directories the page renders from, which this reader knows nothing about.
    const stale = uses.sources.filter(
      (source) =>
        !source.startsWith('src/') &&
        !SHARED_ROUTE_SOURCES.includes(source) &&
        !inputs.some(
          (input) => input === source || input.startsWith(`${source}/`),
        ),
    );

    expect(
      stale,
      `The /uses entry watches these, but ${READER} no longer names them:\n  ` +
        `${stale.join('\n  ')}`,
    ).toEqual([]);
  });
});
