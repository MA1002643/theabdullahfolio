// Per-page metadata helper (issue #88 v2). Next merges metadata objects
// SHALLOWLY between layout and page — a page that sets `openGraph` at
// all replaces the root layout's whole openGraph object, dropping
// siteName/type/locale for that page. Every sub-page therefore builds
// its metadata through this helper, which restates the shared fields so
// no page can accidentally shed them.

import { getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALES, localeInfo, localizePath } from '@/i18n/locales';
import { alternatesFor } from '@/lib/seo/canonical';
import { intlTag } from '@/i18n/format';
import { PROJECT_COUNT, isTranslated, routeFor } from '@/lib/seo/site';

const SITE = 'Muhammad Abdullah';

/**
 * The Open Graph locale pair for a document (issue #82): its own `og:locale`
 * and, for a translated page, every other locale as `og:locale:alternate` so
 * an unfurler (Facebook, LinkedIn) can pick the reader's language. An
 * untranslated page names only English, because that is the only language its
 * content is in.
 */
export function ogLocales(locale = DEFAULT_LOCALE, translated = true) {
  const own = translated ? localeInfo(locale).og : localeInfo(DEFAULT_LOCALE).og;
  return {
    locale: own,
    ...(translated
      ? { alternateLocale: LOCALES.map((l) => l.og).filter((og) => og !== own) }
      : {}),
  };
}

export function sectionMetadata({
  title,
  description,
  path,
  locale = DEFAULT_LOCALE,
  translated = true,
}) {
  const fullTitle = `${title} · ${SITE}`;
  return {
    title,
    description,
    // Self-referential canonical (issue #32, W1 / F3). It goes HERE rather
    // than in each page's own metadata export for exactly the shallow-merge
    // reason above, and the consequence is worth stating: `alternates` set on
    // a page REPLACES the root layout's `alternates` wholesale, so a route
    // that declared its own would silently shed the `languages` this helper
    // now adds (#82). One helper, every section route and all eleven project
    // pages — and no route can forget it, because forgetting the helper means
    // forgetting its title and share card too, which is visible immediately.
    //
    // The homepage does NOT flow through here (it has no sectionMetadata
    // call), so its canonical is declared directly in its locale layout.
    alternates: alternatesFor(path, { locale, translated }),
    openGraph: {
      type: 'website',
      ...ogLocales(locale, translated),
      siteName: SITE,
      url: translated ? localizePath(path, locale) : path,
      title: fullTitle,
      description,
    },
    // No `images` here on purpose: this object REPLACES the root twitter
    // object (shallow merge), which is what stops sub-pages inheriting
    // the homepage's /og/home card — and the build-hashed URL of a
    // route's own card isn't knowable in config. Each route's
    // twitter-image.js (a re-export of its opengraph-image.js) supplies
    // the explicit twitter:image instead.
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
    },
  };
}

/**
 * The localised title and description for a registry route (issue #82).
 *
 * English reads the registry, which itself reads `messages/en/Meta.json`, so
 * the English strings are byte-identical to before the feature. Every other
 * locale reads its own `Meta` catalogue. The `/projects` description states a
 * count, which English spells as a word ("Eleven builds") and other locales
 * format as a number in their own numerals.
 */
export async function routeCopy(path, locale = DEFAULT_LOCALE) {
  const route = routeFor(path);
  if (!route) throw new Error(`routeCopy: no registry entry for ${path}`);
  if (locale === DEFAULT_LOCALE) {
    return { title: route.title, description: route.description };
  }
  const t = await getTranslations({ locale, namespace: 'Meta' });
  // The count comes through the REGISTRY rather than from data.js directly:
  // every route's metadata flows through this module, and importing the data
  // module here made all twenty URLs read as rendering from it — re-stamping
  // every `<lastmod>` whenever one project record changed
  // (tests/unit/sitemapDrift.test.js, "shared data module as a source").
  const countLabel = new Intl.NumberFormat(intlTag(locale)).format(PROJECT_COUNT);
  return {
    title: t(`routes.${route.key}.title`),
    description: t(`routes.${route.key}.description`, {
      countWord: countLabel,
    }),
  };
}

/**
 * `generateMetadata` for a registry route: resolves the locale from the
 * segment params and composes `sectionMetadata` from the localised copy.
 *
 * @param {string} path Registry path (`/about`).
 * @param {Promise<{locale: string}>} params The page's segment params.
 * @param {{translated?: boolean}} [options] Defaults to the registry's
 *   `translated` flag (`isTranslated`), so English-only routes need no option.
 */
export async function routeMetadata(path, params, { translated = isTranslated(path) } = {}) {
  const { locale } = await params;
  const copy = await routeCopy(path, translated ? locale : DEFAULT_LOCALE);
  return sectionMetadata({ ...copy, path, locale, translated });
}
