import { Inter, Montserrat, Varela_Round } from 'next/font/google';
import './globals.css';
import clsx from 'clsx';
import CustomCursor from '@/components/CustomCursor';
import LoaderWrapper from '@/components/loaderWrapper';
import PageTransitionProvider from '@/components/pageTransition/PageTransitionProvider';
import GlobalToaster from '@/components/GlobalToaster';
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
  title: 'Muhammad Abdullah',
  description: "Muhammad Abdullah's Personal Portfolio",
};

/**
 * Root application layout that provides the HTML structure, global font/theme classes, and site-wide UI/providers.
 *
 * Renders a favicon link in the document head and a body that applies the Inter font variable and theme classes; the body contains the LoaderWrapper (wrapping the page children), GlobalToaster, CustomCursor, SpeedInsights, and Analytics.
 * @returns {JSX.Element} The root HTML and body structure for the application.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" href="/background/logo.png" />
      </head>
      <body
        className={clsx(
          inter.variable,
          varelaRound.variable,
          montserrat.variable,
          'bg-background text-foreground',
        )}
      >
        <LoaderWrapper>
          <PageTransitionProvider>{children}</PageTransitionProvider>
        </LoaderWrapper>
        <GlobalToaster />
        <CustomCursor />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
