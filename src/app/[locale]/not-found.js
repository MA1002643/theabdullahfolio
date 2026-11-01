import { getTranslations } from 'next-intl/server';
import NotFoundClient from '@/components/not-found/NotFoundClient';
import IntlScope from '@/i18n/IntlScope';

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
//
// `generateMetadata` rather than a `metadata` object since issue #82: the
// title and description are the catalogue's (`NotFound.meta`), so a visitor
// lost on /ar/… gets an Arabic tab title. not-found receives no params; the
// locale comes from the request config, which the [locale] layout has
// already pinned with setRequestLocale.
export async function generateMetadata() {
  const t = await getTranslations('NotFound');
  return {
    title: t('meta.title'),
    description: t('meta.description'),
  };
}

// The 404's copy is handed down here rather than on every page (issue #82,
// the 8 kB budget): only this boundary renders it. not-found receives no
// params, so IntlScope reads the locale the [locale] layout already pinned.
export default function NotFound() {
  return (
    <IntlScope namespaces={['NotFound']}>
      <NotFoundClient />
    </IntlScope>
  );
}
