import { Inter } from 'next/font/google';
import './globals.css';
import clsx from 'clsx';
import FireFliesBackground from '@/components/FireFliesBackground';
import { Toaster } from 'sonner';
import LoaderWrapper from '@/components/loaderWrapper';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata = {
  title: 'Muhammad Abdullah',
  description: "Muhammad Abdullah's Personal Portfolio",
};

/**
 * Root application layout that provides the HTML structure, global font/theme classes, and site-wide UI/providers.
 *
 * Renders a favicon link in the document head and a body that applies the Inter font variable and theme classes; the body contains the LoaderWrapper (wrapping the page children), FireFliesBackground, Toaster (top-right), SpeedInsights, and Analytics.
 * @returns {JSX.Element} The root HTML and body structure for the application.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" href="/background/logo.png" />
      </head>
      <body className={clsx(inter.variable, 'bg-background text-foreground')}>
        <LoaderWrapper>{children}</LoaderWrapper>
        <FireFliesBackground />
        <Toaster position="top-right" />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
