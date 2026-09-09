import NotFoundClient from '@/components/not-found/NotFoundClient';

// Server component on purpose — exporting `metadata` only works
// from server components, and the validation checklist requires
// the document `<title>` to be set during SSR. All interactivity
// lives behind the 'use client' boundary inside NotFoundClient.
//
// `title` is the BARE page name, never the full one: Next applies the
// root layout's `%s · Muhammad Abdullah` template to a string title
// here exactly as it does on a page.js, so restating the site name
// double-stamps it. This file used to read
// '404 — Page Not Found | theabdullahfolio' and rendered as
// "404 — Page Not Found | theabdullahfolio · Muhammad Abdullah" —
// the suffix twice, the wrong separator, and the REPOSITORY's name
// where the site's display name belongs. (theabdullahfolio is still
// the repo; it is simply not what the site calls itself anywhere.)
//
// No `openGraph` / `twitter` block on purpose. Next merges metadata
// SHALLOWLY, so declaring either one here would REPLACE the root
// layout's whole object and drop the images array with it — the very
// "unfurls bare" outcome it would look like it was fixing. Saying
// nothing lets the 404 inherit the complete homepage card (both the
// 1200x630 and the square WhatsApp companion, siteName, type,
// locale), which is the right thing for a dead link to preview as.
// Next marks this route `noindex` on its own, so no robots key
// belongs here either.
export const metadata = {
  title: '404 — Page Not Found',
  description:
    "You've drifted into the void. This page doesn't exist — yet.",
};

export default function NotFound() {
  return <NotFoundClient />;
}
