import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './i18n/locales';

// Next 16's request proxy (the file formerly called `middleware`), added for
// issue #82. It does two jobs and nothing else.
//
// 1. next-intl's middleware maps the public URL onto the `[locale]` segment:
//    `/about` is served by `src/app/[locale]/(sub pages)/about` with
//    locale=en (a REWRITE, invisible to the visitor), `/ar/about` with
//    locale=ar, and `/en/about` redirects to `/about` so English has one URL.
//
// 2. An EXPLICIT language choice is honoured. When a visitor has picked a
//    language in the selector (the only thing that writes `NEXT_LOCALE`) and
//    then opens an unprefixed English URL, they are sent to the same page in
//    their language. That is the whole of this site's locale detection.
//    `Accept-Language` never redirects anyone; it only drives the client-side
//    suggestion (LocaleSuggestion.jsx). See routing.js for why.
//
// Temporary (307), not permanent: the target depends on one visitor's cookie,
// and a permanent redirect cached by a browser or a crawler would outlive it.

const intl = createMiddleware(routing);

const hasLocalePrefix = (pathname) => {
  const first = pathname.split('/')[1];
  return isLocale(first);
};

export default function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const chosen = request.cookies.get(LOCALE_COOKIE)?.value;

  // Only document navigations. Prefetches and router revalidations carry a
  // non-document `Sec-Fetch-Dest`, and redirecting those would fight a soft
  // locale switch that has just happened on the client.
  const dest = request.headers.get('sec-fetch-dest');
  const isDocument = dest == null || dest === 'document';

  if (
    isDocument &&
    chosen &&
    chosen !== DEFAULT_LOCALE &&
    isLocale(chosen) &&
    !hasLocalePrefix(pathname)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === '/' ? `/${chosen}` : `/${chosen}${pathname}`;
    url.search = search;
    return NextResponse.redirect(url, 307);
  }

  return intl(request);
}

export const config = {
  // Everything that is a PAGE. Excluded: route handlers (`/api`, the two
  // homepage share cards under `/og`), Next's and Vercel's internals, and any
  // path with a file extension — sitemap.xml, robots.txt, llms.txt, the
  // manifest, icons, the CV PDF and every file in /public.
  // Segment-anchored, so `/api` and `/og` are excluded without also
  // excluding a future `/ogham` or `/apiary`.
  matcher: ['/((?!(?:api|og)(?:/|$)|_next|_vercel|.*\\..*).*)'],
};
