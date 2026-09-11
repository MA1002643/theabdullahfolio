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
// so a copy change there is the real modification date.
export const ROUTES = [
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
      'src/app/layout.js',
      'src/components/navigation',
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
    sources: ['src/app/(sub pages)/about', 'src/components/about'],
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
    sources: [
      'src/app/(sub pages)/uses',
      'src/lib/uses',
      'src/components/uses',
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
    sources: ['src/app/(sub pages)/contact', 'src/components/contact'],
  },
  {
    path: '/my-past',
    title: 'My Past',
    description:
      'The university-era portfolio where this began — hand-built with plain HTML, CSS and JavaScript, kept online as an honest before picture.',
    changeFrequency: 'yearly',
    priority: 0.5,
    indexable: true,
    sources: ['src/app/(sub pages)/my-past'],
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
    ],
  },
];

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
