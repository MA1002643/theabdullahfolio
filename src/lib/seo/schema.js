// JSON-LD builders (issue #32, W2). Typed, composable, and wired into ONE
// graph by stable `@id`s (P3).
//
// ── Why @id matters more than the schema itself ─────────────────────────────
// The easy version of structured data is a `Person` blob on /about and a
// `SoftwareSourceCode` blob on each project page, each complete and each
// floating free. A consumer reading those has eleven anonymous authors called
// "Muhammad Abdullah" and no way to know they are one person, or that the
// person is the same one who owns the site.
//
// Giving every node a stable, absolute `@id` and referencing it by that id
// instead of restating it turns those blobs into a graph:
//
//     https://ma.codes/#person   ← the one Person node, defined once
//     https://ma.codes/#website  ← WebSite, author → #person
//     https://ma.codes/projects/3#project
//                                ← SoftwareSourceCode, author → #person
//
// Now "who wrote culina" and "who owns ma.codes" resolve to the SAME node, and
// `sameAs` on that node (GitHub, LinkedIn) is what lets an engine merge it with
// the profiles it already knows. That is the difference between a site that
// "has schema" and one that is a resolvable entity — which is the actual goal
// in §9: an assistant answering "who is Muhammad Abdullah" accurately.
//
// The fragment form is deliberate. `@id` must be a URI and is conventionally a
// fragment on a real page, so `https://ma.codes/#person` both identifies the
// node and points at a document a consumer can fetch to verify it.
//
// ── Truthfulness ────────────────────────────────────────────────────────────
// P4 applies here as much as to `lastModified`. Nothing below invents a value:
// `dateCreated` on a project is the `date` field from data.js (the repo's
// creation date), `codeRepository` is its real `repo`, and `knowsAbout` is
// DERIVED by the caller from the curated `/uses` stack rather than typed from a
// wishlist. Anything not knowable is left out — `pruneEmpty` in JsonLd.jsx
// drops it — because an absent claim is honest and a guessed one is not.
//
// That derivation is deliberately not the live `/api/github-skills` route, and
// the reasoning is recorded once, at `knowsAboutFromStack` in site.js: the
// claim has to be in server-rendered HTML to be worth anything, which would
// make it a BUILD-time fetch depending on a token and a network call — a
// snapshot that rots invisibly. `usesData.stack` is reviewed in diffs and is
// already rendered on /uses, so the claim and the visible page cannot disagree.

import { absoluteUrl } from './canonical';
import { CV_ASSET, IDENTITY, ORIGIN, legalOrgName } from './site';
import { linkedInUrl, profileGithubUrl } from '@/components/footer/footer-data';

// ── Stable node ids ─────────────────────────────────────────────────────────
// Exported because the tests assert the graph resolves, and a test that
// hardcodes the strings would pass while the graph was broken.
export const PERSON_ID = `${ORIGIN}/#person`;
export const WEBSITE_ID = `${ORIGIN}/#website`;
export const projectId = (id) => `${absoluteUrl(`/projects/${id}`)}#project`;

// A reference to a node defined elsewhere in the graph. Emitting `{'@id': ...}`
// rather than a duplicate of the node is the whole mechanism: it is a POINTER,
// so there is exactly one definition of the person on the entire site and no
// copy of it can drift.
const ref = (id) => ({ '@id': id });

/**
 * The Person node — the root of the entity graph.
 *
 * `sameAs` is sourced from footer-data.js (P5) rather than a second list. Those
 * URLs are already rendered in the footer of every sub-page, so the schema and
 * the visible links cannot disagree; two lists would be two chances to drift,
 * and a `sameAs` pointing at a profile the site does not actually link to is a
 * weaker signal, not a stronger one.
 *
 * @param {{knowsAbout?: string[]}} [options] `knowsAbout` accepts topic names
 *   derived from data this repository already renders — in production, the
 *   curated `/uses` stack via `knowsAboutFromStack(usesData.stack)` in
 *   about/layout.js. Not the live `/api/github-skills` route: see the note on
 *   that helper in site.js for why a build-time fetch was rejected.
 * @returns {object} A schema.org Person node.
 */
export function person({ knowsAbout } = {}) {
  return {
    '@type': 'Person',
    '@id': PERSON_ID,
    name: IDENTITY.name,
    // `url` is the site root, not /about: the root is where the entity lives
    // and /about is a page ABOUT it (that relationship is expressed by
    // ProfilePage.mainEntity below instead).
    url: `${ORIGIN}/`,
    jobTitle: IDENTITY.role,
    email: `mailto:${IDENTITY.email}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: IDENTITY.locality,
      addressRegion: IDENTITY.region,
      addressCountry: IDENTITY.country,
    },
    // The two profiles the footer links. These are what an engine matches
    // against to merge this node with the GitHub and LinkedIn identities it
    // already holds — which is why W3 requires the name and role strings to be
    // byte-identical across all three.
    sameAs: [profileGithubUrl, linkedInUrl],
    // Pruned away entirely when the caller passes nothing, rather than
    // shipping a hardcoded skill list that would rot (P4).
    knowsAbout,
  };
}

/**
 * The WebSite node.
 *
 * No `potentialAction: SearchAction`, deliberately. The ⌘K command palette
 * (#41) is not URL-addressable — there is no `/search?q=` endpoint for a
 * consumer to call — and declaring a SearchAction pointing at a URL that does
 * not handle queries is a false claim that Google specifically flags. The seam
 * is noted here so #41 knows where to add it if the palette ever gains one.
 *
 * @returns {object} A schema.org WebSite node.
 */
export function website() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${ORIGIN}/`,
    name: IDENTITY.name,
    // POINTERS, not copies — see `ref`.
    publisher: ref(PERSON_ID),
    author: ref(PERSON_ID),
    inLanguage: 'en-GB',
  };
}

/**
 * The root graph, emitted once in the root layout.
 *
 * `@graph` (rather than two sibling script tags) is what makes the ids resolve
 * WITHIN one document: a consumer reading a graph can follow `{'@id': ...}` to
 * a node in the same block, where two separate blocks leave the reference
 * dangling and force the consumer to guess.
 *
 * @param {{knowsAbout?: string[]}} [options] Forwarded to `person()`.
 * @returns {object} A JSON-LD document containing the Person and WebSite nodes.
 */
export function personGraph(options) {
  return {
    '@context': 'https://schema.org',
    '@graph': [person(options), website()],
  };
}

/**
 * ProfilePage for /about — the page whose subject IS the person.
 *
 * `mainEntity` is the property that says so, and it is a reference: the Person
 * itself is defined once, in the root layout's graph, which is present on this
 * page too. So /about adds the "this page is about that entity" statement
 * without restating the entity.
 *
 * @param {{knowsAbout?: string[]}} [options] The derived stack topics, attached
 *   to the referenced Person here rather than in the root graph — /about is the
 *   page that actually renders the stack this claim is read from.
 * @returns {object} A JSON-LD ProfilePage document.
 */
export function profilePage({ knowsAbout } = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${absoluteUrl('/about')}#page`,
    url: absoluteUrl('/about'),
    isPartOf: ref(WEBSITE_ID),
    // When the caller has live skill data, the Person node is RESTATED here
    // with `knowsAbout` attached rather than referenced. That is the one place
    // restating is correct: JSON-LD merges nodes sharing an `@id`, so a second
    // partial node adds properties to the first rather than competing with it.
    // The root graph supplies identity; this supplies expertise, on the page
    // that can actually evidence it.
    mainEntity: knowsAbout
      ? { '@type': 'Person', '@id': PERSON_ID, knowsAbout }
      : ref(PERSON_ID),
  };
}

/**
 * ProfilePage for /cv, carrying the employment and education history.
 *
 * ── Why this is a second ProfilePage and not a merge into /about ────────────
 * Both pages are about the same Person, and both say so. That is not a
 * duplicate-content problem: `ProfilePage` describes the PAGE, and two pages
 * can legitimately profile one entity from different angles — /about is the
 * narrative, /cv is the record. Each has its own `@id` (`#page` scoped to its
 * own URL) and its own self-referential canonical, so nothing competes.
 *
 * The Person node is RESTATED rather than referenced, for the same reason
 * `profilePage` restates it when it has `knowsAbout`: JSON-LD merges nodes
 * sharing an `@id`, so a partial node ADDS properties to the one the root graph
 * already defined. `hasOccupation` and `alumniOf` belong on the page that
 * actually renders the evidence for them.
 *
 * ── What is deliberately NOT claimed ────────────────────────────────────────
 * `worksFor` is absent. It takes a single Organization, and the current state
 * is two concurrent roles (see journeyEmployment.js — concurrency is the normal
 * case in this history, not an edge). Picking one would publish a false
 * exclusive claim, and picking "the software one" would encode a preference as
 * a fact. `hasOccupation` carries the roles without asserting a single employer.
 *
 * Salary, `estimatedSalary` and seniority are absent because journeyData holds
 * none of them (P4).
 *
 * @param {{experience?: object[], education?: object[], knowsAbout?: string[]}}
 *   [options] Derived CV sections. Each is pruned when empty.
 * @returns {object} A JSON-LD ProfilePage document.
 */
export function cvPage({ experience = [], education = [], knowsAbout } = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${absoluteUrl('/cv')}#page`,
    url: absoluteUrl('/cv'),
    isPartOf: ref(WEBSITE_ID),
    // The PDF the page links to, declared as the machine-readable form of the
    // same document. This is the one place the two CVs are tied together for a
    // consumer: without it they are two unrelated URLs making overlapping
    // claims about one person, which is exactly the shape a de-duplicator
    // treats as suspicious.
    significantLink: absoluteUrl(CV_ASSET.path),
    mainEntity: {
      '@type': 'Person',
      '@id': PERSON_ID,
      knowsAbout,
      // One Occupation per distinct ROLE TITLE, not per journeyData row. Two
      // stints with the same title are one occupation held twice, and emitting
      // the row twice would read to a consumer as two different occupations
      // that happen to share a name.
      hasOccupation: [
        ...new Map(
          experience
            .filter((entry) => entry.role)
            .map((entry) => [
              entry.role,
              {
                '@type': 'Occupation',
                name: entry.role,
              },
            ]),
        ).values(),
      ],
      // Every institution that appears in the education history, deduplicated —
      // two awards from one college is one alma mater. `EducationalOrganization`
      // rather than the looser `Organization`: these are all schools, colleges
      // or universities, and the narrower type is the one a consumer can act on.
      // Deduplicated AFTER expansion, not before: two labels that expand to one
      // institution are one alma mater, and deduplicating on the short label
      // would only catch the cases that were already identical.
      alumniOf: [
        ...new Set(
          education.map((entry) => legalOrgName(entry.org)).filter(Boolean),
        ),
      ].map((name) => ({
        '@type': 'EducationalOrganization',
        name,
      })),
    },
  };
}

/**
 * CollectionPage + ItemList for /projects.
 *
 * The ItemList carries only positions and URLs, not copies of each project's
 * data. Each `item` is a reference to the `#project` node defined on that
 * project's own page — so the listing describes the SHAPE of the collection and
 * the detail pages remain the single source for each project's properties.
 *
 * @param {Array<{id: string|number, name: string}>} projects Project records.
 * @returns {object} A JSON-LD CollectionPage document.
 */
export function projectsCollection(projects) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${absoluteUrl('/projects')}#page`,
    url: absoluteUrl('/projects'),
    name: 'Projects',
    isPartOf: ref(WEBSITE_ID),
    about: ref(PERSON_ID),
    mainEntity: {
      '@type': 'ItemList',
      '@id': `${absoluteUrl('/projects')}#list`,
      numberOfItems: projects.length,
      itemListElement: projects.map((project, index) => ({
        '@type': 'ListItem',
        // 1-based: schema.org positions are ordinals, and a 0 is treated as
        // missing by several consumers.
        position: index + 1,
        url: absoluteUrl(`/projects/${project.id}`),
        name: project.name,
        item: ref(projectId(project.id)),
      })),
    },
  };
}

/**
 * SoftwareSourceCode for one project page, plus its breadcrumb trail.
 *
 * `SoftwareSourceCode` rather than `CreativeWork` or `SoftwareApplication`:
 * these are repositories, and the property that carries the most weight here —
 * `codeRepository` — belongs to that type. `SoftwareApplication` would imply a
 * distributable product with an operating system and a price, which none of
 * these are.
 *
 * A private project contributes NO `codeRepository` even though the field is
 * known: `pruneEmpty` drops it when the caller passes undefined, and pointing a
 * public schema property at a URL that answers 404 to everyone is worse than
 * saying nothing.
 *
 * @param {object} project A `projectsData` record.
 * @param {{programmingLanguage?: string[]}} [options] Language names, most-used
 *   first, from `languagesFor(project)` in projectLanguages.js — the committed
 *   src/data/project-languages.json map, never a live fetch.
 * @returns {object} A JSON-LD document containing the project and its trail.
 */
export function projectPage(project, { programmingLanguage } = {}) {
  const url = absoluteUrl(`/projects/${project.id}`);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareSourceCode',
        '@id': projectId(project.id),
        url,
        name: project.name,
        description: project.description,
        // The repo's creation date, from data.js. `dateCreated` takes an
        // ISO-8601 date and `date` is already stored in exactly that form, so
        // it passes through untouched — no reformatting, nothing invented.
        dateCreated: project.date,
        // Only for public repositories. A `private: true` record gets nothing
        // here (see the note above).
        codeRepository: project.private
          ? undefined
          : `https://github.com/${project.repo}`,
        // From the caller's `languagesFor(project)` — the committed
        // src/data/project-languages.json map, regenerated by
        // scripts/refresh-project-languages.mjs and reviewed as a diff. NOT the
        // live /api/github-skills route and never a typed list: `next build`
        // makes no network call and reads no secret to publish this, which is
        // the constraint the property was originally omitted over (docs/seo.md
        // §12). Undefined for a private or unrefreshed project, and pruned.
        programmingLanguage,
        // The category this project is filed under on /projects. `genre` is the
        // vocabulary's field for that and needs no mapping.
        genre: project.category,
        author: ref(PERSON_ID),
        isPartOf: ref(WEBSITE_ID),
      },
      breadcrumbList([
        { name: 'Home', path: '/' },
        { name: 'Projects', path: '/projects' },
        { name: project.name, path: `/projects/${project.id}` },
      ]),
    ],
  };
}

/**
 * TechArticle + breadcrumb for one `/notes/[slug]` document.
 *
 * ── Why this is a builder and not `sectionPage()` with the type swapped ─────
 * Because that is what it was, and the result was not a TechArticle at all.
 * The call site spread `sectionPage({...})` into a node position and set
 * `'@type': 'TechArticle'` beside it — but `sectionPage` returns a whole
 * DOCUMENT, `{'@context', '@graph': [WebPage, BreadcrumbList]}`, so what
 * reached the page was a node carrying a nested `@context` and a nested
 * `@graph`. Four things followed from that one line:
 *
 *   • The article had no `url`, `name`, `headline` or `description` of its own
 *     — those belonged to the WebPage buried inside the nested graph.
 *   • That WebPage was still typed `WebPage`, so the page never actually
 *     declared itself a TechArticle despite the literal saying so.
 *   • A `@graph` sat inside a node, which is not a shape the vocabulary has.
 *   • The page published TWO breadcrumb trails: the nested two-crumb
 *     Home › title one and the real three-crumb one beside it.
 *
 * The document/node distinction is invisible at a call site — both are plain
 * objects and spreading either one is valid JavaScript — which is exactly why
 * composing a note's graph now happens HERE, beside the builders it composes,
 * rather than in the route. Every other page in this file returns a finished
 * document for the same reason.
 *
 * `TechArticle`, not `Article` or `BlogPosting`: these are technical
 * documentation about how a system works, which is what that type is for.
 * `BlogPosting` would imply a dated editorial post and invite a
 * `datePublished` these documents do not have — they are revised continuously,
 * and a made-up publication date is precisely the fabrication P4 rules out.
 * `dateModified` is absent for the same reason and is not a gap: the sitemap
 * already carries freshness as `lastmod`, derived from the file's real git
 * history rather than from a literal typed in here.
 *
 * @param {{slug: string, title: string, description?: string}} note A record
 *   from `readNotes()` — `description` is its opening paragraph, and is pruned
 *   when the document has none.
 * @returns {object} A JSON-LD document containing the article and its trail.
 */
export function notePage({ slug, title, description }) {
  const path = `/notes/${slug}`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        // `#article`, matching `#project`'s precedent: the fragment names what
        // the node IS, so a consumer holding the id can tell an article from
        // the page that renders it without dereferencing anything.
        '@id': `${absoluteUrl(path)}#article`,
        url: absoluteUrl(path),
        // Both, and deliberately the same string. `headline` is the property
        // Google reads for an article; `name` is the one a generic CreativeWork
        // consumer reads. There is one title, so stating it twice states no
        // second fact — where omitting either loses one of those two readers.
        headline: title,
        name: title,
        description,
        // POINTERS, as everywhere else in this file. Note the absence of
        // `about`: `sectionPage` claims the person as its subject because those
        // pages ARE about him, and these documents are not — they are about
        // how the site works. Authorship is the true claim; subject is not.
        author: ref(PERSON_ID),
        isPartOf: ref(WEBSITE_ID),
        inLanguage: 'en-GB',
      },
      breadcrumbList([
        { name: 'Home', path: '/' },
        { name: 'Notes', path: '/notes' },
        { name: title, path },
      ]),
    ],
  };
}

/**
 * A BreadcrumbList node.
 *
 * Fixes half of F8: the project pages had no trail at all, so a crawler that
 * arrived at `/projects/7` directly had no declared path back up to the
 * listing. The other half — sibling cross-links — is markup on the page
 * itself, since a breadcrumb is a claim about hierarchy and cannot substitute
 * for a real link.
 *
 * @param {Array<{name: string, path: string}>} trail Root-first crumbs.
 * @returns {object} A schema.org BreadcrumbList node.
 */
export function breadcrumbList(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      // The LAST crumb carries no `item`, per Google's guidance: it is the
      // current page, and a self-link in a breadcrumb is what makes the
      // Rich Results Test warn about a trail that does not terminate.
      item: index === trail.length - 1 ? undefined : absoluteUrl(crumb.path),
    })),
  };
}

/**
 * EducationalOccupationalCredential list for /qualifications.
 *
 * Each credential is attached to the Person via `hasCredential`, which is what
 * connects "this site lists a degree" to "this entity holds that degree". A
 * bare list of credentials with no holder is unattributable.
 *
 * @param {Array<{name: string, issuer?: string, date?: string, type?: string}>} credentials
 *   Credential records.
 * @returns {object} A JSON-LD document for the qualifications page.
 */
export function qualificationsPage(credentials) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${absoluteUrl('/qualifications')}#page`,
    url: absoluteUrl('/qualifications'),
    name: 'Qualifications',
    isPartOf: ref(WEBSITE_ID),
    // Same merge-by-id mechanism as `profilePage`: a partial Person node whose
    // only job is to add `hasCredential` to the entity the root graph defined.
    mainEntity: {
      '@type': 'Person',
      '@id': PERSON_ID,
      hasCredential: credentials.map((credential) => ({
        '@type': 'EducationalOccupationalCredential',
        name: credential.name,
        // `credentialCategory` distinguishes a degree from a certificate.
        // Consumers use it to decide which to surface, so a missing value is
        // better than a wrong one — the caller supplies it or it is dropped.
        credentialCategory: credential.type,
        dateCreated: credential.date,
        recognizedBy: credential.issuer
          ? { '@type': 'Organization', name: credential.issuer }
          : undefined,
      })),
    },
  };
}

/**
 * A generic WebPage node with a breadcrumb, for the remaining section routes.
 *
 * Used by /journey, /uses, /contact and /my-past — pages that are real content
 * but do not map onto a more specific type. Claiming `AboutPage` or
 * `ContactPage` for them would be marginally more specific and no more useful;
 * what those pages actually need is to be declared part of the site and
 * attributed to the person, which is what this does.
 *
 * @param {{path: string, name: string, description?: string}} page Page facts.
 * @returns {object} A JSON-LD WebPage document.
 */
export function sectionPage({ path, name, description }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${absoluteUrl(path)}#page`,
        url: absoluteUrl(path),
        name,
        description,
        isPartOf: ref(WEBSITE_ID),
        about: ref(PERSON_ID),
        inLanguage: 'en-GB',
      },
      breadcrumbList([
        { name: 'Home', path: '/' },
        { name, path },
      ]),
    ],
  };
}
