import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Font + artwork loading for the OG card renderers (issue #88 v2).
// Everything is read once per process and cached as a module-level
// promise — a build renders many cards, a warm lambda serves many
// crawlers, and neither should touch the filesystem twice.
//
// The `path.join(process.cwd(), 'literal/…')` shape matters: Vercel's
// file tracer bundles files it can prove are read, and it can only
// prove literals. Do not refactor these into computed paths.
//
// SUBSETTED FONTS (issue #90). These were the full Google Fonts TTFs —
// 509 KB carrying Cyrillic, Greek, IPA and ~900 symbols for cards that
// set English. They are now WOFF subsets totalling 47 KB, which render
// PIXEL-IDENTICALLY: the kept ranges cover printable ASCII, the eight
// non-ASCII marks the cards actually use (§ · × – — ’ … →) and Latin-1
// + Latin Extended-A as headroom for European place names arriving from
// the live location feed. Regenerate with:
//
//   python3 -m fontTools.subset <full>.ttf --no-hinting --flavor=woff \
//     --output-file=<out>.woff \
//     --unicodes='U+0020-007E,U+00A0-00FF,U+0100-017F,U+2010-2015,U+2018-201F,U+2022,U+2026,U+2030,U+2039-203A,U+20AC,U+2122,U+2192'
//
// Keep that list on ONE line. A `\` line-continuation inside the single
// quotes is not one — the quotes make the backslash, newline and indent
// literal — and closing the quote per line instead splits the value into
// a second argument that pyftsubset reads as a glyph name, failing with
// MissingGlyphsSubsettingError. Both were tried; the one-liner above is
// verified to reproduce the committed .woff files byte for byte.
//
// WOFF, not WOFF2: satori parses ttf/otf/woff only. A non-Latin town
// name (Cyrillic, Greek, CJK) now falls outside the subset and would
// render blank — the strip degrades to its other segments, and the town
// segment is the lowest-priority one.
let fontsPromise;
export function ogFonts() {
  fontsPromise ??= Promise.all([
    readFile(path.join(process.cwd(), 'src/lib/og/fonts/Montserrat-800.woff')),
    readFile(path.join(process.cwd(), 'src/lib/og/fonts/Inter-600.woff')),
  ]).then(([montserrat, inter]) => [
    { name: 'Montserrat', data: montserrat, weight: 800, style: 'normal' },
    { name: 'Inter', data: inter, weight: 600, style: 'normal' },
  ]);
  return fontsPromise;
}

// Still 1024x1024, but recompressed: 224 KB -> 90 KB (issue #90). The
// original was written with weak PNG compression; the pixels are
// unchanged bar an alpha-premultiply round-trip whose worst error, once
// composited on the card's #0a0a0a ground, is 19/255 on isolated edge
// subpixels (mean 0.14). Regenerate with:
//
//   sharp(src).png({ compressionLevel: 9, effort: 10 })
//
// Downscaling was tried and rejected: a 512px seal saves 45 KB here but
// makes projectCard's 700px watermark an UPSCALE, and the extra
// interpolation costs more PNG entropy in the emitted card (+6%) than
// the source ever saved. Palette quantisation is worse still — 256
// colours encodes LARGER than RGBA, and 128 bands the gold ramp.
//
// PNG, not WebP: satori cannot decode WebP and throws "a is not
// iterable", so a format change here silently blanks every card.
let monogramPromise;
export function monogramDataUri() {
  monogramPromise ??= readFile(
    path.join(process.cwd(), 'src/lib/og/assets/monogram.png'),
  ).then((buf) => `data:image/png;base64,${buf.toString('base64')}`);
  return monogramPromise;
}
