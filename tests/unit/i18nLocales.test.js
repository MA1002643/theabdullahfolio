import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_CODES,
  dirFor,
  isLocale,
  localeInfo,
  localizePath,
  matchLocale,
} from '@/i18n/locales';

// The locale registry (issue #82). Every multilingual surface — routing, the
// proxy, hreflang, the sitemap, og:locale, the font chain, the selector, the
// translation pipeline — reads this one list, so its invariants are the
// invariants of the whole feature.

describe('locale registry', () => {
  it('ships the 20 launch locales, English first and as the source', () => {
    expect(LOCALE_CODES).toHaveLength(20);
    expect(LOCALES[0]).toMatchObject({ code: 'en', status: 'source' });
    expect(DEFAULT_LOCALE).toBe('en');
    expect(LOCALES.filter((l) => l.status === 'source')).toHaveLength(1);
  });

  it('has unique codes, hreflang tags, Open Graph locales and endonyms', () => {
    for (const field of ['code', 'hreflang', 'og', 'endonym']) {
      const values = LOCALES.map((l) => l[field]);
      expect(new Set(values).size, field).toBe(values.length);
    }
  });

  it('is right-to-left for exactly the four RTL scripts', () => {
    const rtl = LOCALES.filter((l) => l.dir === 'rtl').map((l) => l.code).sort();
    expect(rtl).toEqual(['ar', 'fa', 'he', 'ur']);
    expect(LOCALES.every((l) => l.dir === 'ltr' || l.dir === 'rtl')).toBe(true);
  });

  it('gives every locale a BCP 47 tag the platform understands', () => {
    for (const l of LOCALES) {
      expect(() => new Intl.Locale(l.hreflang), l.code).not.toThrow();
      expect(l.og, l.code).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    }
  });

  it('names each language in itself, never with a flag', () => {
    for (const l of LOCALES) {
      expect(l.endonym, l.code).not.toMatch(/\p{Regional_Indicator}/u);
      expect(l.endonym.length, l.code).toBeGreaterThan(1);
    }
  });

  it('keeps every non-English locale honestly marked and tiered', () => {
    // Native review is what flips a locale to `reviewed`; until then the
    // machine-translation notice must show.
    for (const l of LOCALES.filter((x) => x.code !== 'en')) {
      expect(['machine', 'reviewed'], l.code).toContain(l.status);
      expect([1, 2], l.code).toContain(l.tier);
    }
  });
});

describe('localizePath — English stays unprefixed', () => {
  it.each([
    ['/', 'en', '/'],
    ['/about', 'en', '/about'],
    ['/', 'ar', '/ar'],
    ['/about', 'ar', '/ar/about'],
    ['/projects/3', 'ja', '/ja/projects/3'],
    ['/about', undefined, '/about'],
  ])('%s in %s → %s', (path, code, expected) => {
    expect(localizePath(path, code)).toBe(expected);
  });
});

describe('matchLocale — the suggestion, never a redirect', () => {
  it.each([
    [['es-MX', 'en'], 'es'],
    [['pt-BR'], 'pt'],
    [['ar-EG'], 'ar'],
    [['zh-CN'], 'zh'],
    [['zh-Hans-SG'], 'zh'],
    [['en-GB'], 'en'],
    [['sw', 'de-AT'], 'de'],
    [['sw', 'xx'], null],
    [[], null],
    [undefined, null],
  ])('%j → %s', (tags, expected) => {
    expect(matchLocale(tags)).toBe(expected);
  });

  it('never offers Simplified Han to a Traditional-script reader', () => {
    // A Taiwanese or Hong Kong reader offered "中文（简体）" as their language
    // reads it as a mistake; with no Traditional catalogue, no offer is right.
    expect(matchLocale(['zh-TW'])).toBeNull();
    expect(matchLocale(['zh-Hant'])).toBeNull();
    expect(matchLocale(['zh-HK', 'zh'])).toBe('zh');
  });
});

describe('lookups', () => {
  it('falls back to English for an unknown code', () => {
    expect(localeInfo('xx').code).toBe('en');
    expect(dirFor('xx')).toBe('ltr');
    expect(isLocale('xx')).toBe(false);
    expect(isLocale('ur')).toBe(true);
  });
});
