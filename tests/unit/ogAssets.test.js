import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { monogramDataUri, ogFonts } from '@/lib/og/assets';
import { projectsData } from '@/app/data';

// The share-card asset layer (issue #90). This directory was 944 KB of full
// Google Fonts TTFs and a 1024px seal for cards that set English on a 1200px
// canvas; it is now 128 KB. Two things can quietly undo that, and each has a
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

/** Every code point the font maps, from its format 4 / format 12 cmap subtables. */
function codePoints(cmap) {
  const points = new Set();
  const numTables = cmap.readUInt16BE(2);

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
        for (let cp = start; cp <= end; cp++) points.add(cp);
      }
    } else if (format === 12) {
      const nGroups = cmap.readUInt32BE(offset + 12);
      for (let g = 0; g < nGroups; g++) {
        const p = offset + 16 + g * 12;
        const start = cmap.readUInt32BE(p);
        const end = cmap.readUInt32BE(p + 4);
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
