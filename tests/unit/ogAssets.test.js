import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { monogramDataUri, ogFonts } from '@/lib/og/assets';
import { projectsData } from '@/app/data';

// The share-card asset layer (issue #90). This directory was 944 KB of full
// Google Fonts TTFs and a 1024px seal for cards that set English on a 1200px
// canvas; it is now 157 KB. Two things can quietly undo that, and each has a
// test here:
//
//   1. Someone swaps a subset back for a full font. Guarded by byte budgets.
//   2. Someone adds copy containing a character the subsets dropped. satori
//      renders a missing glyph as NOTHING — no error, no build failure, just
//      a hole in a card nobody looks at until it is on someone's timeline.
//      Guarded by reading the fonts' own cmap and asserting coverage.

// Generous enough to survive normal drift, tight enough that the artefacts
// this issue replaced blow straight through: the full Montserrat 800 is
// 183 KB, the full Inter 600 is 326 KB, and the weakly-compressed seal was
// 224 KB against the 90 KB it recompresses to.
const BUDGETS = {
  Montserrat: 32 * 1024,
  Inter: 40 * 1024,
  seal: 112 * 1024,
};

/**
 * Minimal WOFF reader: enough to pull one table out and no more.
 * WOFF is an sfnt whose tables are individually zlib-compressed — header is
 * 44 bytes, then 20-byte directory entries of tag/offset/compLength/origLength,
 * and a table is stored raw when compLength === origLength.
 */
function readWoffTable(buf, want) {
  expect(buf.toString('latin1', 0, 4)).toBe('wOFF');
  const numTables = buf.readUInt16BE(12);
  for (let i = 0; i < numTables; i++) {
    const p = 44 + i * 20;
    const tag = buf.toString('latin1', p, p + 4);
    if (tag !== want) continue;
    const offset = buf.readUInt32BE(p + 4);
    const compLength = buf.readUInt32BE(p + 8);
    const origLength = buf.readUInt32BE(p + 12);
    const slice = buf.subarray(offset, offset + compLength);
    return compLength === origLength ? slice : inflateSync(slice);
  }
  throw new Error(`WOFF has no ${want} table`);
}

// Ceiling on what this reader will expand. Deliberately far above anything
// legitimate — the subsets map 337 and 339 code points and the full families
// they replaced mapped only 1,312 and 2,849, so restoring a full font is
// caught by the byte budgets above, not by this. This exists for the cases
// budgets cannot bound in time: a malformed format 12 table, or a genuinely
// vast family (a CJK font maps tens of thousands), where the cost is in the
// expansion rather than the file size.
const MAX_CODE_POINTS = 20000;

/**
 * Every code point the font maps, from its format 4 / format 12 cmap subtables.
 *
 * Bounded on purpose. Format 4 is 16-bit and so caps itself at U+FFFF, but a
 * format 12 group declares an arbitrary 32-bit range against a 32-bit group
 * count, and expanding those naively is unbounded work — a malformed table
 * would materialise millions of Set entries and hang the run instead of
 * failing it. A vitest failure does not stop the rest of the file either, so
 * this cannot lean on the assertions above to have stopped things first.
 *
 * Ranges are refused BEFORE expansion, so the check costs one comparison per
 * group rather than one per code point. And it throws rather than truncating:
 * a silently short set would fail the coverage tests below with a message
 * blaming missing glyphs, pointing at the copy instead of at the font that was
 * actually swapped in.
 *
 * What is counted is the work, not `points.size`. Those differ: cmap ranges may
 * overlap, and a Set stops growing once they do, so a size-based ceiling never
 * trips while the loop repeats. Five thousand identical 5,000-wide groups hold
 * the Set at 5,001 entries and still cost 25 million iterations — bounded by
 * nothing. Accumulating every expanded code point closes that, because each
 * group must contribute at least one.
 */
function codePoints(cmap) {
  const points = new Set();
  const numTables = cmap.readUInt16BE(2);
  let expanded = 0;

  const admit = (start, end) => {
    // Well-formed subtables are ascending; a descending pair means the table is
    // malformed, and skipping it silently (a loop that simply never runs) would
    // hand back a short set that reads as missing glyphs downstream.
    if (end < start) {
      throw new Error(
        `cmap declares a descending range U+${start.toString(16).toUpperCase()}..` +
          `U+${end.toString(16).toUpperCase()} — malformed table.`,
      );
    }

    // Both endpoints are mapped, so an inclusive range spans end - start + 1.
    expanded += end - start + 1;

    if (expanded > MAX_CODE_POINTS) {
      throw new Error(
        `cmap expands past ${MAX_CODE_POINTS} code points — refusing to continue. ` +
          'Either the font in src/lib/og/fonts is far larger than this directory ' +
          'should hold, or its cmap is malformed.',
      );
    }
  };

  for (let i = 0; i < numTables; i++) {
    const offset = cmap.readUInt32BE(4 + i * 8 + 4);
    const format = cmap.readUInt16BE(offset);

    if (format === 4) {
      const segCount = cmap.readUInt16BE(offset + 6) / 2;
      const ends = offset + 14;
      const starts = ends + segCount * 2 + 2;
      for (let s = 0; s < segCount; s++) {
        const end = cmap.readUInt16BE(ends + s * 2);
        const start = cmap.readUInt16BE(starts + s * 2);
        if (start === 0xffff) continue;
        admit(start, end);
        for (let cp = start; cp <= end; cp++) points.add(cp);
      }
    } else if (format === 12) {
      const nGroups = cmap.readUInt32BE(offset + 12);
      for (let g = 0; g < nGroups; g++) {
        const p = offset + 16 + g * 12;
        const start = cmap.readUInt32BE(p);
        const end = cmap.readUInt32BE(p + 4);
        admit(start, end);
        for (let cp = start; cp <= end; cp++) points.add(cp);
      }
    }
  }
  return points;
}

/** Printable ASCII — every card sets some of it. */
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));

/** The marks the card chrome itself sets, independent of any page's copy. */
const CHROME_MARKS = ['·', '’', '–', '—', '…', '§', '×', '→'];

/**
 * Accented Latin the live location feed can put on the homepage card: the
 * town segment is `town.trim().toUpperCase()` straight from KV, so a trip to
 * Málaga or Łódź must not punch a hole in the strip.
 */
const PLACE_NAME_LETTERS = [...'ÁÀÂÄÅÃÇÉÈÊËÍÎÏÑÓÒÔÖÕØÚÙÛÜÝŁŃŚŹŻČŘŠŽĞİŞáàâäåãçéèêëíîïñóòôöõøúùûüýłńśźżčřšžğışİ'];

async function fontCoverage() {
  const entries = await Promise.all(
    [
      ['Montserrat', 'src/lib/og/fonts/Montserrat-800.woff'],
      ['Inter', 'src/lib/og/fonts/Inter-600.woff'],
    ].map(async ([name, file]) => {
      const buf = await readFile(file);
      return [name, { buf, points: codePoints(readWoffTable(buf, 'cmap')) }];
    }),
  );
  return Object.fromEntries(entries);
}

describe('og asset budgets', () => {
  it('ships subsetted WOFF fonts, not the full families', async () => {
    const fonts = await ogFonts();
    expect(fonts.map((f) => `${f.name}/${f.weight}`)).toEqual([
      'Montserrat/800',
      'Inter/600',
    ]);

    for (const font of fonts) {
      expect(font.data.byteLength).toBeGreaterThan(0);
      // wOFF magic — a .ttf swapped in here would start with 0x00010000.
      expect(font.data.toString('latin1', 0, 4)).toBe('wOFF');
      expect(font.data.byteLength).toBeLessThan(BUDGETS[font.name]);
    }
  });

  it('ships the seal as a PNG data URI within budget', async () => {
    const uri = await monogramDataUri();
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);

    const png = Buffer.from(uri.slice('data:image/png;base64,'.length), 'base64');
    // PNG magic. satori cannot decode WebP — it throws "a is not iterable" —
    // so a well-meaning re-encode to a smaller format blanks every card.
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(png.byteLength).toBeLessThan(BUDGETS.seal);
  });
});

/**
 * A synthetic cmap carrying one format 12 subtable, for exercising the reader's
 * bounds without needing a pathological font on disk. Header is 12 bytes (a
 * version, a table count and one 8-byte encoding record pointing at the
 * subtable); the subtable is format/reserved/length/language/nGroups followed
 * by 12-byte start/end/startGlyphID triples.
 */
function fakeFormat12Cmap(groups) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(1, 2); // numTables
  header.writeUInt16BE(3, 4); // platformID
  header.writeUInt16BE(10, 6); // encodingID
  header.writeUInt32BE(12, 8); // offset of the subtable

  const sub = Buffer.alloc(16 + groups.length * 12);
  sub.writeUInt16BE(12, 0); // format
  sub.writeUInt32BE(sub.length, 4); // length
  sub.writeUInt32BE(groups.length, 12); // nGroups
  groups.forEach(([start, end], i) => {
    const p = 16 + i * 12;
    sub.writeUInt32BE(start, p);
    sub.writeUInt32BE(end, p + 4);
    sub.writeUInt32BE(1, p + 8); // startGlyphID
  });

  return Buffer.concat([header, sub]);
}

describe('cmap reader bounds', () => {
  it('reads a well-formed format 12 table', () => {
    const points = codePoints(
      fakeFormat12Cmap([
        [0x41, 0x43],
        [0x2190, 0x2192],
      ]),
    );
    expect([...points].sort((a, b) => a - b)).toEqual([
      0x41, 0x42, 0x43, 0x2190, 0x2191, 0x2192,
    ]);
  });

  // Both assertions were checked against a neutralised guard. The aggregate
  // case then fails in 2ms on the missing error; the single full-range case
  // takes 2.7s and trips the timeout as well, having expanded 1.1M entries
  // first. (Raw node expands that range in ~180ms — it is an order of
  // magnitude dearer inside the runner, which is the environment that
  // matters.) Refusing per group, before expansion, is what keeps this O(1):
  // nGroups is a 32-bit count, so a table of a thousand such groups would
  // otherwise turn minutes of Set churn into a CI timeout.
  it('refuses a single range wider than any subset, without expanding it', () => {
    expect(() => codePoints(fakeFormat12Cmap([[0, 0x10ffff]]))).toThrow(
      /refusing to continue/,
    );
  }, 2000);

  it('refuses ranges that only breach the ceiling in aggregate', () => {
    expect(() =>
      codePoints(
        fakeFormat12Cmap([
          [0, 8999],
          [10000, 18999],
          [20000, 28999],
        ]),
      ),
    ).toThrow(/refusing to continue/);
  }, 2000);

  it('counts ranges inclusively, so the ceiling is not one code point loose', () => {
    // cmap ranges map BOTH endpoints, so [1, 20000] is exactly the ceiling and
    // [0, 20000] is one past it. Measuring a range as `end - start` rather than
    // `end - start + 1` admitted that second case.
    expect(() =>
      codePoints(fakeFormat12Cmap([[1, MAX_CODE_POINTS]])),
    ).not.toThrow();
    expect(() => codePoints(fakeFormat12Cmap([[0, MAX_CODE_POINTS]]))).toThrow(
      /refusing to continue/,
    );
  }, 2000);

  it('bounds the work rather than the set, so overlapping ranges cannot spin', () => {
    // Identical groups add no new entries, so a ceiling read off `points.size`
    // never trips however many arrive: these 5,000 hold the Set at 5,001 while
    // costing 25 million iterations. Counting expanded code points is what
    // makes the guard bound the loop instead of the result.
    const overlapping = Array.from({ length: 5000 }, () => [0, 5000]);
    expect(() => codePoints(fakeFormat12Cmap(overlapping))).toThrow(
      /refusing to continue/,
    );
  }, 2000);

  it('refuses a descending range instead of skipping it', () => {
    // `for (cp = 500; cp <= 100; cp++)` simply never runs, so a malformed
    // table used to pass through as a silently short set — which surfaces
    // later as a coverage failure blaming the copy, not the font.
    expect(() => codePoints(fakeFormat12Cmap([[500, 100]]))).toThrow(
      /descending range U\+1F4\.\.U\+64/,
    );
  }, 2000);
});

describe('og font glyph coverage', () => {
  it('covers printable ASCII in both faces', async () => {
    const fonts = await fontCoverage();
    for (const [name, { points }] of Object.entries(fonts)) {
      const missing = ASCII.filter((c) => !points.has(c.codePointAt(0)));
      expect(missing, `${name} is missing ${JSON.stringify(missing)}`).toEqual([]);
    }
  });

  it('covers the marks the card chrome sets', async () => {
    const fonts = await fontCoverage();
    for (const [name, { points }] of Object.entries(fonts)) {
      const missing = CHROME_MARKS.filter((c) => !points.has(c.codePointAt(0)));
      expect(missing, `${name} is missing ${JSON.stringify(missing)}`).toEqual([]);
    }
  });

  it('covers accented Latin, so a live town name cannot blank the strip', async () => {
    const { Inter } = await fontCoverage();
    const missing = PLACE_NAME_LETTERS.filter((c) => !Inter.points.has(c.codePointAt(0)));
    expect(missing, `Inter is missing ${JSON.stringify(missing)}`).toEqual([]);
  });

  it('covers every character the project posters typeset', async () => {
    const fonts = await fontCoverage();

    // projectCard sets the name in Montserrat and the category/description in
    // Inter, and it uppercases the category — which can change the characters
    // involved, so both cases are checked.
    const display = new Set();
    const body = new Set();
    for (const p of projectsData) {
      for (const ch of String(p.name)) display.add(ch);
      for (const ch of `${p.category}${String(p.category).toUpperCase()}`) body.add(ch);
      for (const ch of String(p.description ?? '')) body.add(ch);
      for (const ch of String(p.date ?? '').slice(0, 4)) body.add(ch);
    }

    const missingDisplay = [...display].filter((c) => !fonts.Montserrat.points.has(c.codePointAt(0)));
    const missingBody = [...body].filter((c) => !fonts.Inter.points.has(c.codePointAt(0)));

    expect(missingDisplay, `Montserrat cannot set ${JSON.stringify(missingDisplay)}`).toEqual([]);
    expect(missingBody, `Inter cannot set ${JSON.stringify(missingBody)}`).toEqual([]);
  });
});
