// Single source of truth for everything discoverability-related (issue #32,
// W1). `sitemap.js`, `robots.js`, `manifest.js`, `schema.js`, `llms.txt`, the
// canonical builder and the drift test ALL read this file.
//
// That centralisation is the point, not a tidiness preference. The failure
// mode this module exists to prevent is a route that is declared in one place
// and forgotten in another — present in the sitemap but with no canonical, or
// carrying schema but absent from the sitemap. Reading one registry makes that
// impossible by construction: a route can only be missing from one consumer if
// it is missing from all of them, and tests/unit/sitemapDrift.test.js fails CI
// when a `page.js` exists on disk with no entry here.
//
// SECRETS: nothing in this file is a credential. `ORIGIN` is a public domain
// and the only env var read is a non-secret origin override.
//
// The one import is deliberate and safe: every consumer of this module is
// SERVER-side (sitemap, robots, manifest, llms.txt, route metadata, the cron
// report), and sitemap.js already reads both files together, so pulling the
// project data in here adds nothing to any client bundle. Keep it that way —
// a `'use client'` importer would start shipping `projectsData` to browsers.
import { projectsData } from '@/app/data';
import { countWord } from '@/lib/numberWords';

// ── Origin ──────────────────────────────────────────────────────────────────
// The production apex is the canonical host. `www.ma.codes` answers too (it is
// a Vercel domain alias), so next.config.mjs 308s it here and every canonical
// below names this origin — two independent signals saying the same thing, per
// F2/F3.
//
// Overridable by env for one reason only: a fork, or a preview deployment that
// wants self-referential canonicals rather than ones pointing at production.
// It is deliberately NOT wired to VERCEL_URL — a preview's canonical pointing
// at the preview is usually WRONG (it de-duplicates production away), so
// opting in has to be explicit.
//
// No trailing slash, ever: `canonical.js` joins paths onto this and a trailing
// slash would produce `https://ma.codes//about`.
export const ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://ma.codes'
).replace(/\/+$/, '');

// ── Identity ────────────────────────────────────────────────────────────────
// The strings an answer engine merges into one entity. They must be
// byte-identical to what the GitHub profile and LinkedIn say (W3's
// entity-consistency requirement) — divergence is precisely what stops an
// assistant deciding the three pages describe one person.
export const IDENTITY = {
  name: 'Muhammad Abdullah',
  // Used in the homepage title (F5) and in Person.jobTitle.
  role: 'Software Engineer',
  // Matches footer-data.js `location`, shortened to the form a search result
  // reads well in. The fuller string stays the footer's.
  locality: 'Bolton',
  region: 'Greater Manchester',
  country: 'GB',
  // Public contact address — the same default footer-data.js carries. Not a
  // secret: it is printed in the footer of every page.
  email:
    process.env.NEXT_PUBLIC_CONTACT_EMAIL ||
    'muhammad.abdullah33176444@gmail.com',
};

// ── Counts in prose ─────────────────────────────────────────────────────────
// A description that states a number is a description that goes stale: adding
// a twelfth project would leave /projects telling Google there are eleven, and
// nothing would fail. So the number is read from the array rather than typed —
// the same reasoning that makes sitemap.js generate `/projects/[id]` from
// `projectsData` instead of hand-listing the URLs.
//
// `countWord` lives in its own module rather than here because the homepage
// states a count too and is `'use client'`: importing it from THIS file would
// pull the whole route registry into the browser bundle.
//
// Because the WORD is looked up in a table there, `src/lib/numberWords.js` is a
// crawl-surface input in its own right and is watched by the two routes whose
// published copy reads through it — see the note on those `sources` entries.

// ── Route registry ──────────────────────────────────────────────────────────
// One entry per PUBLIC route pattern. `/projects/[id]` is deliberately absent:
// it is generated from `projectsData` in sitemap.js so the sitemap and
// `generateStaticParams()` cannot diverge (risk §10.3 — both read the same
// array, and neither hand-lists a URL).
//
// `priority` and `changeFrequency` are hints, not instructions — Google has
// said for years that it largely ignores both. They are declared anyway
// because Bing and several AI crawlers still read them, and because stating a
// deliberate ordering costs nothing.
//
// `sources` lists the files whose last commit defines the route's
// `lastModified` (P4). A route's own page file is never enough on its own —
// /uses renders almost entirely out of src/lib/uses and src/components/uses,
// so a copy change there is the real modification date. Each entry below lists
// only what is SPECIFIC to that route; `SHARED_ROUTE_SOURCES` is appended to
// every one of them when `ROUTES` is built, immediately after the array.
//
// ── `src/app/data.js`, and the line drawn around it ─────────────────────────
// The shared data module is CONTENT, not infrastructure: `projectsData`,
// `journeyData`, `usesData` and `BtnList` are rendered into server HTML as
// text, links and structured data. Four routes below list it because they read
// it first-hand — `/` for the `sr-only` summary's project count and the eight
// orbit links, `/about` for the `knowsAbout` array built from `usesData.stack`,
// `/qualifications` for the credentials derived from `journeyData`, and `/uses`
// because that data IS the page — alongside `/projects` and `/journey`, which
// already did.
//
// `/contact`, `/my-past` and `/guestbook` deliberately DO NOT list it, though
// their module graphs reach it. They reach it only by way of THIS file, which
// imports `projectsData` to count builds for the `/projects` description. That
// is the registry computing another route's copy, not these routes rendering
// anything, and listing it would re-stamp three URLs every time a project
// record changed — the over-stamping the note on `SHARED_ROUTE_SOURCES` below
// is careful about.
//
// The rule, and it is the one the test enforces: a route lists the data module
// when its graph reaches it by SOME PATH THAT DOES NOT PASS THROUGH THIS FILE.

// ── The shared headline ─────────────────────────────────────────────────────
// `PageTitle` renders each section's `<h1>` and `<h2>` — the strongest heading
// signal on the page, and real crawlable text in the server-rendered HTML
// (the animated spans are `aria-hidden`; the `<h1>` carries the full string).
// So it is crawl surface, and a commit to it changes what every section page
// says at the top while nothing in that route's own directory moves.
//
// Eight of the nine routes render it, which makes a shared list tempting — and
// wrong on both of the existing ones. `SHARED_ROUTE_SOURCES` reaches all 20
// URLs, and the homepage does not render a `PageTitle` at all (its headline is
// the orbit hero). `SUB_PAGE_SHARED_SOURCES` reaches the eleven
// `/projects/[id]` pages through `PROJECT_SOURCES`, and the detail scene does
// not render one either — its heading comes from the project record. Either
// list would therefore stamp URLs that never published a line of it.
//
// A named constant rather than the string eight times: eight literals are eight
// chances to typo a path that fails SILENTLY, since `git log` over a pathspec
// that matches nothing simply contributes no date.
const PAGE_TITLE_SOURCE = 'src/components/PageTitle.jsx';

const ROUTE_DEFINITIONS = [
  {
    path: '/',
    // F5: the homepage title carried no role qualifier, so every non-branded
    // intent had nothing in the snippet to match. Brand still leads — this is
    // a personal site and the name is the primary query — with the role as an
    // em-dashed qualifier rather than a keyword list (W7, P7).
    title: 'Muhammad Abdullah — Software Engineer',
    description:
      'Software engineer in Bolton building fast, considered web applications with Next.js, React and TypeScript. Projects, credentials and the tools behind them.',
    changeFrequency: 'weekly',
    priority: 1,
    indexable: true,
    sources: [
      'src/app/page.js',
      // `src/app/layout.js` is NOT here: it wraps every route, so it lives in
      // `SHARED_ROUTE_SOURCES` below. Listing it again would be a duplicate
      // pathspec and, worse, would read as though it were homepage-specific —
      // which is exactly the belief that kept it out of the shared list.
      'src/components/navigation',
      // Both server-rendered halves of the F1 fix read this file: page.js
      // counts `projectsData` for the `sr-only` summary, and Navigation maps
      // `BtnList` into the eight orbit links. A twelfth project or a renamed
      // nav entry changes the homepage's HTML.
      'src/app/data.js',
      // The count above is printed as a WORD, and the word comes from a lookup
      // table in this module — so the `sr-only` summary reads "eleven projects"
      // only while that table says so. Watching `data.js` catches a twelfth
      // project; this catches an edit to how eleven is spelled, which changes
      // the same sentence with nothing in `data.js` touched.
      'src/lib/numberWords.js',
      // The ONE file the homepage publishes from the footer without rendering
      // the footer. `/` is outside the `(sub pages)` group, so it carries none
      // of `SUB_PAGE_SHARED_SOURCES` (see there) — but the root layout emits
      // `personGraph()` on every page, and `schema.js` reads `profileGithubUrl`
      // and `linkedInUrl` from this module for the Person's `sameAs`. Those two
      // URLs are the identity claim an engine matches this site against, so
      // editing one rewrites the homepage's JSON-LD.
      //
      // Named as the exact module rather than `src/components/footer`: the
      // directory is the largest block of markup on the other nineteen URLs and
      // none of it reaches `/`, so watching the directory here would re-stamp
      // the sitemap's highest-priority URL for every footer change — the
      // over-stamp the shared-source split exists to avoid.
      'src/components/footer/footer-data.js',
    ],
  },
  {
    path: '/about',
    title: 'About',
    description:
      'The engineer behind the ember — the story, the stack, and live GitHub telemetry on what is being built right now.',
    changeFrequency: 'monthly',
    priority: 0.9,
    indexable: true,
    sources: [
      'src/app/(sub pages)/about',
      'src/components/about',
      // about/layout.js reads `usesData.stack` to build the `knowsAbout` array
      // in this page's ProfilePage JSON-LD, so adding a tool to /uses changes
      // what this page claims the person knows.
      'src/app/data.js',
      PAGE_TITLE_SOURCE,
    ],
  },
  {
    path: '/projects',
    title: 'Projects',
    description:
      `${countWord(projectsData.length)} builds — web, systems, mobile and AI — ` +
      'each tracked live from its own GitHub board, with the stack and ' +
      'completion state on every card.',
    changeFrequency: 'weekly',
    priority: 0.9,
    indexable: true,
    sources: [
      'src/app/(sub pages)/projects/page.js',
      'src/app/data.js',
      'src/components/projects',
      // This route's own description interpolates `countWord(projectsData.length)`
      // — "Eleven builds — web, systems, mobile and AI" — and that string is the
      // `<title>`/meta description, the OG and Twitter cards, the description
      // stated in its JSON-LD and the line `/llms.txt` prints. So the word table
      // is an input to THIS route's published copy.
      //
      // Worth distinguishing from the `data.js` line drawn above, which the
      // `/contact`, `/my-past` and `/guestbook` entries turn on: those reach
      // `data.js` only because the registry counts builds for ANOTHER route's
      // description, and render nothing from it. Here the registry is computing
      // this route's own snippet, which is exactly the crawl surface `<lastmod>`
      // is meant to date.
      'src/lib/numberWords.js',
      // Rendered by `src/components/projects/index.jsx`, not by page.js — the
      // one route where the headline arrives through the listing component.
      PAGE_TITLE_SOURCE,
    ],
  },
  {
    path: '/qualifications',
    title: 'Qualifications',
    description:
      'Degrees, certificates and professional credentials — the verified paper trail behind the practice, with every certificate viewable.',
    changeFrequency: 'monthly',
    priority: 0.8,
    indexable: true,
    sources: [
      'src/app/(sub pages)/qualifications',
      'src/components/qualifications',
      // qualifications/layout.js derives the page's
      // `EducationalOccupationalCredential[]` from `journeyData` — the
      // credentials are published from this file, not from the carousel.
      'src/app/data.js',
      PAGE_TITLE_SOURCE,
    ],
  },
  {
    path: '/journey',
    title: 'Journey',
    description:
      'Every role, qualification and volunteering post as one scroll-driven timeline — from Bolton College in 2018 to shipping production software today.',
    changeFrequency: 'monthly',
    priority: 0.8,
    indexable: true,
    sources: [
      'src/app/(sub pages)/journey',
      'src/app/data.js',
      'src/components/journey',
      PAGE_TITLE_SOURCE,
    ],
  },
  {
    path: '/uses',
    title: 'Uses',
    description:
      'The machine, the bench, the stack and the pipeline — every tool on this page verified against the repositories and the build that ships it.',
    changeFrequency: 'monthly',
    priority: 0.7,
    indexable: true,
    // The longest list in the registry, and it has to be. This page's premise
    // is that every claim on it is verified against the repository at build
    // time, so the repository IS its content: `readBuildFacts()` opens the
    // eight paths below and prints what it finds — the Node version off
    // `.nvmrc`, dependency versions and counts off the manifest and lockfile,
    // the cron schedule off `vercel.json`, the schematic's stage labels off the
    // workflow files' own `name:` fields, and the spec/route counts off the
    // test and API directories. Verified in the prerendered HTML, not assumed:
    // `22.14.0`, `14.2.30`, the test-file count and all six workflow names
    // appear verbatim in it.
    //
    // `src/lib/uses` covers the READER; these cover what it reads, which is the
    // distinction the first cut of this list missed. Watching the reader alone
    // means a dependency bump rewrites the bill of materials while `<lastmod>`
    // insists the page is unchanged.
    //
    // Cost, in the same terms as the notes below: this is now the most
    // frequently re-stamped route on the site, and some of that is coarse —
    // editing an existing test does not change the count the page prints, but
    // `tests/unit` is watched per directory. Taken deliberately, because a page
    // whose subject is the state of this repository genuinely does change with
    // the repository more often than any other, which is also why it is the one
    // route where the reader and the read must both be listed.
    sources: [
      'src/app/(sub pages)/uses',
      'src/lib/uses',
      'src/components/uses',
      // `usesData` is this page — the machine rows, the bench, the extensions
      // and the stack the plates render.
      'src/app/data.js',
      // Everything `readBuildFacts()` opens. Pinned against the reader's own
      // source by the `uses build facts` cases in sitemapDrift.test.js, which
      // extract these paths from buildFacts.js rather than trusting this list.
      'package.json',
      'package-lock.json',
      '.nvmrc',
      'vercel.json',
      '.github/workflows',
      'tests/unit',
      'tests/e2e',
      'src/app/api',
      PAGE_TITLE_SOURCE,
    ],
  },
  {
    path: '/contact',
    title: 'Contact',
    description:
      'Start a conversation about a role or a project — a contact form that refines your message as you write it and never loses a draft.',
    changeFrequency: 'yearly',
    priority: 0.7,
    indexable: true,
    sources: [
      'src/app/(sub pages)/contact',
      'src/components/contact',
      PAGE_TITLE_SOURCE,
    ],
  },
  {
    path: '/my-past',
    title: 'My Past',
    description:
      'The university-era portfolio where this began — hand-built with plain HTML, CSS and JavaScript, kept online as an honest before picture.',
    changeFrequency: 'yearly',
    priority: 0.5,
    indexable: true,
    sources: ['src/app/(sub pages)/my-past', PAGE_TITLE_SOURCE],
  },
  {
    path: '/guestbook',
    // Engagement, not search (W7's intent map leaves its primary intent
    // blank), so it is the lowest priority in the registry. It stays
    // indexable — it is a real page and a real signal that people visit.
    //
    // It carries the same `WebPage` + breadcrumb node every other section
    // route does, and NOTHING about the entries. That distinction is
    // deliberate: describing the page is a claim the site can make, while
    // marking up visitor-authored messages as site content would be the site
    // vouching for text it did not write — and would feed user input into the
    // JSON-LD serialiser, which is the threat model JsonLd.jsx's escaping
    // exists for.
    title: 'Guestbook',
    description:
      'Leave your mark on the wall — a neon message board signed by visitors through GitHub or Google, with live presence and reactions.',
    changeFrequency: 'daily',
    priority: 0.4,
    indexable: true,
    sources: [
      'src/app/(sub pages)/guestbook',
      'src/components/guestbook',
      'src/lib/guestbook',
      PAGE_TITLE_SOURCE,
    ],
  },
];

// ── Sources every indexable URL shares ──────────────────────────────────────
// THIS FILE and the two builders that publish it are part of what every route
// emits, and until 2026-09-12 no `sources` list said so — which made them the
// inputs that could change a URL's crawl surface without moving its
// `<lastmod>`.
//
// It is not a marginal input either. Four published surfaces per route read
// straight out of this file:
//
//   • `<title>` and `<meta name="description">`, via `routeFor(path)` →
//     `sectionMetadata()` in every section route's page/layout.
//   • The OG and Twitter card fields, restated from the same two strings.
//   • The JSON-LD graph — `schema.js` reads `IDENTITY` and `ORIGIN` for every
//     node's `@id`, the `Person`'s name/role/locality/email, and each page's
//     stated description.
//   • `/llms.txt`, which prints `route.title` and `route.description` verbatim.
//
// `ORIGIN` also reaches every page through `canonical.js`, so this file decides
// the canonical URL each document declares about itself. Editing a description
// therefore rewrites the snippet a crawler displays, the card a link unfurls to
// and the text an assistant quotes — while the sitemap swore nothing had
// changed. That is the same class of defect as the `/projects/[id]` source list
// pointing at the listing directory, and it is the reason this is centralised
// rather than pasted into nine entries: a shared list can only be forgotten
// once, where nine copies can be forgotten nine times.
//
// ── The builders belong here for the same reason the values do ──────────────
// Watching only this file watches the VALUES and not the code that turns them
// into markup, which is half an answer. `canonical.js` and `schema.js` are both
// reached by every route through the root layout — `alternatesFor('/')` and
// `personGraph()` in src/app/layout.js — and the nine section routes import a
// page builder from `schema.js` on top of that.
//
// Neither is a passive pipe. `canonical.js` owns the trailing-slash and
// double-slash normalisation, so a change there rewrites the canonical every
// document on the site declares about itself — the one metadata field where a
// near-miss is worse than an omission, because a page that names the wrong URL
// de-duplicates itself away. `schema.js` decides which JSON-LD nodes exist,
// what `@id` each carries and which fields it states, so a change there rewrites
// the entity graph an assistant resolves "who is Muhammad Abdullah" against.
// Either can change crawler-visible HTML at all 20 URLs the shared list reaches
// — the nine routes and the eleven project pages, the CV asset excepted since it
// watches only its own binary — while every `title` and `description` in this
// file stands still. The same defect one level out.
//
// `src/components/seo/JsonLd.jsx` is deliberately NOT here, and the line is
// worth stating because the three files look alike from a distance. It is the
// SERIALISER: `pruneEmpty` and the escaping that puts an object inside a
// `<script>` tag. It decides how the graph is printed, never what the graph
// says, so a commit to it changes no claim a crawler reads. The same reasoning
// is recorded against it in `UNWATCHED_COMPONENTS` in
// tests/unit/sitemapDrift.test.js; keep the two in step.
//
// ── The cost, stated rather than discovered later ───────────────────────────
// `git log` resolves per FILE, not per line, so every route now shares three
// date inputs: editing only `/about`'s description moves all nine routes'
// `<lastmod>`, editing `AI_CRAWLERS` — which changes `robots.txt` and no page at
// all — moves all of them too, and so does a comment reflow in `schema.js`.
//
// Accepted, for three reasons. It is the precedent already set: `src/app/data.js`
// sits in `/projects`, `/journey` and the project pages' list, so editing one
// project record has always re-stamped `/journey`. It is the better of the two
// errors — a stale date tells a crawler not to bother re-reading a page whose
// description it would now display differently, and suppressing a recrawl is
// worse than buying one that finds little changed. And all three files are
// almost entirely crawl-surface: of what this one holds, only the two
// crawl-policy arrays can change without altering a page, and the other two
// exist for no purpose except to produce markup a crawler reads — there is no
// such thing as an edit to `canonical.js` that is not about a canonical.
//
// The per-line alternative (`git log -L`) was not taken: it re-reads as a range
// of lines rather than a file, so it breaks on every reformat and reorder of
// this array, and it would trade a date that is occasionally too new for one
// that is silently wrong after a refactor.
export const SHARED_ROUTE_SOURCES = [
  // The ROOT LAYOUT, and the one entry here that is a rendered file rather than
  // a module the rendering reads. It wraps every route — Next composes it around
  // all 20 URLs — and what it emits is crawl surface, not chrome: the root
  // metadata (the title template, `metadataBase`, the robots directives and the
  // OG/Twitter defaults a section route does not restate) and the `Person` +
  // `WebSite` JSON-LD graph, rendered as `<JsonLd id="ld-root" data={personGraph()} />`
  // on every page of the site.
  //
  // It sat in the HOMEPAGE's own `sources` and nowhere else, which is the same
  // mistake as the two builders below in a more deceptive form: the file looked
  // watched, and the entry naming it was a route-specific list, so a root-layout
  // commit moved `/` and left the other nineteen `<lastmod>` values untouched.
  // Composition is invisible to an import graph, which is why nothing caught it.
  'src/app/layout.js',
  'src/lib/seo/site.js',
  'src/lib/seo/canonical.js',
  'src/lib/seo/schema.js',
];

// ── Sources every NON-HOME indexable URL shares ─────────────────────────────
// `SHARED_ROUTE_SOURCES` above is what EVERY URL publishes from. It is not the
// whole shared surface, and treating it as though it were left a second gap of
// the same shape one level down: the homepage sits at `src/app/page.js` under
// the root layout, while all eight other section routes and all eleven project
// pages live inside the `(sub pages)` route group and share a second layer that
// `/` never touches.
//
// Everything here renders into those nineteen documents and no others:
//
//   • `src/app/(sub pages)/layout.js` — the group layout. It is the reason this
//     set has to exist separately, and the reason no import graph can find it:
//     Next COMPOSES a layout around a route, so there is no `import` edge from
//     a page to its layout at all. A walker that follows imports declares it
//     unreachable from every route it renders on.
//   • `src/components/footer` — rendered by that layout, and the largest block
//     of crawler-visible text and internal links on every one of these pages.
//     `footer-data.js` inside it is read by `schema.js` for the `Person`'s
//     `sameAs`, so one edit there changes both the visible links and the
//     structured data. That module is the one piece of this directory that
//     reaches `/` as well — through the root layout's graph, not through any
//     footer — so the homepage watches the FILE on its own entry rather than
//     inheriting the directory here. Keep the two in step.
//   • `src/components/HomeBtn.jsx`, `src/components/ProjectsBtn.jsx` — also the
//     layout's children, each rendering a server-side `<Link>` (`/` and
//     `/projects`). Small files, but internal links are exactly what a crawler
//     follows.
//   • `src/lib/og/meta.js` — `sectionMetadata()`, which builds the `<title>`,
//     meta description, canonical and the OG/Twitter cards for these routes.
//     The homepage deliberately does NOT flow through it (its metadata is
//     declared directly in `src/app/layout.js`), which is precisely why this
//     belongs here rather than in the shared list above.
//
// `src/lib/fluidScale` is imported by that layout and deliberately left out: it
// returns CSS sizing values, so it changes how a page looks and nothing a
// crawler reads. Same line the `src/components/seo` serialiser exclusion draws.
//
// The homepage is excluded by PATH rather than by listing these on eight
// entries: `/` genuinely does not render any of it, and watching them there
// would re-stamp the one URL with the highest priority in the sitemap every
// time the footer changed — the over-stamp the note above is careful about,
// applied to the page that can least afford it.
export const SUB_PAGE_SHARED_SOURCES = [
  'src/app/(sub pages)/layout.js',
  'src/components/footer',
  'src/components/HomeBtn.jsx',
  'src/components/ProjectsBtn.jsx',
  'src/lib/og/meta.js',
];

/**
 * The route registry, each entry's `sources` completed with the shared lists.
 *
 * Built by `map` rather than by repeating the paths in nine literals so that
 * adding a shared input later reaches every route at once — and so that the
 * definitions above stay readable as what they are, the per-route half.
 *
 * Two shared lists, not one: `SHARED_ROUTE_SOURCES` is what every URL
 * publishes, `SUB_PAGE_SHARED_SOURCES` what everything inside the `(sub pages)`
 * group publishes. The homepage is the only route outside that group, so the
 * test is a path comparison rather than a flag on each entry — a flag would be
 * a second place to keep in step with where the file actually lives on disk.
 */
export const ROUTES = ROUTE_DEFINITIONS.map((route) => ({
  ...route,
  sources: [
    ...route.sources,
    ...SHARED_ROUTE_SOURCES,
    ...(route.path === '/' ? [] : SUB_PAGE_SHARED_SOURCES),
  ],
}));

// ── The CV PDF ──────────────────────────────────────────────────────────────
// Indexable BY DECISION, not by accident (F6, owner call 2026-09-11). It is a
// first-class landing page for name queries, so it is declared here, given a
// real /Title and /Author (scripts/seo-pdf-metadata.mjs), served with an
// explicit X-Robots-Tag (next.config.mjs) and listed in the sitemap.
//
// It is NOT a member of ROUTES: it is not an app-router page, so the drift
// test must not expect a `page.js` for it, and it carries no canonical or
// JSON-LD (a PDF can carry neither).
export const CV_ASSET = {
  path: '/Muhammad_Abdullah_CV.pdf',
  changeFrequency: 'monthly',
  priority: 0.6,
  // The binary itself is the only source that matters for its lastModified.
  sources: ['public/Muhammad_Abdullah_CV.pdf'],
};

// ── Crawl policy ────────────────────────────────────────────────────────────
// Paths no crawler should spend budget on. Everything here is either a
// non-content surface or a route that cannot usefully be indexed.
//
// `/api/` covers every route handler. None of them render content: they return
// JSON, and several are bearer-guarded cron endpoints that would answer 401 to
// a crawler anyway — a 401 in Search Console's coverage report is noise, not
// information.
export const DISALLOWED_PATHS = [
  '/api/',
  // The OG/Twitter card renderers. They emit PNGs meant to be fetched by an
  // unfurler that was handed the URL in a meta tag, never crawled directly,
  // and an image-search result for a share card is not a useful entrance.
  '/og/',
];

// AI-crawler posture (F7). The default is ALLOW and it is stated rather than
// inherited: this site wants to be read and cited by assistants, because a
// growing share of "who is this person" lookups happen inside one rather than
// in a search box. Naming the agents explicitly — instead of relying on the
// wildcard — is what makes that a policy rather than an accident, and it is
// the hook to tighten later if the posture ever changes.
//
// Every one of these gets the same rules as the wildcard group. If you ever
// want to exclude one, give it its own stanza with `disallow: ['/']` — do not
// silently remove it from this list, or it falls back to the wildcard's allow
// and the intent is lost.
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'meta-externalagent',
  'Bytespider',
  'CCBot',
];

// ── Lookup helpers ──────────────────────────────────────────────────────────

/**
 * The registry entry for a route path, or undefined.
 *
 * @param {string} path Route path, leading slash, no origin (e.g. `/about`).
 * @returns {object|undefined} The matching ROUTES entry.
 */
export function routeFor(path) {
  return ROUTES.find((r) => r.path === path);
}

// ── Derived claims for the entity graph ─────────────────────────────────────
// Both functions below DERIVE a schema claim from data this repository already
// holds and already renders. Neither introduces a new list to maintain, which
// is P1 applied to structured data: a `knowsAbout` array typed by hand is wrong
// within two projects, and a credential list typed a second time is a second
// thing to forget.

/**
 * `Person.knowsAbout` topics, derived from the `/uses` stack data.
 *
 * ── Why not /api/github-skills, which W2 asked for ─────────────────────────
 * W2 specifies feeding this from the live skills route. That route needs
 * `GITHUB_TOKEN` and makes paged GraphQL + REST calls, and this claim has to be
 * in the SERVER-RENDERED HTML to be worth anything — the crawlers that most
 * need it do not run JavaScript, which is the entire premise of W3. So it would
 * have to be fetched at BUILD time, and that has three problems:
 *
 *   1. A build with no token, an expired token, or a rate-limited API either
 *      fails the deploy or silently ships an empty claim. Neither is acceptable
 *      for a decorative field.
 *   2. A value fetched at build is a SNAPSHOT, not live data. It rots at
 *      exactly the rate a curated list does — while being invisible to review,
 *      because no diff ever shows it changing.
 *   3. It would make `next build` depend on a network call and a secret,
 *      which nothing else in this build does.
 *
 * `usesData.stack` is the better source and is genuinely derived: it is the
 * curated mirror of that same crawl's detected set (see its note in data.js),
 * it is already reviewed in diffs, it is already rendered on `/uses`, and so
 * the schema claim and the visible page cannot disagree. Adding a skill to
 * `/uses` updates this by construction.
 *
 * `libraries` is excluded deliberately. `knowsAbout` is a list of TOPICS, and
 * `dotenv`, `nodemon` and `autoprefixer` are not topics anyone knows about —
 * they are transitive tooling. Including them would pad the claim and dilute
 * the entries that matter.
 *
 * @param {object} stack A `usesData.stack` shaped object.
 * @returns {string[]} Display names, de-duplicated, order preserved.
 */
export function knowsAboutFromStack(stack) {
  if (!stack || typeof stack !== 'object') return [];
  const groups = ['languages', 'frameworks', 'tools', 'software'];
  const names = groups.flatMap((group) =>
    Array.isArray(stack[group])
      ? stack[group].map((item) => item?.displayName).filter(Boolean)
      : [],
  );
  // A Set preserves insertion order, so languages still lead — which is the
  // order a reader (and a consumer ranking the list) should meet them in.
  return [...new Set(names)];
}

/**
 * `EducationalOccupationalCredential` records, derived from `journeyData`.
 *
 * The `/qualifications` carousel would be the obvious source, but its `CARDS`
 * array lives inside a `'use client'` component, is not exported, and carries
 * no issuer or date — only a title, a category and an image path. It cannot
 * answer "who awarded this and when", which is the half of a credential that
 * makes it verifiable.
 *
 * `journeyData` can: its `type: 'education'` entries each name the awarding
 * organisation (`org`) and when the study ran. It is also already cross-checked
 * against the CV (see the note at data.js:345), so the dates are not
 * independently typed.
 *
 * ── Only AWARDED credentials, which is why `end` gates the list ──────────────
 * `Person.hasCredential` is defined by schema.org as "a credential AWARDED to
 * the Person". An entry still in progress (`end: null` — the BSc is predicted,
 * not yet conferred) therefore cannot go in it at all: the property asserts
 * possession, and no choice of date softens that. An earlier cut of this
 * function dated every record by `start` precisely to avoid claiming a
 * completion that had not happened, which made the DATE truthful and left the
 * stronger claim — that the degree is held — false. Filtering is the fix; the
 * date question then answers itself.
 *
 * It is also what the page itself says. The `/qualifications` carousel shows
 * awarded certificates only, the BSc among them nowhere, so emitting it here
 * put a claim in the structured data that the visible page did not support —
 * the mismatch Google's own guidance warns about.
 *
 * Nothing is lost permanently: the entry rejoins the list by itself on the day
 * `end` is filled in, dated by the award rather than by this function being
 * remembered and edited.
 *
 * @param {Array<object>} journey A `journeyData` array.
 * @returns {Array<{name: string, issuer: string, date: string, type: string}>}
 *   Credential records for `schema.qualificationsPage`.
 */
export function credentialsFromJourney(journey) {
  if (!Array.isArray(journey)) return [];
  return journey
    .filter((entry) => entry?.type === 'education' && entry.end)
    .map((entry) => ({
      // The journey's own title, which already reads as a credential name
      // ("BSc (Hons) Software Engineering · MMU"). The org suffix is stripped
      // so it is not stated twice — once in the name and once in
      // `recognizedBy`, which is what a consumer deduplicating on name would
      // see as two different credentials.
      name: String(entry.title).split(' · ')[0].trim(),
      issuer: entry.org,
      // The award, not the enrolment: every entry that reaches here has
      // finished, so `dateCreated` can say when the credential actually came
      // into being.
      date: entry.end,
      // Schema's `credentialCategory` is a free-text hint. "degree" and
      // "diploma" are the two values Google's documentation uses as examples,
      // and every education entry here is one or the other — so it is derived
      // from the name rather than typed per entry.
      type: /\b(bsc|ba|msc|beng|degree)\b/i.test(entry.title)
        ? 'degree'
        : 'diploma',
    }));
}

/** Every indexable route path in the registry. */
export const indexablePaths = () =>
  ROUTES.filter((r) => r.indexable).map((r) => r.path);
