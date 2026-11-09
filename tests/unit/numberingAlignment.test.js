import { describe, expect, it } from 'vitest';

import { installNumberingAlignment, needsAlignment, pinNumbering, readPage } from '@/i18n/numberingAlignment';

// Digits that hydrate the same as the server's HTML (issue #198). Linux WebKit
// formats bare `ar` with Arabic-Indic digits (its system ICU 74 predates the
// CLDR change); Node, Chromium and Apple's WebKit use Western digits, so every
// number on /ar threw React #418 there. Node is the "browser" here, so an old
// engine is simulated the other way round: the server says `arab`, the engine
// picks `latn`. The mechanism is symmetric.

const fakeDocument = (attrs) => ({
  documentElement: { getAttribute: (name) => attrs[name] ?? null },
});

// A window whose globals are copies, so installing never touches the test
// process's own Intl, Number or Date.
function fakeWindow(attrs) {
  return {
    document: fakeDocument(attrs),
    Intl: { ...Object.fromEntries(Object.getOwnPropertyNames(Intl).map((k) => [k, Intl[k]])) },
    Number: { prototype: { toLocaleString: Number.prototype.toLocaleString } },
    Date: {
      prototype: {
        toLocaleString: Date.prototype.toLocaleString,
        toLocaleDateString: Date.prototype.toLocaleDateString,
        toLocaleTimeString: Date.prototype.toLocaleTimeString,
      },
    },
  };
}

const ARAB = /^[٠-٩٬٫]+$/;

describe('pinNumbering', () => {
  const page = { lang: 'ar', numbering: 'arab' };

  it("pins the page language to the server's numbering system", () => {
    expect(pinNumbering('ar', undefined, page)).toBe('ar-u-nu-arab');
    expect(pinNumbering(['ar', 'en'], undefined, page)).toEqual(['ar-u-nu-arab', 'en']);
  });

  it('leaves every other request alone', () => {
    expect(pinNumbering('en-GB', undefined, page)).toBe('en-GB');
    expect(pinNumbering(undefined, undefined, page)).toBeUndefined();
    expect(pinNumbering('ar-u-nu-latn', undefined, page)).toBe('ar-u-nu-latn');
    expect(pinNumbering('ar-u-ca-islamic-nu-latn', undefined, page)).toBe('ar-u-ca-islamic-nu-latn');
    expect(pinNumbering('ar', { numberingSystem: 'latn' }, page)).toBe('ar');
    expect(pinNumbering('ar', undefined, { lang: 'ar', numbering: '' })).toBe('ar');
  });

  it('keeps a region and other extensions', () => {
    expect(pinNumbering('ar-EG', undefined, page)).toBe('ar-EG-u-nu-arab');
    expect(pinNumbering('ar-u-ca-islamic', undefined, page)).toBe('ar-u-ca-islamic-nu-arab');
  });
});

describe('needsAlignment', () => {
  it('is false where the engine already agrees with the server (nearly everywhere)', () => {
    const numbering = new Intl.NumberFormat('ar').resolvedOptions().numberingSystem;
    expect(needsAlignment({ lang: 'ar', numbering })).toBe(false);
    expect(needsAlignment({ lang: 'en', numbering: 'latn' })).toBe(false);
  });

  it('is false without the server attribute (a page this layout did not render)', () => {
    expect(needsAlignment(readPage(fakeDocument({ lang: 'ar' })))).toBe(false);
  });
});

describe('installNumberingAlignment', () => {
  it('installs nothing where the engine agrees', () => {
    const numbering = new Intl.NumberFormat('ar').resolvedOptions().numberingSystem;
    const win = fakeWindow({ lang: 'ar', 'data-numbering': numbering });
    const before = win.Intl.NumberFormat;
    expect(installNumberingAlignment(win)).toBe(false);
    expect(win.Intl.NumberFormat).toBe(before);
  });

  describe("on an engine that disagrees, the server's digits win", () => {
    const attrs = { lang: 'ar', 'data-numbering': 'arab' };
    const win = fakeWindow(attrs);
    // Node gives bare `ar` Western digits, so `arab` from the server disagrees.
    const installed = installNumberingAlignment(win);

    it('installs', () => {
      expect(installed).toBe(true);
    });

    it('through every Intl constructor that prints digits, with or without `new`', () => {
      expect(new win.Intl.NumberFormat('ar').format(1234)).toMatch(ARAB);
      expect(win.Intl.NumberFormat('ar').format(11)).toBe('١١');
      const date = new Date(Date.UTC(2026, 10, 8));
      expect(new win.Intl.DateTimeFormat('ar', { day: 'numeric', timeZone: 'UTC' }).format(date)).toBe('٨');
      expect(new win.Intl.RelativeTimeFormat('ar', { numeric: 'always' }).format(-5, 'minute')).toMatch(/٥/);
    });

    it('through toLocaleString and friends', () => {
      expect(win.Number.prototype.toLocaleString.call(11, 'ar')).toBe('١١');
      const date = new Date(Date.UTC(2026, 10, 8));
      expect(win.Date.prototype.toLocaleDateString.call(date, 'ar', { day: 'numeric', timeZone: 'UTC' })).toBe('٨');
    });

    it('still behaves as the real constructor', () => {
      const nf = new win.Intl.NumberFormat('ar');
      expect(nf).toBeInstanceOf(Intl.NumberFormat);
      expect(nf).toBeInstanceOf(win.Intl.NumberFormat);
      expect(win.Intl.NumberFormat.supportedLocalesOf(['ar'])).toEqual(['ar']);
    });

    it('never touches another language, and follows a client-side locale switch', () => {
      expect(new win.Intl.NumberFormat('en-GB').format(1234)).toBe('1,234');
      attrs.lang = 'en';
      attrs['data-numbering'] = 'latn';
      expect(new win.Intl.NumberFormat('ar').format(11)).toBe('11');
    });
  });
});
