import { Inter, Montserrat, Varela_Round } from 'next/font/google';
import './globals.css';
import clsx from 'clsx';
import CustomCursor from '@/components/CustomCursor';
import LoaderWrapper from '@/components/loaderWrapper';
import PageTransitionProvider from '@/components/pageTransition/PageTransitionProvider';
import GlobalToaster from '@/components/GlobalToaster';
import ProjectFilterHandoffGuard from '@/components/projects/ProjectFilterHandoffGuard';
import NowPlaying from '@/components/spotify/NowPlaying';
import SoundProvider from '@/components/sound/SoundProvider';
import FloatingSoundToggle from '@/components/sound/FloatingSoundToggle';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';
import JsonLd from '@/components/seo/JsonLd';
import { alternatesFor } from '@/lib/seo/canonical';
import { personGraph } from '@/lib/seo/schema';
import { ORIGIN, routeFor } from '@/lib/seo/site';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const varelaRound = Varela_Round({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-varela-round',
});

// Brand face for the intro emblem's engraved name (MUHAMMAD / ABDULLAH),
// matching the source artwork. 800 only — it's used in one place.
const montserrat = Montserrat({
  weight: '800',
  subsets: ['latin'],
  variable: '--font-montserrat',
});

// The homepage's own registry entry (issue #32). Its title and description are
// read from the registry rather than written here so the metadata contract test
// and the JSON-LD graph cannot disagree with what the page actually serves.
const HOME = routeFor('/');

export const metadata = {
  // metadataBase resolves every relative URL below to an absolute one —
  // without it Next emits relative og:image URLs, which many unfurlers
  // (iMessage especially) refuse to follow.
  //
  // Now sourced from `ORIGIN` (src/lib/seo/site.js) instead of a literal: the
  // origin was duplicated here and in the OG helper, and a canonical builder
  // reading a third copy would have been a third chance to drift.
  metadataBase: new URL(ORIGIN),

  title: {
    // F5: the bare brand title wasted the homepage's most valuable string. It
    // was correct and said nothing about what the person does, so every
    // non-branded intent ("software engineer portfolio") had nothing in the
    // SERP snippet to match against. Brand still leads — it is a personal site
    // and the name is the primary query — with the role as a qualifier.
    default: HOME.title,
    template: '%s · Muhammad Abdullah',
  },
  description: HOME.description,

  // Self-referential canonical for `/` (issue #32, W1 / F3). The homepage does
  // not flow through `sectionMetadata()`, so it is the one route whose
  // canonical has to be declared by hand — and it is also the route that most
  // needed one, since `www.ma.codes` and the apex both answered 200 with no
  // signal saying which was authoritative (F2).
  alternates: alternatesFor('/'),

  // Handed over from the #43 audit: the site declared no `robots` key at all.
  // Not a live bug — crawlers index by default — but the DEFAULT is not what we
  // want. `max-image-preview: large` is the specific reason this key exists:
  // without it Google renders share images as thumbnails, which throws away
  // the #88 card system in Discover and image results. `max-snippet: -1` and
  // `max-video-preview: -1` lift the snippet-length and preview caps for the
  // same reason — nothing on this site benefits from being truncated.
  //
  // Next marks `not-found` noindex on its own, so nothing here needs to
  // special-case it (and tests/unit/notFoundMetadata.test.js pins that the 404
  // declares no `robots` key of its own, which would become a second source of
  // truth).
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  // Search Console domain verification (issue #32, W6). Read from env: the
  // token is not strictly a secret — it is published in a meta tag on every
  // page the moment it is set — but it is deployment configuration, so it
  // follows the repo's rule of NAME in the repo, value in Vercel. Unset, the
  // key is omitted entirely rather than rendering an empty meta tag.
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),

  applicationName: 'Muhammad Abdullah',
  authors: [{ name: 'Muhammad Abdullah', url: ORIGIN }],
  creator: 'Muhammad Abdullah',

  // The icons are file-convention assets in this folder (icon.png,
  // apple-icon.png) — Next wires their <link> tags automatically. The
  // homepage share card is deliberately NOT file-convention: it is a
  // LIVE render (/og/home — issue #88 v2) declared here in config,
  // because a file-convention image would override this images array and
  // the array is what carries the square WhatsApp companion. Sub-pages
  // and project pages override these via their own opengraph-image.js
  // (file-based wins per segment), so this pair applies to `/` only.
  //
  // The OG/Twitter title and description now read from the SAME registry entry
  // as the page title (issue #32, W7). They used to be their own literals, and
  // "Muhammad Abdullah's Personal Portfolio" was the string a recruiter saw in
  // a chat unfurl — accurate, and it named neither the role nor the stack. The
  // role qualifier is kept in `og:title` even though the card image also
  // renders it: plenty of clients show the title text and never load the image.
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: ORIGIN,
    siteName: 'Muhammad Abdullah',
    title: HOME.title,
    description: HOME.description,
    images: [
      {
        url: '/og/home',
        width: 1200,
        height: 630,
        alt: 'Muhammad Abdullah — Software Engineer. Dark ember card with the Muhammad Abdullah seal and live portfolio status.',
      },
      {
        url: '/og/home-square',
        width: 1200,
        height: 1200,
        alt: 'Muhammad Abdullah — Software Engineer. Square dark ember card with the Muhammad Abdullah seal and live portfolio status.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: HOME.title,
    description: HOME.description,
    images: [
      {
        url: '/og/home',
        alt: 'Muhammad Abdullah — Software Engineer. Dark ember card with the Muhammad Abdullah seal and live portfolio status.',
      },
    ],
  },
};

// Paints the mobile browser chrome with the same dark base the share images
// bake in, so the live page and the preview card agree. (On Next 14
// themeColor lives in the viewport export, not metadata.)
export const viewport = {
  themeColor: '#0a0a0a',
};

/**
 * Root application layout that provides the HTML structure, global font/theme classes, and site-wide UI/providers.
 *
 * Renders a body that applies the Inter font variable and theme classes; the body contains the LoaderWrapper (wrapping the page children), GlobalToaster, CustomCursor, SpeedInsights, and Analytics. Head content (icons, OG/Twitter cards, theme colour) is owned by the metadata/viewport exports and the file-convention images beside this file.
 * @returns {JSX.Element} The root HTML and body structure for the application.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={clsx(
          inter.variable,
          varelaRound.variable,
          montserrat.variable,
          'bg-background text-foreground',
        )}
      >
        {/* Owns the footer guitar track's <audio> element + on/off state. MUST
            sit in the root layout: the (sub pages) layout that renders <Footer />
            is unmounted when you navigate to `/`, which previously destroyed the
            audio node mid-play and cut the music off (see SoundProvider).

            Scoped to just its context consumers — the page subtree (its Footer
            calls useSound) and FloatingSoundToggle. The purely-visual overlays
            (NowPlaying, GlobalToaster, CustomCursor) don't consume the context,
            so they render OUTSIDE it. Because RootLayout is a Server Component
            they wouldn't re-render on toggle even inside (their `children`
            reference is stable → React bails out of that subtree), but keeping
            them out makes that independence explicit and stays true even if this
            layout ever becomes a Client Component. */}
        <SoundProvider>
          <LoaderWrapper>
            <PageTransitionProvider>{children}</PageTransitionProvider>
          </LoaderWrapper>
          {/* Stop control for routes with no footer (the homepage), so the
              persisting track is always silenceable. Renders null elsewhere. */}
          <FloatingSoundToggle />
        </SoundProvider>
        {/* Live music presence — floats bottom-left on every page (issue #42).
            Renders null until data arrives, so no SSR/hydration mismatch. */}
        <NowPlaying />
        {/* Expires the /projects filter handoff on any route outside the
            projects area. Renders null; lives at the ROOT (not in the
            (sub pages) layout) so it also observes the homepage. */}
        <ProjectFilterHandoffGuard />
        <GlobalToaster />
        <CustomCursor />
        {/* The entity graph's root — `Person` + `WebSite`, one connected
            `@graph` (issue #32, W2). Lives in the ROOT layout, not per page,
            for the reason the `@id` scheme exists: every page must be able to
            reference `#person` and have the reference resolve in the same
            document. A per-page copy would be ten competing definitions of one
            person, which is precisely what P3 forbids.

            Rendered as the last element in <body> deliberately: it is data, not
            content, so it should never delay the paint of anything above it.
            Position in the document is irrelevant to every consumer that reads
            JSON-LD. */}
        <JsonLd id="ld-root" data={personGraph()} />
        {/* ── Vercel's two telemetry scripts, mounted ONLY on Vercel ────────
            Both fetch from `/_vercel/...`, a path the PLATFORM serves — it does
            not exist in the Next output. Anywhere else (a CI audit, a local
            `next start`, a fork self-hosting this repo) those two requests 404
            on every page load, which is two console errors per navigation and
            two wasted round trips for a script that could not have worked.

            It is also what capped Lighthouse's best-practices category at 0.96
            in CI: `errors-in-console` is scored all-or-nothing and could never
            pass off-platform. Skipping that audit was the alternative and is
            strictly worse — it would have hidden real console errors to
            accommodate two that were never real.

            `process.env.VERCEL` is set during both the build and the runtime on
            Vercel, and this is a server component, so the branch is resolved
            when the page is prerendered. next.config.mjs already picks `distDir`
            the same way, so the pattern is not new here. */}
        {process.env.VERCEL ? (
          <>
            <SpeedInsights />
            <Analytics />
          </>
        ) : null}
        {/* GA4 IS NOT MOUNTED HERE, DELIBERATELY — see docs/seo.md §8 and §14.
            `src/components/analytics/GoogleAnalytics.jsx` is written, tested and
            allowed through the CSP, and it is the LAST thing #141 has to wire:
            drop it inside that issue's `<ConsentedAnalytics />` boundary, beside
            the two Vercel scripts above, and it starts on consent.

            It was briefly mounted here on the argument the component's own
            header still makes — Consent Mode v2 with `analytics_storage:
            'denied'` writes no cookie, so there is no STORAGE to consent to and
            PECR has nothing to bite on. That argument is sound about storage and
            beside the point about this issue: #141's acceptance criterion is
            that a visitor who has not decided issues no analytics request at
            all, and a cookieless ping is still a request carrying page path,
            referrer and coarse geography. Mounting it before the notice exists
            would also have made three documents false in the same commit (the
            PR description, .env.example and README all state GA4 is not
            mounted), which is how a decision record stops being one. */}
      </body>
    </html>
  );
}
