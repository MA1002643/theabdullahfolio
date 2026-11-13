import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fold, matchLabel, rankActions } from '@/lib/palette/match';

// The invariants of the palette's ranked matcher (issue #41 §3.3), for any
// list and any query. The unit suite pins examples; these pin the contract:
//
//   • an empty query returns every action, in order;
//   • every returned action really matches, and nothing is invented;
//   • highlight ranges are sorted, disjoint, inside the label, and for a
//     label match they cover characters whose folded form contains the query's
//     letters in order;
//   • typing more never ADDS a result (monotonicity: the list only narrows);
//   • ranking is deterministic and keeps each section contiguous.

// Labels from a small alphabet with case, diacritics and spaces, so random
// queries actually hit (a uniform string almost never would).
const ALPHABET = ['a', 'b', 'c', 'e', 'é', 'E', 'o', 'Ö', 'r', 's', ' ', '-', 'İ'];
const text = fc
  .array(fc.constantFrom(...ALPHABET), { minLength: 0, maxLength: 12 })
  .map((cs) => cs.join(''));
const SECTIONS = ['Navigate', 'Projects', 'Actions'];
const actions = fc
  .array(
    fc.record({
      label: text,
      keywords: text,
      section: fc.constantFrom(...SECTIONS),
    }),
    { maxLength: 12 },
  )
  .map((list) => list.map((a, i) => ({ ...a, id: `a${i}`, perform: () => {} })));
const query = fc.array(fc.constantFrom(...ALPHABET), { maxLength: 4 }).map((cs) => cs.join(''));

const matchesSomehow = (a, q) => {
  const f = fold(q);
  if (matchLabel(a.label, f)) return true;
  const hay = `${fold(a.label)} ${fold(`${a.hint || ''} ${a.keywords || ''} ${a.section || ''}`)}`;
  const words = f.split(' ').filter(Boolean);
  return words.length > 0 && words.every((w) => hay.includes(w));
};

describe('rankActions — properties', () => {
  it('an empty query returns every action, in order', () => {
    fc.assert(
      fc.property(actions, (list) => {
        expect(rankActions(list, '').items).toEqual(list);
      }),
    );
  });

  it('returns exactly the actions that match, each once', () => {
    fc.assert(
      fc.property(actions, query, (list, q) => {
        fc.pre(fold(q) !== '');
        const got = rankActions(list, q).items.map((a) => a.id).sort();
        const want = list.filter((a) => matchesSomehow(a, q)).map((a) => a.id).sort();
        expect(got).toEqual(want);
      }),
    );
  });

  it('reports well-formed ranges over the original label', () => {
    fc.assert(
      fc.property(actions, query, (list, q) => {
        const { ranges } = rankActions(list, q);
        for (const [id, rs] of ranges) {
          const label = list.find((a) => a.id === id).label;
          let previousEnd = 0;
          for (const [start, end] of rs) {
            expect(start).toBeGreaterThanOrEqual(previousEnd);
            expect(end).toBeGreaterThan(start);
            expect(end).toBeLessThanOrEqual(label.length);
            previousEnd = end;
          }
          // The highlighted characters, folded, contain the query's letters
          // in order.
          const lit = fold(rs.map(([s, e]) => label.slice(s, e)).join('')).replace(/ /g, '');
          let at = 0;
          for (const ch of fold(q).replace(/ /g, '')) {
            at = lit.indexOf(ch, at);
            expect(at).not.toBe(-1);
            at += 1;
          }
        }
      }),
    );
  });

  it('never adds a result as the query grows', () => {
    fc.assert(
      fc.property(actions, query, fc.constantFrom(...ALPHABET), (list, q, more) => {
        const before = new Set(rankActions(list, q).items.map((a) => a.id));
        const after = rankActions(list, `${q}${more}`).items.map((a) => a.id);
        // Only meaningful once the shorter query filters at all; an empty or
        // blank query returns everything by definition.
        fc.pre(fold(q) !== '' && fold(`${q}${more}`).split(' ').length === fold(q).split(' ').length);
        for (const id of after) expect(before.has(id)).toBe(true);
      }),
    );
  });

  it('is deterministic and keeps sections contiguous', () => {
    fc.assert(
      fc.property(actions, query, (list, q) => {
        const a = rankActions(list, q).items;
        const b = rankActions([...list], q).items;
        expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
        // Contiguity is the ranker's promise only once it ranks: an empty
        // query hands the registry back untouched (fast-check's first
        // counterexample), and the registry's own grouping is its caller's.
        fc.pre(fold(q) !== '');
        const runs = a.map((x) => x.section).filter((s, i, all) => s !== all[i - 1]);
        expect(new Set(runs).size).toBe(runs.length);
      }),
    );
  });
});
