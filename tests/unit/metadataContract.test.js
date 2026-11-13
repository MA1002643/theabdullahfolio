import { describe, expect, it, vi } from 'vitest';

// The root layout is the only module here that pulls `next/font/google`, which
// needs the Next build pipeline and throws in a plain unit process. Stubbed to
// the shape the layout consumes (a `variable` class name) so its METADATA — the
// thing under test at the bottom of this file — can be imported at all.
vi.mock('next/font/google', () => {
  // `style.fontFamily` because src/i18n/fonts.js composes per-script font
  // chains from it (issue #82), and the three Noto faces are those script fonts.
  const font = () => ({ variable: '', className: '', style: { fontFamily: '' } });
  return {
    Inter: font,
    Montserrat: font,
    Varela_Round: font,
    Noto_Sans_Arabic: font,
    Noto_Sans_Hebrew: font,
    Noto_Sans_Devanagari: font,
  };
});
import { projectsData } from '@/app/data';
import { readNotes } from '@/lib/notes/readNotes';
import { absoluteUrl, alternatesFor } from '@/lib/seo/canonical';
import { sectionMetadata } from '@/lib/og/meta';
import { assertDescriptionFits } from '@/lib/seo/descriptionWindow';
import { noteMetaDescription } from '@/lib/seo/noteMeta';
import { projectMetaDescription } from '@/lib/seo/projectMeta';
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

describe('metadata contract — note pages', () => {
  it('composes a description inside the window for every note', () => {
    // The third derived-description surface, and the one that had no case at
    // all: this file measured the registry and the eleven projects, and
    // `/notes/[slug]` — whose description is derived from a markdown file, so
    // the LEAST predictable of the three — went unmeasured. `docs/seo.md` was
    // publishing `Issue #32.`, ten characters, because `summaryOf` correctly
    // read an opening paragraph that cites the issue rather than summarising
    // the document. Nothing was wrong with the reader; nothing was checking
    // the result against the window.
    const notes = readNotes();

    // Guard on the guard. Every assertion here is "everything in the corpus
    // fits", which passes vacuously against an empty corpus — and `readNotes`
    // returns `[]` rather than throwing when `docs/` is missing, so a wrong
    // cwd would turn this green while measuring nothing.
    expect(notes.length).toBeGreaterThanOrEqual(1);

    const outOfBounds = notes
      .map((note) => ({
        slug: note.slug,
        description: note.description,
        ...assertDescriptionFits(note.description),
      }))
      .filter((entry) => !entry.ok);

    expect(
      outOfBounds,
      `Note descriptions outside 110–160 characters:\n` +
        outOfBounds
          .map((e) => `  ${e.slug} → ${e.length}: ${e.description}`)
          .join('\n') +
        `\n\nAdd a curated entry under meta.curated in messages/en/Notes.json — the ` +
        `composed fallback carries the title, so it cannot fit every one.`,
    ).toEqual([]);
  });

  it('publishes one description to the head and the graph', () => {
    // These drifted before `description` existed: `generateMetadata` fell back
    // to a composed sentence and the `TechArticle` fell back to the bare title,
    // so a note with no summary described itself two different ways to two
    // crawlers reading the same page. One value on the record is what makes
    // that unrepresentable rather than merely fixed.
    for (const note of readNotes()) {
      expect(note.description, `${note.slug} has no description`).toBeTruthy();
      expect(
        noteMetaDescription(note),
        `${note.slug}'s description is not what the composer returns`,
      ).toBe(note.description);
    }
  });

  it('prefers a document that introduces itself over both fallbacks', () => {
    // Constructed input, for the same reason `summaryOf` is tested on it: the
    // corpus is one document and it takes the CURATED branch, so the other two
    // ship untested against real data. This is the branch that should win most
    // often as the corpus grows — a note opening with a proper abstract needs
    // no entry in `CURATED`, and an override written for one would be a second
    // description to keep in step with the document.
    const abstract =
      'A record of why the caching layer was built the way it was, which ' +
      'alternatives were measured against it, and what each one actually cost.';
    expect(assertDescriptionFits(abstract).ok).toBe(true);

    expect(
      noteMetaDescription({
        slug: 'caching',
        title: 'Caching',
        lines: 400,
        summary: abstract,
      }),
    ).toBe(abstract);
  });

  it('composes rather than publishing a summary that misses the window', () => {
    // Both ends of it. Too short is what shipped; too long is the same defect
    // with the tail cut off instead, and a summary is prose read out of a
    // markdown file, so nothing bounds it. Neither is truncated to fit —
    // cutting prose mid-clause at 160 characters is the defect `summaryOf` was
    // rewritten to stop committing, and doing it here would only move it.
    const composed = (summary) =>
      noteMetaDescription({
        slug: 'caching',
        title: 'Caching',
        lines: 400,
        summary,
      });

    const fallback =
      "Engineering decision record — Caching. 400 lines from this repository's own documentation.";

    expect(composed('Issue #99.'), 'too short').toBe(fallback);
    expect(composed('x'.repeat(200)), 'too long').toBe(fallback);
    expect(composed(null), 'absent').toBe(fallback);
  });
});

// ── A card the site advertises must be a card a crawler may fetch ───────────
// `disallow` and `noindex` are not interchangeable, and treating them as such
// broke the homepage's unfurl: `/og/` sat in `DISALLOWED_PATHS` while the root
// layout advertised `/og/home` and `/og/home-square` in `openGraph.images`, so
// the very agents that act on those tags — Twitterbot, facebookexternalhit,
// Slackbot, LinkedInBot all read robots.txt before fetching — were told not to
// fetch the image they had just been pointed at. The card could render as bare
// text on the one page that matters most, while the other nineteen URLs, whose
// cards are file-convention images outside `/og/`, unfurled normally.
//
// Asserted from the metadata itself rather than from a list of known paths, so
// a card added at a new prefix tomorrow is covered the day it is added.
describe('metadata contract — advertised images stay fetchable', () => {
  it('disallows no path the site publishes as a share card', async () => {
    const { DISALLOWED_PATHS } = await import('@/lib/seo/site');
    // The homepage's card arrays, from the same builder the locale layout's
    // `generateMetadata` uses (issue #82 made the root metadata per-locale, so
    // there is no static `metadata` object to read any more). The alt-text
    // translator is an identity: only the URLs matter here.
    const { homeShareImages } = await import('@/app/[locale]/layout');
    const images = homeShareImages((key) => key);

    const advertised = [...images.openGraph, ...images.twitter].map((image) =>
      typeof image === 'string' ? image : image.url,
    );

    // Guard on the guard: if the shape of `images` ever changes, an empty list
    // would make every assertion below pass without checking anything.
    expect(advertised.length).toBeGreaterThanOrEqual(3);
    expect(advertised).toContain('/og/home');

    const blocked = advertised.filter((url) =>
      DISALLOWED_PATHS.some((rule) => url.startsWith(rule)),
    );

    expect(
      blocked,
      `robots.txt disallows these paths, but the site advertises them as share ` +
        `card images — an unfurler that honours robots.txt will refuse to ` +
        `fetch them and the card degrades to text:\n  ${blocked.join('\n  ')}\n\n` +
        `To keep a card out of image search, send X-Robots-Tag: noindex from ` +
        `its route instead — noindex prevents the listing, disallow prevents ` +
        `the fetch.`,
    ).toEqual([]);
  });
});
