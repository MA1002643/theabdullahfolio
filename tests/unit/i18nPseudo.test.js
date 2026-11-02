import { describe, expect, it } from 'vitest';
import {
  PSEUDO_CHARS,
  flatten,
  icuProblems,
  loadNamespace,
  namespaces,
  pseudoCatalogue,
  pseudoMessage,
  pseudoText,
} from '../../scripts/i18n-lib.mjs';
import { leaks, plainRuns } from '../support/pseudo.js';
import { LOCALES, LOCALE_CODES, PSEUDO_LOCALE, ROUTED_LOCALE_CODES } from '@/i18n/locales';

// The pseudo-locale (issue #82 follow-up): the transform that writes `en-XA`
// and the detector tests/i18n/pseudo.spec.js uses to read it back. The crawl
// is only as good as these two: a transform that leaves an ASCII letter in a
// catalogue string makes the gate cry wolf; a detector that misses one makes
// it blind.

describe('pseudoText', () => {
  it('leaves no ASCII letter behind, and stretches each vowel', () => {
    const out = pseudoText('About me — The Quick Brown Fox, 2026!');
    expect(out).not.toMatch(/[A-Za-z]/);
    expect(out).toBe('ȦȦƀǿǿŭŭŧ ḿḗḗ — Ŧħḗḗ Ɋŭŭīīƈķ Ɓřǿǿẇƞ Ƒǿǿẋ, 2026!');
  });

  it('only ever writes characters the detector knows, plus what it was given', () => {
    const letters = [...pseudoText('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')];
    for (const ch of letters) expect(PSEUDO_CHARS).toContain(ch);
  });
});

describe('pseudoMessage', () => {
  it('accents literal text and keeps the ICU interface byte-for-byte', () => {
    const source = '{count, plural, one {<fig>{n}</fig> workflow} other {<fig>{n}</fig> workflows}} · read at build';
    const out = pseudoMessage(source);
    expect(out.startsWith('[') && out.endsWith(']')).toBe(true);
    expect(out).toContain('{n}');
    expect(out).toContain('<fig>');
    expect(icuProblems(source, out)).toEqual([]);
  });

  it('is a structurally valid translation of every English string in the catalogues', () => {
    let checked = 0;
    for (const ns of namespaces('.')) {
      for (const [key, value] of Object.entries(flatten(loadNamespace('.', 'en', ns)))) {
        if (typeof value !== 'string') continue;
        expect(icuProblems(value, pseudoMessage(value)), `${ns}.${key}`).toEqual([]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('leaves no plain English in any English catalogue string', () => {
    // The transform's own promise, checked with the detector's own rule: if a
    // catalogue string came out with a bare word, the crawl would blame the page.
    for (const ns of namespaces('.')) {
      const pseudo = flatten(pseudoCatalogue(loadNamespace('.', 'en', ns)));
      for (const [key, value] of Object.entries(pseudo)) {
        if (typeof value !== 'string') continue;
        const bare = value.replace(/\{[^{}]*\}/g, '').replace(/<\/?[A-Za-z0-9]+\/?>/g, '');
        expect(plainRuns([bare]).map((r) => r.word), `${ns}.${key}`).toEqual([]);
      }
    }
  });

  it('keeps non-strings and shape untouched', () => {
    expect(pseudoCatalogue({ a: ['x', { b: 3 }], c: null })).toEqual({ a: ['[ẋ]', { b: 3 }], c: null });
    expect(pseudoMessage('')).toBe('');
  });
});

describe('the detector', () => {
  it('finds ASCII words outside every bracket, not inside one', () => {
    expect(plainRuns(['[Ȧƀǿǿŭŭŧ] Now playing [Ƈǿǿƞŧȧȧƈŧ {GitHub}]']).map((r) => r.word)).toEqual(['Now', 'playing']);
    // The value interpolated into a message is data, not a leak.
    expect(plainRuns(['[Ŧǿǿŧȧȧŀ: MA1002643/theabdullahfolio]'])).toEqual([]);
  });

  it('carries bracket depth across segments (a message spans its rich-text tags) but never fuses words', () => {
    expect(plainRuns(['[Ŧǿǿŧȧȧŀ ', '42', ' ŧǿǿǿǿŀş]'])).toEqual([]);
    expect(plainRuns(['Home', 'About']).map((r) => r.word)).toEqual(['Home', 'About']);
  });

  it('ignores a lone letter and trailing punctuation, keeps inner dots and hyphens', () => {
    expect(plainRuns(['x 1440, e.g. Next.js, re-run.']).map((r) => r.word)).toEqual(['e.g', 'Next.js', 're-run']);
  });

  it('reports each leak once with the text it sat in, and honours the allowlist', () => {
    const found = leaks(['Download CV', 'Download CV'], new Set(['CV']));
    expect(found).toEqual([{ word: 'Download', text: 'Download CV', index: 0 }]);
  });
});

describe('the pseudo-locale is CI-only', () => {
  it('is never a public locale: not in LOCALES, the sitemap, hreflang or the selector', () => {
    expect(LOCALE_CODES).not.toContain(PSEUDO_LOCALE.code);
    expect(LOCALES.some((l) => l.status === 'pseudo')).toBe(false);
  });

  it('is not routed unless the build sets NEXT_PUBLIC_I18N_PSEUDO=1', () => {
    // The unit run does not set it, which is the production configuration.
    expect(process.env.NEXT_PUBLIC_I18N_PSEUDO).not.toBe('1');
    expect(ROUTED_LOCALE_CODES).toEqual(LOCALE_CODES);
  });
});

describe('what the gate caught: the footer link label', () => {
  // It was a template literal — `${command}, ${handle}: ${description}` — so
  // every language got English punctuation. Now one message per locale; the
  // two visible parts must still lead the name (WCAG 2.5.3, label in name).
  it('is one message in every locale, with the visible command and handle first', async () => {
    const { readFileSync } = await import('node:fs');
    for (const { code } of LOCALES) {
      const label = JSON.parse(readFileSync(`messages/${code}/Footer.json`, 'utf8')).elsewhere.linkLabel;
      expect(label, code).toMatch(/^\{command\}\W*\{handle\}/);
      expect(label, code).toContain('{description}');
    }
  });
});
