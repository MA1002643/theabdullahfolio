import Link from 'next/link';
import './globals.css';

// The 404 for requests OUTSIDE the locale segment (issue #82): only paths the
// proxy deliberately does not map onto a locale reach here — an unknown file
// path such as `/missing.png`. Every page-shaped URL is rewritten into
// `[locale]` and gets the full localised 404 (`[locale]/not-found.js`)
// instead, which is what a visitor ever actually sees.
//
// The root layout is a pass-through, so this file renders its own document.
// Deliberately plain: no providers exist at this level, and an asset 404 is
// read by a browser's resource loader far more often than by a person.
export const metadata = {
  title: '404 — Page Not Found · Muhammad Abdullah',
};

export default function GlobalNotFound() {
  return (
    <html lang="en" dir="ltr">
      <body className="bg-background text-foreground">
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-3xl">404</h1>
          <p>This page doesn&apos;t exist.</p>
          <Link href="/" className="underline">
            Back to the homepage
          </Link>
        </main>
      </body>
    </html>
  );
}
