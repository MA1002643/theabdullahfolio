import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

import { read } from '../support/source.js';

// Right-to-left layout for globals.css (issue #82).
//
// `<html dir="rtl">` is set for ar / he / fa / ur, and every inline-axis box
// property in the stylesheet is written logically (`margin-inline-start`,
// `padding-inline-end`, `border-inline-start`, `text-align: start`) so it
// mirrors with the page. A physical `margin-left` that comes back would look
// fine in English and sit on the wrong side of every RTL page, which nothing
// else in CI would notice. This keeps it from coming back unreviewed.
//
// The file is PARSED (postcss), not regex-scanned, so comments — this
// stylesheet is mostly comments, and many of them say "left" — never count.
//
// Box offsets (`left:` / `right:`) are deliberately NOT policed here: most of
// them are symmetric pairs, centring, full-bleed backdrops or measured hero
// geometry, and an allowlist of those would be longer than the rule.

const CSS = 'src/app/globals.css';

const PHYSICAL = [
  { prop: /^(margin|padding)-(left|right)$/ },
  { prop: /^border-(left|right)(-.+)?$/ },
  { prop: /^text-align$/, value: /^(left|right)$/ },
  { prop: /^float$/, value: /^(left|right)$/ },
  { prop: /^clear$/, value: /^(left|right)$/ },
];

// Declarations that must stay physical, keyed `selector → property`. Each one
// says WHY. Adding to this list is a review decision, not a way to make the
// test pass: if the element should mirror, write it logically instead.
const ALLOWED = new Map([
  // Centres the 2px cutter on the `left` Framer animates 0% → 100% in
  // MachinePlate.jsx. The animated property is physical, so its centring
  // offset has to be too — a logical margin would land 2px off under RTL.
  ['.uses-cutter → margin-left', 'centres a JS-animated physical `left`'],
  // The same arrangement on the ruler's etch head (InstrumentsPlate.jsx).
  ['.uses-meter__etch → margin-left', 'centres a JS-animated physical `left`'],
]);

function physicalDeclarations() {
  const found = [];
  postcss.parse(read(CSS), { from: CSS }).walkDecls((decl) => {
    const value = decl.value.trim().replace(/\s*!important$/, '');
    const hit = PHYSICAL.some((p) => p.prop.test(decl.prop) && (!p.value || p.value.test(value)));
    if (!hit) return;
    const rule = decl.parent;
    const selector = rule?.type === 'rule' ? rule.selector.replace(/\s+/g, ' ') : `@${rule?.name}`;
    found.push({ key: `${selector} → ${decl.prop}`, line: decl.source.start.line });
  });
  return found;
}

describe('globals.css is written in logical properties', () => {
  it('has no physical inline-axis declaration outside the allowlist', () => {
    const offenders = physicalDeclarations()
      .filter(({ key }) => !ALLOWED.has(key))
      .map(({ key, line }) => `${CSS}:${line}  ${key}`);
    expect(
      offenders,
      'Use the logical property (margin-inline-start, padding-inline-end, ' +
        'border-inline-start, text-align: start/end, float: inline-start), or add ' +
        'the selector to ALLOWED with the reason it must not mirror.',
    ).toEqual([]);
  });

  it('every allowlisted declaration still exists (no stale exemptions)', () => {
    const present = new Set(physicalDeclarations().map(({ key }) => key));
    const stale = [...ALLOWED.keys()].filter((key) => !present.has(key));
    expect(stale, 'Remove allowlist entries whose declaration is gone.').toEqual([]);
  });

  it('never lists a :dir() selector alongside others', () => {
    // An engine without :dir() drops the WHOLE rule, so a :dir(rtl) override
    // sharing a selector list would take its LTR siblings down with it.
    const shared = [];
    postcss.parse(read(CSS), { from: CSS }).walkRules((rule) => {
      if (rule.selector.includes(':dir(') && rule.selectors.length > 1) {
        shared.push(`${CSS}:${rule.source.start.line}  ${rule.selector}`);
      }
    });
    expect(shared).toEqual([]);
  });

  it('defines the --inline-sign that the direction-aware keyframes multiply by', () => {
    const signs = {};
    postcss.parse(read(CSS), { from: CSS }).walkDecls('--inline-sign', (decl) => {
      signs[decl.parent.selector] = decl.value.trim();
    });
    expect(signs).toEqual({ "[dir='ltr']": '1', "[dir='rtl']": '-1' });
  });
});
