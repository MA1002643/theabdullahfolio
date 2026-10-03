import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { detectChanges } from '@/utils/diffChanges';

// detectChanges drives which About-page cards refresh and flash "updated"
// (issue #92, L2). Its contract, from its own header and its one caller
// (src/components/about/index.jsx):
//
//   • paths are capped at TWO levels ("stats.user", never "stats.user.name");
//   • arrays are atomic (the array's own path, never "languages.0");
//   • only keys present in the NEW payload are compared. That last one is a
//     deliberate choice, not an oversight, and a property pins it: the caller
//     passes its own state as `oldData`, which carries client-only keys
//     (`languagesLive`, `statsLive`) the API never sends. Comparing the union of
//     keys would report those on every poll and flash every banner.
//
// Keys are identifier-shaped: a key containing "." would be indistinguishable
// from nesting in the emitted path, and API payloads never contain one.

const key = fc.stringMatching(/^[a-z][a-zA-Z0-9_]{0,6}$/);
const leaf = fc.oneof(fc.integer(), fc.string({ maxLength: 6 }), fc.boolean(), fc.constant(null));
const payload = fc.letrec((tie) => ({
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    leaf,
    fc.array(leaf, { maxLength: 3 }),
    fc.dictionary(key, tie('node'), { maxKeys: 4 }),
  ),
  root: fc.dictionary(key, tie('node'), { minKeys: 1, maxKeys: 5 }),
})).root;

/** Every leaf path (arrays count as leaves), as arrays of keys. */
function leafPaths(value, prefix = []) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return [];
    return keys.flatMap((k) => leafPaths(value[k], [...prefix, k]));
  }
  return [prefix];
}

const setAt = (obj, path, v) => {
  const copy = structuredClone(obj);
  let node = copy;
  path.slice(0, -1).forEach((k) => (node = node[k]));
  node[path[path.length - 1]] = v;
  return copy;
};

const SENTINEL = 'ΔchangedΔ';

describe('detectChanges — properties', () => {
  it('reports nothing for identical payloads', () => {
    fc.assert(
      fc.property(payload, (p) => {
        expect(detectChanges(p, structuredClone(p))).toEqual([]);
      }),
    );
  });

  it('never emits a path deeper than two levels, nor a duplicate', () => {
    fc.assert(
      fc.property(payload, payload, (a, b) => {
        const paths = detectChanges(a, b);
        paths.forEach((p) => expect(p.split('.').length).toBeLessThanOrEqual(2));
        expect(new Set(paths).size).toBe(paths.length);
      }),
    );
  });

  it('always reports a changed leaf, under its two-level prefix', () => {
    fc.assert(
      fc.property(payload, fc.nat(), (p, pick) => {
        const paths = leafPaths(p).filter((path) => path.length > 0);
        fc.pre(paths.length > 0);
        const path = paths[pick % paths.length];
        const changed = setAt(p, path, SENTINEL);
        expect(detectChanges(p, changed)).toContain(path.slice(0, 2).join('.'));
      }),
    );
  });

  it('treats arrays atomically: any element change reports the array path', () => {
    fc.assert(
      fc.property(key, fc.array(leaf, { minLength: 1, maxLength: 4 }), fc.nat(), (k, arr, i) => {
        const next = [...arr];
        next[i % arr.length] = SENTINEL;
        const diff = detectChanges({ [k]: arr }, { [k]: next });
        expect(diff).toEqual([k]);
      }),
    );
  });

  it('ignores keys the new payload does not carry (the caller relies on it)', () => {
    fc.assert(
      fc.property(payload, payload, (p, extra) => {
        // `old` = the new payload plus keys only the old side has.
        const old = { ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [`client_${k}`, v])), ...p };
        expect(detectChanges(old, p)).toEqual([]);
      }),
    );
  });
});
