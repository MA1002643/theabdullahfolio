import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { flatten, icuProblems, shapeLike } from '../../scripts/i18n-lib.mjs';

// Properties of the catalogue round-trip (issue #82). The translator writes a
// locale file by flattening English, translating the leaves and rebuilding
// with `shapeLike`; if that round-trip lost a key, reordered a namespace or
// invented one, every locale written by the pipeline would silently drift from
// English. And any message must be accepted as a translation of itself.

const key = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,6}$/);
const tree = fc.letrec((tie) => ({
  node: fc.oneof({ depthSize: 'small' }, fc.string({ maxLength: 8 }), tie('obj')),
  obj: fc.dictionary(key, tie('node'), { minKeys: 1, maxKeys: 4 }),
})).obj;

// Empty objects cannot round-trip (no leaf records they existed), and the
// translator never writes one, so the oracle drops them.
function pruneEmpty(value) {
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const child = pruneEmpty(v);
    if (child && typeof child === 'object' && Object.keys(child).length === 0) continue;
    out[k] = child;
  }
  return out;
}

describe('catalogue round-trip', () => {
  it('shapeLike(t, flatten(t)) reproduces t exactly, key order included', () => {
    fc.assert(
      fc.property(tree, (t) => {
        expect(JSON.stringify(shapeLike(t, flatten(t)))).toBe(JSON.stringify(pruneEmpty(t)));
      }),
    );
  });

  it('never produces a key the template does not have', () => {
    fc.assert(
      fc.property(tree, fc.dictionary(fc.string({ maxLength: 10 }), fc.string()), (t, junk) => {
        const keys = new Set(Object.keys(flatten(t)));
        const rebuilt = flatten(shapeLike(t, { ...junk, ...flatten(t) }));
        for (const k of Object.keys(rebuilt)) expect(keys.has(k)).toBe(true);
      }),
    );
  });
});

describe('icuProblems', () => {
  const word = fc.stringMatching(/^[a-z]{1,8}$/);
  const message = fc
    .tuple(word, fc.array(word, { maxLength: 3 }), fc.boolean())
    .map(([lead, args, plural]) =>
      [lead, ...args.map((a) => `{${a}}`), plural ? '{n, plural, one {# x} other {# xs}}' : '']
        .join(' ')
        .trim(),
    );

  it('accepts any well-formed message as a translation of itself', () => {
    fc.assert(
      fc.property(message, (m) => {
        expect(icuProblems(m, m)).toEqual([]);
      }),
    );
  });
});
