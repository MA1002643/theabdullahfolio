import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createCitationParser, MAX_MARKER } from '@/lib/ask/citations';

// The streaming citation parser (issue #41). The model's prose arrives in
// deltas of any size, and a "[[P2]]" marker can be cut anywhere. The parser's
// contract, for ANY text and ANY way of cutting it:
//
//   • the events, with adjacent text merged, are the same as for the text
//     delivered whole (chunking is invisible);
//   • only citable ids ever become cite events, in the order they were written;
//   • the visible text is the input with every id-shaped marker removed and
//     nothing else lost; a span longer than MAX_MARKER is never a marker.

const CITABLE = new Set(['P1', 'P2', 'J:indie', 'L:github']);
const isCitable = (id) => CITABLE.has(id);

const piece = fc.oneof(
  fc.string({ unit: 'grapheme', maxLength: 8 }),
  fc.constantFrom('[[P1]]', '[[P2]]', '[[J:indie]]', '[[L:github]]', '[[P999]]', '[[X:nope]]', '[', ']', '[[', ']]', '[[a b]]'),
  // Padding that straddles MAX_MARKER, so markers near and past the cutoff
  // are generated (a marker is only bounded if the bound is exercised).
  fc.integer({ min: 40, max: 56 }).map((n) => ' '.repeat(n)),
);
const text = fc.array(piece, { maxLength: 12 }).map((ps) => ps.join(''));

function run(chunks) {
  const parser = createCitationParser(isCitable);
  const events = [...chunks.flatMap((c) => parser.push(c)), ...parser.end()];
  // Merge adjacent text so different cuts compare equal.
  const merged = [];
  for (const e of events) {
    const last = merged[merged.length - 1];
    if (e.type === 'text' && last?.type === 'text') last.text += e.text;
    else merged.push({ ...e });
  }
  return merged;
}

function cut(s, points) {
  const cps = [...s];
  const at = [...new Set(points.map((p) => (cps.length ? p % (cps.length + 1) : 0)))].sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of at) {
    out.push(cps.slice(prev, p).join(''));
    prev = p;
  }
  out.push(cps.slice(prev).join(''));
  return out;
}

describe('citation parser — properties', () => {
  it('is independent of how the stream is cut', () => {
    fc.assert(
      fc.property(text, fc.array(fc.nat(), { maxLength: 10 }), (s, points) => {
        expect(run(cut(s, points))).toEqual(run([s]));
      }),
    );
  });

  it('emits only citable ids, in written order, and removes every id-shaped marker from the text', () => {
    fc.assert(
      fc.property(text, (s) => {
        const events = run([s]);
        const cites = events.filter((e) => e.type === 'cite').map((e) => e.id);
        for (const id of cites) expect(CITABLE.has(id)).toBe(true);
        // Leftmost, non-overlapping markers — the parser's own scan order.
        const expectedCites = [];
        let visible = '';
        let at = 0;
        for (;;) {
          const open = s.indexOf('[[', at);
          if (open === -1) break;
          const close = s.indexOf(']]', open + 2);
          if (close === -1) break;
          visible += s.slice(at, open);
          if (close + 2 - open > MAX_MARKER) {
            // Too long to be a marker: the "[[" is text, and the scan
            // resumes inside it, where a shorter marker may still start.
            visible += '[[';
            at = open + 2;
            continue;
          }
          const id = s.slice(open + 2, close).trim();
          if (/^[A-Za-z][A-Za-z0-9]*(?::[A-Za-z0-9_-]+)?$/.test(id)) {
            if (CITABLE.has(id)) expectedCites.push(id);
          } else {
            visible += s.slice(open, close + 2);
          }
          at = close + 2;
        }
        visible += s.slice(at);
        expect(cites).toEqual(expectedCites);
        expect(events.filter((e) => e.type === 'text').map((e) => e.text).join('')).toBe(visible);
      }),
    );
  });
});
