// What the homepage hero actually LOOKS LIKE at a given viewport, computed
// rather than eyeballed: the plate's object-cover crop, the 1.045 overscan, the
// plate's own 0.9 opacity over the page background, and all four .home-scrim
// gradient layers composited in CSS paint order.
//
//   node scripts/scene/hero-crop-audit.mjs
//
// The question it answers: the scrim was art-directed against a landscape crop.
// A portrait phone shows a completely different slice of the same photograph,
// so "is mobile brighter?" is really "is the slice brighter, and is the scrim
// still darkening the right parts of it?"
import sharp from 'sharp';
import { WORK } from './workdir.mjs';

const IW = 2560;
const IH = 1440;
const OVERSCAN = 1.045; // .home-backdrop transform: scale(1.045)
const PLATE_OPACITY = 0.9; // the <Image> is painted at opacity-90
const PAGE_BG = [27, 27, 27]; // --background: 27 27 27

const plate = await sharp('public/background/home-hero.webp')
  .removeAlpha()
  .raw()
  .toBuffer();

const smoothstepless = (t) => Math.min(1, Math.max(0, t));

// A CSS radial-gradient(ellipse RX% RY% at CX% CY%, stops) evaluated at a point.
// Stop offsets are fractions of the NORMALISED elliptical distance, which is 1
// on the ellipse itself — so a stop at 80% sits at 0.8 of the way out.
const radial = (u, v, rx, ry, cx, cy, stops) => {
  const d = Math.hypot((u - cx) / rx, (v - cy) / ry);
  if (d <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i += 1) {
    if (d <= stops[i][0]) {
      const t = (d - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return stops[i - 1][1] + (stops[i][1] - stops[i - 1][1]) * t;
    }
  }
  return stops[stops.length - 1][1];
};

const linearV = (v, stops) => {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i += 1) {
    if (v <= stops[i][0]) {
      const t = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return stops[i - 1][1] + (stops[i][1] - stops[i - 1][1]) * t;
    }
  }
  return stops[stops.length - 1][1];
};

// .home-scrim, in CSS order. The FIRST background layer is the TOPMOST, so for
// source-over compositing they are applied bottom-up: linear, vignette, well,
// headline.
const scrimAlpha = (u, v) => {
  const headline = radial(u, v, 0.32, 0.15, 0.5, 0.16, [
    [0, 0.6],
    [0.55, 0.34],
    [1, 0],
  ]);
  const well = radial(u, v, 0.37, 0.21, 0.5, 0.62, [
    [0, 0.46],
    [0.48, 0.3],
    [0.78, 0.1],
    [1, 0],
  ]);
  const vignette = radial(u, v, 0.41, 0.39, 0.5, 0.5, [
    [0.55, 0],
    [0.8, 0.28],
    [1, 0.55],
  ]);
  const base = linearV(v, [
    [0, 0.52],
    [0.22, 0.4],
    [0.46, 0.26],
    [0.72, 0.34],
    [1, 0.6],
  ]);
  // Stacked black at each alpha: 1 - product of (1 - a).
  return [base, vignette, well, headline];
};

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Render one viewport. `visH` is what the user can actually SEE; `layoutH` is
// what the layers are SIZED to. On iOS Safari these differ, because the hero
// shell is `h-screen` (100vh = the LARGE viewport, toolbar hidden) while a
// non-scrolling page keeps the toolbar expanded — so the bottom of the box,
// and the darkest end of the base gradient, sit permanently off-screen.
const render = (label, vw, layoutH, visH = layoutH) => {
  const SW = 240;
  const SH = Math.round((SW * visH) / vw);
  const s = Math.max(vw / IW, layoutH / IH) * OVERSCAN;
  const pw = IW * s;
  const ph = IH * s;
  const ox = (vw - pw) / 2;
  const oy = (layoutH - ph) / 2;

  const vals = [];
  for (let sy = 0; sy < SH; sy += 1)
    for (let sx = 0; sx < SW; sx += 1) {
      const px = ((sx + 0.5) / SW) * vw;
      const py = ((sy + 0.5) / SH) * visH; // top-anchored: we see the TOP of the box
      const ix = Math.round((px - ox) / s);
      const iy = Math.round((py - oy) / s);
      const cx = Math.min(IW - 1, Math.max(0, ix));
      const cy = Math.min(IH - 1, Math.max(0, iy));
      const o = (cy * IW + cx) * 3;
      let rgb = [plate[o], plate[o + 1], plate[o + 2]];
      // plate at opacity .9 over the page background
      rgb = rgb.map((c, k) => c * PLATE_OPACITY + PAGE_BG[k] * (1 - PLATE_OPACITY));
      // scrim: layer coordinates are fractions of the ELEMENT box (vw x layoutH)
      for (const a of scrimAlpha(px / vw, py / layoutH)) rgb = rgb.map((c) => c * (1 - a));
      vals.push(lum(rgb[0], rgb[1], rgb[2]));
    }
  vals.sort((a, b) => a - b);
  const p = (q) => vals[Math.floor(q * (vals.length - 1))];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  // Visible fraction of the photograph's WIDTH — the crop story in one number.
  const visibleWidthFrac = Math.min(1, vw / pw);
  return { label, mean, sd, p10: p(0.1), p50: p(0.5), p90: p(0.9), visibleWidthFrac };
};

const rows = [
  render('desktop 1440x900', 1440, 900),
  render('laptop 1280x800', 1280, 800),
  render('tablet 834x1112 (portrait)', 834, 1112),
  render('iPhone 16 Pro Max 440x956 (layers 956, sees 956)', 440, 956),
  render('iPhone 16 Pro Max 440x956 (toolbar expanded, sees ~866)', 440, 956, 866),
  render('iPhone 15/16 390x844 (toolbar expanded, sees ~762)', 390, 844, 762),
  render('Android 360x800 (toolbar expanded, sees ~730)', 360, 800, 730),
  render('iPhone 16 Pro Max landscape 956x440', 956, 440),
];

console.log(
  'viewport'.padEnd(52) +
    'mean'.padStart(7) +
    'sd'.padStart(7) +
    'p10'.padStart(7) +
    'p50'.padStart(7) +
    'p90'.padStart(7) +
    '  photo width visible',
);
for (const r of rows) {
  console.log(
    r.label.padEnd(52) +
      r.mean.toFixed(1).padStart(7) +
      r.sd.toFixed(1).padStart(7) +
      r.p10.toFixed(1).padStart(7) +
      r.p50.toFixed(1).padStart(7) +
      r.p90.toFixed(1).padStart(7) +
      `      ${(100 * r.visibleWidthFrac).toFixed(0)}%`,
  );
}

const d = rows[0];
console.log('\nvs desktop 1440x900:');
for (const r of rows.slice(1)) {
  console.log(
    `  ${r.label.padEnd(50)} mean ${(((r.mean - d.mean) / d.mean) * 100 >= 0 ? '+' : '')}` +
      `${(((r.mean - d.mean) / d.mean) * 100).toFixed(1)}%   contrast(sd) ` +
      `${(((r.sd - d.sd) / d.sd) * 100 >= 0 ? '+' : '')}${(((r.sd - d.sd) / d.sd) * 100).toFixed(1)}%`,
  );
}

// ── Pictures, not just numbers ──────────────────────────────────────────────
// Renders the composited hero at two viewports plus the scrim's own alpha, so
// WHERE the darkness lands is visible rather than inferred.
const renderPng = async (file, vw, layoutH, visH = layoutH, alphaOnly = false) => {
  const SW = 420;
  const SH = Math.round((SW * visH) / vw);
  const s = Math.max(vw / IW, layoutH / IH) * OVERSCAN;
  const pw = IW * s;
  const ph = IH * s;
  const ox = (vw - pw) / 2;
  const oy = (layoutH - ph) / 2;
  const buf = Buffer.alloc(SW * SH * 3);
  for (let sy = 0; sy < SH; sy += 1)
    for (let sx = 0; sx < SW; sx += 1) {
      const px = ((sx + 0.5) / SW) * vw;
      const py = ((sy + 0.5) / SH) * visH;
      const ix = Math.min(IW - 1, Math.max(0, Math.round((px - ox) / s)));
      const iy = Math.min(IH - 1, Math.max(0, Math.round((py - oy) / s)));
      const o = (iy * IW + ix) * 3;
      let rgb = alphaOnly
        ? [255, 255, 255]
        : [plate[o], plate[o + 1], plate[o + 2]].map(
            (c, k) => c * PLATE_OPACITY + PAGE_BG[k] * (1 - PLATE_OPACITY),
          );
      for (const a of scrimAlpha(px / vw, py / layoutH)) rgb = rgb.map((c) => c * (1 - a));
      const d = (sy * SW + sx) * 3;
      buf[d] = rgb[0];
      buf[d + 1] = rgb[1];
      buf[d + 2] = rgb[2];
    }
  await sharp(buf, { raw: { width: SW, height: SH, channels: 3 } }).png().toFile(file);
  return { SW, SH };
};

const SP = WORK;
await renderPng(`${SP}/hero-desktop.png`, 1440, 900);
await renderPng(`${SP}/hero-mobile.png`, 440, 956, 866);
await renderPng(`${SP}/scrim-desktop.png`, 1440, 900, 900, true);
await renderPng(`${SP}/scrim-mobile.png`, 440, 956, 866, true);
console.log('\nwrote hero-desktop.png / hero-mobile.png / scrim-desktop.png / scrim-mobile.png');

// Dynamic range is the "flatness" number: sd rises on mobile, which sounds like
// MORE contrast, but the shadows lift far more than the highlights do.
console.log('\ndynamic range (p90 / p10) — higher is deeper:');
for (const r of rows) console.log(`  ${r.label.padEnd(52)} ${(r.p90 / r.p10).toFixed(1)}`);
