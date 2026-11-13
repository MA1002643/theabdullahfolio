import { describe, expect, it } from 'vitest';

import { LOCALES } from '@/i18n/locales';
import { alternatesFor } from '@/lib/seo/canonical';
import { ORIGIN, ROUTES, isTranslated } from '@/lib/seo/site';

// hreflang (issue #82). The rules Google states and Search Console enforces:
// every page in a language cluster lists EVERY member (itself included), every
// member lists the same set back (reciprocity — a one-way alternate is
// ignored), each page's canonical is itself rather than the English page, and
// `x-default` names the page for readers no language matches.

const cluster = (path) =>
  LOCALES.map((l) => ({ locale: l.code, ...alternatesFor(path, { locale: l.code }) }));

describe('alternatesFor — translated pages', () => {
  it.each(['/', '/about', '/projects/3'])('%s lists all 20 locales plus x-default', (path) => {
    for (const page of cluster(path)) {
      expect(Object.keys(page.languages)).toHaveLength(21);
      expect(page.languages['x-default']).toBe(path === '/' ? ORIGIN : `${ORIGIN}${path}`);
    }
  });

  it('is reciprocal: every member of a cluster declares the identical set', () => {
    const pages = cluster('/about');
    for (const page of pages) expect(page.languages).toEqual(pages[0].languages);
  });

  it('makes each locale canonical to ITSELF, and lists itself', () => {
    for (const page of cluster('/about')) {
      const info = LOCALES.find((l) => l.code === page.locale);
      expect(page.languages[info.hreflang]).toBe(page.canonical);
    }
  });

  it('keeps every English canonical byte-identical to before #82', () => {
    expect(alternatesFor('/about', { locale: 'en' }).canonical).toBe(`${ORIGIN}/about`);
    expect(alternatesFor('/', { locale: 'en' }).canonical).toBe(ORIGIN);
    expect(alternatesFor('/about')).toEqual({ canonical: `${ORIGIN}/about` });
  });

  it('uses the script-qualified tag for Chinese, never the macrolanguage', () => {
    const { languages } = alternatesFor('/about', { locale: 'zh' });
    expect(languages['zh-Hans']).toBe(`${ORIGIN}/zh/about`);
    expect(languages.zh).toBeUndefined();
  });
});

describe('alternatesFor — English-only documents', () => {
  it('canonicalises a locale URL to the English URL and claims no translations', () => {
    expect(alternatesFor('/privacy', { locale: 'ar', translated: false })).toEqual({
      canonical: `${ORIGIN}/privacy`,
    });
  });

  it('marks exactly the privacy policy untranslated', () => {
    // The notes left this list on 2026-11-10, when they were translated.
    const untranslated = ROUTES.filter((r) => !isTranslated(r.path)).map((r) => r.path);
    expect(untranslated.sort()).toEqual(['/privacy']);
  });

  it('gives a translated note its own canonical and the full hreflang set', () => {
    const { canonical, languages } = alternatesFor('/notes/testing', { locale: 'ar' });
    expect(canonical).toBe(`${ORIGIN}/ar/notes/testing`);
    expect(languages['x-default']).toBe(`${ORIGIN}/notes/testing`);
  });
});
