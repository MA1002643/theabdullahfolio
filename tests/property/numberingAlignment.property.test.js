import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { pinNumbering } from '@/i18n/numberingAlignment';

// pinNumbering (issue #198) runs on every Intl constructor call on an engine
// that disagrees with the server's digits, so it must be safe for ANY input a
// caller might pass. Three invariants:
//
//   • it only ever changes a tag of the page's own language;
//   • a tag it changes still names the same locale, plus `nu`;
//   • it is idempotent: pinning a pinned tag changes nothing.

const PAGE_LANGS = ['ar', 'fa', 'ur', 'he', 'en'];
const NUMBERINGS = ['latn', 'arab', 'arabext', 'deva'];
const lang = fc.constantFrom(...PAGE_LANGS, 'ja', 'zh', 'hi', 'es');
const region = fc.option(fc.constantFrom('EG', 'SA', 'GB', 'IR', 'PK'), { nil: undefined });
const tag = fc.tuple(lang, region).map(([l, r]) => (r ? `${l}-${r}` : l));
const page = fc.record({ lang: fc.constantFrom(...PAGE_LANGS), numbering: fc.constantFrom(...NUMBERINGS) });

describe('pinNumbering properties', () => {
  it('changes only tags of the page language, and only by adding `nu`', () => {
    fc.assert(
      fc.property(tag, page, (t, p) => {
        const out = pinNumbering(t, undefined, p);
        const sameLanguage = new Intl.Locale(t).language === new Intl.Locale(p.lang).language;
        if (!sameLanguage) return out === t;
        const loc = new Intl.Locale(out);
        return loc.numberingSystem === p.numbering && loc.baseName === new Intl.Locale(t).baseName;
      }),
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.array(tag, { maxLength: 4 }), page, (tags, p) => {
        const once = pinNumbering(tags, undefined, p);
        expect(pinNumbering(once, undefined, p)).toEqual(once);
      }),
    );
  });

  it('never overrides a caller who chose a numbering system', () => {
    fc.assert(
      fc.property(tag, page, fc.constantFrom(...NUMBERINGS), (t, p, nu) => {
        expect(pinNumbering(t, { numberingSystem: nu }, p)).toBe(t);
        const explicit = new Intl.Locale(t, { numberingSystem: nu }).toString();
        expect(pinNumbering(explicit, undefined, p)).toBe(explicit);
      }),
    );
  });
});
