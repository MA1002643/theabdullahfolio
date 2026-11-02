import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { glyphUnits, wordChunks } from '@/components/ui/textSegments';

// Invariants of the shared animation splitter (issue #82). Whatever a title,
// a footer line or a translated sentence contains, cutting it for animation
// must never lose, duplicate or reorder text — the spans' concatenated text is
// what a crawler indexes and what a copy-paste produces. And for the ASCII the
// English site is written in, the cut must equal the old `split('')`, which is
// what keeps every English page byte-identical.

const anyText = fc.string({ unit: 'grapheme', maxLength: 40 });
const ascii = fc.string({ unit: fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCharCode(c)), maxLength: 40 });

describe('textSegments properties', () => {
  it('glyphUnits always reassembles to its input', () => {
    fc.assert(fc.property(anyText, (s) => glyphUnits(s).join('') === s));
  });

  it('glyphUnits is split("") for printable ASCII', () => {
    fc.assert(
      fc.property(ascii, (s) => {
        expect(glyphUnits(s)).toEqual(s.split(''));
      }),
    );
  });

  it('wordChunks reproduces split(" ") for spaced ASCII text', () => {
    fc.assert(
      fc.property(ascii, (s) => {
        const chunks = wordChunks(s);
        expect(chunks.map((c) => c.word)).toEqual(s.split(' '));
        expect(chunks.map((c) => c.gap + c.word).join('')).toBe(s);
      }),
    );
  });
});

describe('wordChunks on unspaced scripts', () => {
  const cjk = fc.string({
    unit: fc.constantFrom(...'私の旅はウェブ開発、。「」（）JavaScript 我的网站：现代ーกขค'.split('')),
  });

  // Whitespace is the one thing the CJK cut normalises: a run of it becomes one
  // gap, and none leads or trails (exactly what the dictionary cut did).
  it('never loses, duplicates or reorders text', () => {
    fc.assert(
      fc.property(cjk.filter((s) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(s)), (s) => {
        expect(wordChunks(s).map((c) => c.gap + c.word).join('')).toBe(s.trim().replace(/\s+/g, ' '));
      }),
    );
  });
});
