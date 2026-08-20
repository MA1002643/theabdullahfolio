// Per-page metadata helper (issue #88 v2). Next merges metadata objects
// SHALLOWLY between layout and page — a page that sets `openGraph` at
// all replaces the root layout's whole openGraph object, dropping
// siteName/type/locale for that page. Every sub-page therefore builds
// its metadata through this helper, which restates the shared fields so
// no page can accidentally shed them.

const SITE = 'Muhammad Abdullah';

export function sectionMetadata({ title, description, path }) {
  const fullTitle = `${title} · ${SITE}`;
  return {
    title,
    description,
    openGraph: {
      type: 'website',
      locale: 'en_GB',
      siteName: SITE,
      url: path,
      title: fullTitle,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
    },
  };
}
