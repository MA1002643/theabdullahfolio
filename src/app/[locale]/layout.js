import '../globals.css';
import clsx from 'clsx';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import CustomCursor from '@/components/CustomCursor';
import LoaderWrapper from '@/components/loaderWrapper';
import MotionPreferences from '@/components/MotionPreferences';
import PageTransitionProvider from '@/components/pageTransition/PageTransitionProvider';
import GlobalToaster from '@/components/GlobalToaster';
import ProjectFilterHandoffGuard from '@/components/projects/ProjectFilterHandoffGuard';
import NowPlaying from '@/components/spotify/NowPlaying';
import SoundProvider from '@/components/sound/SoundProvider';
import FloatingSoundToggle from '@/components/sound/FloatingSoundToggle';
import ConsentProvider from '@/components/privacy/ConsentProvider';
import ConsentedAnalytics from '@/components/privacy/ConsentedAnalytics';
import PrivacyGate from '@/components/privacy/PrivacyGate';
import LocaleSuggestion from '@/components/i18n/LocaleSuggestion';
import JsonLd from '@/components/seo/JsonLd';
import IntlScope from '@/i18n/IntlScope';
import { fontVariableClasses, scriptFontStyle } from '@/i18n/fonts';
import { localeInfo } from '@/i18n/locales';
import { routing } from '@/i18n/routing';
import { alternatesFor } from '@/lib/seo/canonical';
import { ogLocales, routeCopy } from '@/lib/og/meta';
import { personGraph } from '@/lib/seo/schema';
import { ORIGIN } from '@/lib/seo/site';

// Every locale is prerendered (issue #82). `[locale]` is the outermost dynamic
// segment, so this list multiplies every page beneath it: each locale × each
// route is a static document, and no translation is ever looked up at request
// time.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// And only those locales. A one-segment path with a dot in it (`/favicon.ico`,
// `/ads.txt`, a scanner's `/wp-config.php`) skips the proxy, whose matcher
// leaves file-like paths alone, and arrives here as the "locale" `favicon.ico`.
// With the param set open, Next answered those with a 500: the segment is
// prerendered, and the `notFound()` below needs a request-time render it
// refuses ("Page changed from static to dynamic at runtime"). Closed, such a
// path gets the root 404 that `src/app/not-found.js` exists for.
export const dynamicParams = false;

/**
 * Root metadata, per locale. It was a static `metadata` export before #82;
 * it is `generateMetadata` now because the title, description, canonical,
 * hreflang set and `og:locale` all depend on the segment.
 *
 * The homepage's own registry entry (issue #32) still supplies the English
 * title and description, read through `routeCopy`, so the metadata contract
 * test and the JSON-LD graph cannot disagree with what the page serves.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const home = await routeCopy('/', locale);
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return {
    // metadataBase resolves every relative URL below to an absolute one —
    // without it Next emits relative og:image URLs, which many unfurlers
    // (iMessage especially) refuse to follow. Sourced from `ORIGIN`
    // (src/lib/seo/site.js) so the origin is written down once.
    metadataBase: new URL(ORIGIN),

    title: {
      // F5: the bare brand title wasted the homepage's most valuable string.
      // Brand still leads — it is a personal site and the name is the primary
      // query — with the role as a qualifier.
      default: home.title,
      template: '%s · Muhammad Abdullah',
    },
    description: home.description,

    // Self-referential canonical for `/` (issue #32, W1 / F3), and since #82
    // the full hreflang cluster: every locale's homepage plus `x-default`.
    // The homepage does not flow through `sectionMetadata()`, so it is the one
    // route whose alternates are declared by hand.
    alternates: alternatesFor('/', { locale }),

    // `max-image-preview: large` is the specific reason this key exists:
    // without it Google renders share images as thumbnails, which throws away
    // the #88 card system in Discover and image results. Next marks
    // `not-found` noindex on its own, so nothing here special-cases it.
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

    // Search Console domain verification (issue #32, W6). Read from env as
    // deployment configuration; unset, the key is omitted entirely.
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
      : {}),

    applicationName: 'Muhammad Abdullah',
    authors: [{ name: 'Muhammad Abdullah', url: ORIGIN }],
    creator: 'Muhammad Abdullah',

    // The homepage share card is deliberately NOT file-convention: it is a
    // LIVE render (/og/home — issue #88 v2) declared here in config, because
    // a file-convention image would override this images array and the array
    // is what carries the square WhatsApp companion. Sub-pages and project
    // pages override these via their own opengraph-image.js, so this pair
    // applies to `/` only. The IMAGES stay the English brand card in every
    // locale (issue #82: the OG renderer cannot shape Arabic or lay out bidi
    // text); the title, description, alt text and og:locale are localised.
    openGraph: {
      type: 'website',
      ...ogLocales(locale),
      url: locale === routing.defaultLocale ? ORIGIN : `${ORIGIN}/${locale}`,
      siteName: 'Muhammad Abdullah',
      title: home.title,
      description: home.description,
      images: homeShareImages(t).openGraph,
    },
    twitter: {
      card: 'summary_large_image',
      title: home.title,
      description: home.description,
      images: homeShareImages(t).twitter,
    },
  };
}

/**
 * The homepage's share-card arrays, given the `Meta` translator for the alt
 * text. Exported so tests/unit/metadataContract.test.js can check the URLs it
 * advertises against robots.txt without rendering the layout.
 */
export function homeShareImages(t) {
  return {
    openGraph: [
      { url: '/og/home', width: 1200, height: 630, alt: t('homeCardAlt') },
      { url: '/og/home-square', width: 1200, height: 1200, alt: t('homeSquareCardAlt') },
    ],
    twitter: [{ url: '/og/home', alt: t('homeCardAlt') }],
  };
}

// Paints the mobile browser chrome with the same dark base the share images
// bake in, so the live page and the preview card agree.
export const viewport = {
  themeColor: '#0a0a0a',
};

/**
 * The document shell for every page, in every locale.
 *
 * `lang` and `dir` come from the locale registry (issue #82). `dir="rtl"` on
 * <html> is what mirrors the whole layout for Arabic, Hebrew, Persian and
 * Urdu — every logical CSS property and every `rtl:` variant keys off it — and
 * `lang` is what makes a screen reader switch voice and the browser pick the
 * right CJK glyph forms and hyphenation.
 */
export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // Static rendering: tells next-intl which locale this render is for without
  // reading request headers, so the page stays prerenderable.
  setRequestLocale(locale);
  const { dir, hreflang } = localeInfo(locale);

  return (
    <html lang={hreflang} dir={dir}>
      {/* suppressHydrationWarning: extensions (Grammarly, LastPass, …) stamp
          `data-*` attributes onto <body> before React hydrates, which reports a
          false attribute mismatch. It covers this element's own attributes
          only — mismatches anywhere in the tree below are still reported. */}
      <body
        suppressHydrationWarning
        className={clsx(...fontVariableClasses, 'bg-background text-foreground')}
        style={scriptFontStyle(locale)}
      >
        {/* The global message scope (issue #82): the namespaces every page's
            chrome renders. Each route's layout adds its own on top. Server-
            rendered strings never pass through here at all. */}
        <IntlScope locale={locale}>
          {/* Consent wraps EVERYTHING below, because two widely separated
              subtrees read it: <PrivacyGate /> inside the transition provider,
              and <ConsentedAnalytics /> at the end of <body>. It renders no
              DOM node of its own, so the page's layout is unchanged. */}
          <ConsentProvider>
            {/* Owns the footer guitar track's <audio> element + on/off state.
                MUST sit in the root layout: the (sub pages) layout that renders
                <Footer /> unmounts when you navigate to `/`, which previously
                destroyed the audio node mid-play (see SoundProvider). */}
            <SoundProvider>
              <MotionPreferences>
                <LoaderWrapper>
                  <PageTransitionProvider>
                    {children}
                    {/* The privacy notice + preference centre live INSIDE the
                        transition provider so the notice's /privacy link takes
                        the Ember Passage like every other internal link. */}
                    <PrivacyGate />
                    {/* "This site is available in Español" — the ONLY thing a
                        browser's language preference ever triggers (issue
                        #82). A suggestion, never a redirect. Inside the
                        loader's inert boundary like every other control. */}
                    <LocaleSuggestion />
                  </PageTransitionProvider>
                  {/* The two floating CONTROLS live inside LoaderWrapper for its
                      `inert` boundary: while the opaque intro loader covers the
                      page, nothing beneath it may take focus (WCAG 2.4.11). */}
                  <FloatingSoundToggle />
                  {/* Live music presence — floats bottom-left on every page
                      (issue #42). Renders null until data arrives. */}
                  <NowPlaying />
                </LoaderWrapper>
              </MotionPreferences>
            </SoundProvider>
            {/* Expires the /projects filter handoff on any route outside the
                projects area. Renders null; lives at the ROOT so it also
                observes the homepage. */}
            <ProjectFilterHandoffGuard />
            <GlobalToaster />
            <CustomCursor />
            {/* The entity graph's root — `Person` + `WebSite`, one connected
                `@graph` (issue #32, W2). In the root layout, not per page, so
                every page can reference `#person` and have it resolve in the
                same document. Last in <body>: it is data, not content. */}
            <JsonLd id="ld-root" data={personGraph()} />
            {/* ── Every measurement script on this site, behind one gate ────
                #141. Vercel Web Analytics, Speed Insights and GA4 all render
                inside `<ConsentedAnalytics />`, below its
                `if (!analytics) return null`. GA4 must never be imported into
                this file — `tests/unit/gaConsentMode.test.js` fails on that.

                `vercel` is resolved HERE, in a Server Component, because
                `process.env.VERCEL` is not a `NEXT_PUBLIC_` variable: a client
                component reading it inlines `undefined`. Both scripts fetch
                from `/_vercel/...`, a path only the platform serves, so off
                platform they would 404 on every load. */}
            <ConsentedAnalytics vercel={Boolean(process.env.VERCEL)} />
          </ConsentProvider>
        </IntlScope>
      </body>
    </html>
  );
}
