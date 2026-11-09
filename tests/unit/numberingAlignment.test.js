import { describe, expect, it } from 'vitest';

import { intlTag } from '@/i18n/format';
import { LOCALE_CODES } from '@/i18n/locales';
import {
  disagreements,
  installNumberingAlignment,
  parseNumbering,
  pinNumbering,
  serverNumbering,
} from '@/i18n/numberingAlignment';

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
// What this server would write, with Arabic swapped to the old-ICU answer.
const ownTable = serverNumbering(LOCALE_CODES.map(intlTag));
const disagreeingTable = ownTable.replace(/\bar:\w+/, 'ar:arab');

describe('serverNumbering / parseNumbering', () => {
  it('names every site language exactly once, and round-trips', () => {
    const table = parseNumbering(ownTable);
    const languages = new Set(LOCALE_CODES.map((c) => new Intl.Locale(intlTag(c)).language));
    expect([...table.keys()].sort()).toEqual([...languages].sort());
    // Two site locales sharing a language would make the table ambiguous.
    expect(languages.size).toBe(LOCALE_CODES.length);
    expect(table.get('fa')).toBe(new Intl.NumberFormat('fa').resolvedOptions().numberingSystem);
  });

  it('drops anything malformed', () => {
    expect([...parseNumbering('ar:arab  junk :latn x:"><  fa:arabext')]).toEqual([
      ['ar', 'arab'],
      ['fa', 'arabext'],
    ]);
    expect(parseNumbering(null).size).toBe(0);
  });
});

describe('pinNumbering', () => {
  const pins = new Map([['ar', 'arab']]);

  it("pins a disagreeing language to the server's numbering system", () => {
    expect(pinNumbering('ar', undefined, pins)).toBe('ar-u-nu-arab');
    expect(pinNumbering(['ar', 'en'], undefined, pins)).toEqual(['ar-u-nu-arab', 'en']);
  });

  it('leaves every other request alone', () => {
    expect(pinNumbering('en-GB', undefined, pins)).toBe('en-GB');
    expect(pinNumbering(undefined, undefined, pins)).toBeUndefined();
    expect(pinNumbering('ar-u-nu-latn', undefined, pins)).toBe('ar-u-nu-latn');
    expect(pinNumbering('ar-u-ca-islamic-nu-latn', undefined, pins)).toBe('ar-u-ca-islamic-nu-latn');
    expect(pinNumbering('ar', { numberingSystem: 'latn' }, pins)).toBe('ar');
    expect(pinNumbering('ar', undefined, new Map())).toBe('ar');
  });

  it('keeps a region and other extensions', () => {
    expect(pinNumbering('ar-EG', undefined, pins)).toBe('ar-EG-u-nu-arab');
    expect(pinNumbering('ar-u-ca-islamic', undefined, pins)).toBe('ar-u-ca-islamic-nu-arab');
  });
});

describe('disagreements', () => {
  it('is empty where the engine already agrees with the server (nearly everywhere)', () => {
    expect(disagreements(parseNumbering(ownTable)).size).toBe(0);
  });

  it('lists only the languages that differ', () => {
    expect([...disagreements(parseNumbering(disagreeingTable))]).toEqual([['ar', 'arab']]);
  });
});

describe('installNumberingAlignment', () => {
  it('installs nothing where the engine agrees', () => {
    const win = fakeWindow({ lang: 'ar', 'data-numbering': ownTable });
    const before = win.Intl.NumberFormat;
    expect(installNumberingAlignment(win)).toBe(false);
    expect(win.Intl.NumberFormat).toBe(before);
  });

  it('installs nothing without the server attribute (a page this layout did not render)', () => {
    expect(installNumberingAlignment(fakeWindow({ lang: 'ar' }))).toBe(false);
  });

  describe("on an engine that disagrees, the server's digits win", () => {
    const win = fakeWindow({ lang: 'ar', 'data-numbering': disagreeingTable });
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

    // The regression (#198 review): the construct trap built `new target(...)`
    // and dropped `newTarget`, so a subclass's `super()` returned a bare native
    // instance, without the subclass's prototype or methods, in every locale.
    it('keeps native subclassing working, for every wrapped constructor', () => {
      class CustomNumber extends win.Intl.NumberFormat {
        twice(n) {
          return `${this.format(n)}|${this.format(n)}`;
        }
      }
      for (const locale of ['ar', 'en-GB']) {
        const nf = new CustomNumber(locale);
        expect(nf).toBeInstanceOf(CustomNumber);
        expect(Object.getPrototypeOf(nf)).toBe(CustomNumber.prototype);
        expect(typeof nf.twice).toBe('function');
      }
      expect(new CustomNumber('ar').twice(11)).toBe('١١|١١');
      expect(new CustomNumber('en-GB').twice(11)).toBe('11|11');

      class CustomDate extends win.Intl.DateTimeFormat {}
      class CustomRelative extends win.Intl.RelativeTimeFormat {}
      const date = new CustomDate('ar', { day: 'numeric', timeZone: 'UTC' });
      expect(date).toBeInstanceOf(CustomDate);
      expect(date.format(new Date(Date.UTC(2026, 10, 8)))).toBe('٨');
      const rel = new CustomRelative('ar', { numeric: 'always' });
      expect(rel).toBeInstanceOf(CustomRelative);
      expect(rel.format(-5, 'minute')).toMatch(/٥/);
    });

    it('never touches a language the engine agrees on', () => {
      expect(new win.Intl.NumberFormat('en-GB').format(1234)).toBe('1,234');
    });
  });

  // The regression (#198 review): the visit ENTERS on a language this engine
  // agrees on, then switches to one it does not. The switch is a soft
  // navigation (useLocaleSwitch), so the before-hydration install never runs
  // again; and the new locale's formatters are built during the render, while
  // `<html lang>` still names the OLD locale. The fix has to have decided for
  // Arabic already, at the English entry.
  it('aligns a language switched to after entering on one that agrees', () => {
    const attrs = { lang: 'en', 'data-numbering': disagreeingTable };
    const win = fakeWindow(attrs);
    // Entry on /en: English agrees, but Arabic does not, so it installs.
    expect(installNumberingAlignment(win)).toBe(true);
    expect(new win.Intl.NumberFormat('en-GB').format(11)).toBe('11');
    // Mid-switch: Arabic formatters are built while the document still says
    // English. They must already carry the server's digits.
    expect(new win.Intl.NumberFormat('ar').format(11)).toBe('١١');
    // After the commit nothing changes either: the document is never consulted.
    attrs.lang = 'ar';
    expect(win.Intl.NumberFormat('ar').format(11)).toBe('١١');
    attrs.lang = 'en';
    expect(new win.Intl.NumberFormat('en-GB').format(11)).toBe('11');
  });
});
