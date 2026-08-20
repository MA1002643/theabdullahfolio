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

export const metadata = {
  // metadataBase resolves every relative URL below to an absolute one —
  // without it Next emits relative og:image URLs, which many unfurlers
  // (iMessage especially) refuse to follow.
  metadataBase: new URL('https://ma.codes'),

  title: {
    default: 'Muhammad Abdullah',
    template: '%s · Muhammad Abdullah',
  },
  description: "Muhammad Abdullah's Personal Portfolio",

  applicationName: 'Muhammad Abdullah',
  authors: [{ name: 'Muhammad Abdullah', url: 'https://ma.codes' }],
  creator: 'Muhammad Abdullah',

  // The icons are file-convention assets in this folder (icon.png,
  // apple-icon.png) — Next wires their <link> tags automatically. The
  // homepage share card is deliberately NOT file-convention: it is a
  // LIVE render (/og/home — issue #88 v2) declared here in config,
  // because a file-convention image would override this images array and
  // the array is what carries the square WhatsApp companion. Sub-pages
  // and project pages override these via their own opengraph-image.js
  // (file-based wins per segment), so this pair applies to `/` only.
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://ma.codes',
    siteName: 'Muhammad Abdullah',
    title: 'Muhammad Abdullah',
    description: "Muhammad Abdullah's Personal Portfolio",
    images: [
      {
        url: '/og/home',
        width: 1200,
        height: 630,
        alt: 'Muhammad Abdullah — Software Engineer. Dark ember card with the MA monogram and live portfolio status.',
      },
      {
        url: '/og/home-square',
        width: 1200,
        height: 1200,
        alt: 'Muhammad Abdullah — Software Engineer. Square dark ember card with the MA monogram and live portfolio status.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Muhammad Abdullah',
    description: "Muhammad Abdullah's Personal Portfolio",
    images: [
      {
        url: '/og/home',
        alt: 'Muhammad Abdullah — Software Engineer. Dark ember card with the MA monogram and live portfolio status.',
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
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
