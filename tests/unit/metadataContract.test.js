import { describe, expect, it } from 'vitest';
import { projectsData } from '@/app/data';
import { absoluteUrl, alternatesFor } from '@/lib/seo/canonical';
import { sectionMetadata } from '@/lib/og/meta';
import {
  assertDescriptionFits,
  projectMetaDescription,
} from '@/lib/seo/projectMeta';
import { ORIGIN, ROUTES } from '@/lib/seo/site';

// ── The metadata contract (issue #32, W5) ───────────────────────────────────
// Every rule below describes a failure that is INVISIBLE in production. A
// duplicate description does not error, a title that renders 12 characters too
// long is simply truncated in a SERP nobody on the team is looking at, and a
// page that sheds its canonical through Next's shallow metadata merge looks
// completely normal. P2: if it can silently break, it gets a test.
//
// The numbers are not style preferences:
//   • Titles ≤ 60 characters RENDERED — measured after the root layout's
//     `%s · Muhammad Abdullah` template is applied, because that is what ships.
//     Google truncates desktop titles around 60.
//   • Descriptions 110–160. Above ~160 the tail is cut; below ~110 Google tends
//     to discard the description and substitute scraped page text, which throws
//     away the one string the site gets to choose.

// Mirrors src/app/layout.js. Kept as a literal on purpose — the same doctrine
// as notFoundMetadata.test.js: a change to the real template has to be made
// here too, deliberately, rather than being silently absorbed.
const TEMPLATE = '%s · Muhammad Abdullah';
const renderTitle = (route, title) =>
  route === '/' ? title : TEMPLATE.replace('%s', title);

describe('metadata contract — registry routes', () => {
  it('gives every route a title that fits once the template is applied', () => {
    const tooLong = ROUTES.map((route) => ({
      path: route.path,
      rendered: renderTitle(route.path, route.title),
    }))
      .map((entry) => ({ ...entry, length: entry.rendered.length }))
      .filter((entry) => entry.length > 60);

    expect(
      tooLong,
      `Rendered titles over 60 characters get truncated in search results:\n` +
        tooLong
          .map((e) => `  ${e.path} → ${e.length}: ${e.rendered}`)
          .join('\n'),
    ).toEqual([]);
  });

  it('gives every route a description inside the 110–160 window', () => {
    const outOfBounds = ROUTES.map((route) => ({
      path: route.path,
      ...assertDescriptionFits(route.description),
    })).filter((entry) => !entry.ok);

    expect(
      outOfBounds,
      `Descriptions outside 110–160 characters:\n` +
        outOfBounds.map((e) => `  ${e.path} → ${e.length}`).join('\n'),
    ).toEqual([]);
  });

  it('keeps every title and description unique across routes', () => {
    // Duplicates are the single most common on-site SEO defect and they are
    // completely silent: two pages competing for one query, with the engine
    // picking whichever it likes. Copy-pasting a registry entry and forgetting
    // to change the description is exactly how it happens.
    const titles = ROUTES.map((route) => route.title);
    const descriptions = ROUTES.map((route) => route.description);

    expect(new Set(titles).size, 'duplicate titles in ROUTES').toBe(
      titles.length,
    );
    expect(new Set(descriptions).size, 'duplicate descriptions in ROUTES').toBe(
      descriptions.length,
    );
  });

  it('builds an absolute, self-referential canonical for every route', () => {
    for (const route of ROUTES) {
      const { canonical } = alternatesFor(route.path);

      expect(canonical.startsWith(ORIGIN)).toBe(true);
      // Self-referential: the canonical for /about must be /about, never the
      // homepage. A canonical pointing elsewhere tells Google to drop this page
      // from the index in favour of that one — the most destructive single
      // mistake available in this file.
      expect(canonical).toBe(absoluteUrl(route.path));
      // No trailing slash (the root is the bare origin), so the canonical, the
      // sitemap URL and the URL the site actually serves are one string.
      if (route.path !== '/') expect(canonical.endsWith('/')).toBe(false);
    }
  });
});

describe('metadata contract — sectionMetadata()', () => {
  // The helper is the load-bearing piece of W1: nine section routes and eleven
  // project pages get their canonical from it and NOWHERE else. Risk §10.2 is
  // that Next merges metadata shallowly, so if a page ever declared its own
  // `alternates` it would replace the root's wholesale. These cases pin that the
  // helper keeps emitting the block at all.

  it('emits an absolute canonical for the path it is given', () => {
    const meta = sectionMetadata({
      title: 'About',
      description: 'x'.repeat(120),
      path: '/about',
    });

    expect(meta.alternates?.canonical).toBe(`${ORIGIN}/about`);
  });

  it('still restates the shared openGraph fields alongside it', () => {
    // Adding `alternates` must not have disturbed what the helper already
    // existed to protect (issue #88 v2): a page declaring `openGraph` at all
    // replaces the root's entire object, so siteName/type/locale have to be
    // restated here or nine routes lose them.
    const meta = sectionMetadata({
      title: 'Uses',
      description: 'x'.repeat(120),
      path: '/uses',
    });

    expect(meta.openGraph).toMatchObject({
      type: 'website',
      locale: 'en_GB',
      siteName: 'Muhammad Abdullah',
      url: '/uses',
    });
    expect(meta.twitter?.card).toBe('summary_large_image');
  });

  it('leaves the site name to the root template', () => {
    const meta = sectionMetadata({
      title: 'Journey',
      description: 'x'.repeat(120),
      path: '/journey',
    });

    // Same rule notFoundMetadata.test.js pins for the 404: the template owns
    // the suffix, so a bare title here composes correctly and a restated one
    // would double it.
    expect(meta.title).toBe('Journey');
    expect(meta.title).not.toMatch(/Muhammad Abdullah/);
  });
});

describe('metadata contract — project pages', () => {
  it('composes a description inside the window for all eleven', () => {
    // This is the case that caught four real bugs when it was first run:
    // `charAt(0).toLowerCase()` mangling "AI-powered" into "aI-powered", "A AI
    // project" needing "an", every description running 157–180 characters, and
    // a fix for THAT silently re-casing the repository names. None of them were
    // visible by reading the composer.
    const outOfBounds = projectsData
      .map((project) => ({
        name: project.name,
        description: projectMetaDescription(project),
      }))
      .map((entry) => ({
        ...entry,
        ...assertDescriptionFits(entry.description),
      }))
      .filter((entry) => !entry.ok);

    expect(
      outOfBounds,
      `Composed project descriptions outside 110–160 characters:\n` +
        outOfBounds
          .map((e) => `  ${e.name} → ${e.length}: ${e.description}`)
          .join('\n'),
    ).toEqual([]);
  });

  it('never re-cases a repository name', () => {
    // `AfaaqX`, `theabdullahfolio` and `culina` are real repository names and
    // their casing is meaningful — GitHub's API is case-sensitive on the paths
    // this data feeds. A sentence-capitalising pass over the whole description
    // rewrote them once already.
    for (const project of projectsData) {
      expect(
        projectMetaDescription(project).startsWith(`${project.name} — `),
        `${project.name}'s description does not open with its exact name`,
      ).toBe(true);
    }
  });

  it('keeps every project description unique', () => {
    const descriptions = projectsData.map(projectMetaDescription);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('gives every project a title that fits once the template is applied', () => {
    const tooLong = projectsData
      .map((project) => ({
        name: project.name,
        length: TEMPLATE.replace('%s', project.name).length,
      }))
      .filter((entry) => entry.length > 60);

    expect(tooLong, JSON.stringify(tooLong)).toEqual([]);
  });

  it('uses the right article for every category present in the data', () => {
    // Guards the vowel rule against a NEW category being added later. The check
    // is on the rendered string rather than on the helper, because the helper is
    // private to the module.
    for (const project of projectsData) {
      const description = projectMetaDescription(project);
      const startsWithVowel = /^[aeiou]/i.test(project.category);
      expect(
        description,
        `wrong article for category "${project.category}"`,
      ).toContain(`${startsWithVowel ? 'An' : 'A'} ${project.category} build`);
    }
  });
});
