// Find every candle flame in the workshop plate, then keep only the ones
// standing on a table. Writes flames.json plus a debug overlay to eyeball
// before a single frame is re-encoded.
//
// Flames are isolated by their hot core (a near-white blob well above the
// creamy candle bodies around them), grown back out to the full teardrop,
// then filtered on shape — a flame is taller than it is wide.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const SRC = process.argv[2];
const OUT = process.argv[3];

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const ch = info.channels;
const lum = new Float32Array(W * H);
for (let i = 0, p = 0; i < W * H; i++, p += ch) {
  lum[i] = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
}

// Regions that are TABLE TOPS, in normalised plate coords. Everything hanging
// from the canopy — the crystal chandelier and every lantern on a chain — is
// outside these and is left exactly as filmed, per the brief.
// The centre band matters most: a portrait phone is height-bound by
// object-cover, so it shows only u ∈ [0.37, 0.63] of this 16:9 plate — the
// left and right tables are cropped off the screen entirely and the centre
// table IS the mobile scene. Its lower edge stops at 0.665 to leave the
// floor pots under the bench alone; they are not table candles.
const TABLES = [
  { name: 'left', x0: 0.02, x1: 0.44, y0: 0.40, y1: 0.78 },
  { name: 'centre', x0: 0.46, x1: 0.74, y0: 0.40, y1: 0.665 },
  { name: 'right', x0: 0.76, x1: 1.0, y0: 0.40, y1: 0.84 },
];
const inTable = (x, y) => {
  const u = x / W;
  const v = y / H;
  return TABLES.find((t) => u >= t.x0 && u <= t.x1 && v >= t.y0 && v <= t.y1);
};

// Hot cores. Measured on the plate: flame peaks reach only ~240-245 while lit
// wax already sits at 230+, so brightness alone cannot separate them — the
// ring test further down does the real work. Wax bodies also flood-fill into
// single huge blobs, which the area cap then discards.
const CORE = Number(process.env.CORE || 232);
const seen = new Uint8Array(W * H);
const blobs = [];
const stack = new Int32Array(W * H);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i0 = y * W + x;
    if (seen[i0] || lum[i0] < CORE) continue;
    let sp = 0;
    stack[sp++] = i0;
    seen[i0] = 1;
    let minx = x;
    let maxx = x;
    let miny = y;
    let maxy = y;
    let n = 0;
    let sx = 0;
    let sy = 0;
    while (sp > 0) {
      const i = stack[--sp];
      const cx = i % W;
      const cy = (i / W) | 0;
      n++;
      sx += cx;
      sy += cy;
      if (cx < minx) minx = cx;
      if (cx > maxx) maxx = cx;
      if (cy < miny) miny = cy;
      if (cy > maxy) maxy = cy;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (!seen[ni] && lum[ni] >= CORE) {
            seen[ni] = 1;
            stack[sp++] = ni;
          }
        }
      }
    }
    blobs.push({ n, cx: sx / n, cy: sy / n, minx, maxx, miny, maxy });
  }
}

// A flame core: big enough not to be a sparkle, small enough not to be a
// window of glare, and at least as tall as it is wide.
const MIN_CORE = 10;
const MAX_CORE = 2600;

// Mean luminance on a ring just outside the blob. A flame stands in open air,
// so its surroundings are much darker than it; a patch of lit wax is embedded
// in more lit wax and barely differs from its ring. This is the test that
// actually tells the two apart.
const ringMean = (b) => {
  const w = b.maxx - b.minx + 1;
  const h = b.maxy - b.miny + 1;
  const pad = Math.max(4, Math.round(Math.max(w, h) * 0.6));
  let s = 0;
  let n = 0;
  for (let y = b.miny - pad; y <= b.maxy + pad; y++) {
    for (let x = b.minx - pad; x <= b.maxx + pad; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const insideBox = x >= b.minx && x <= b.maxx && y >= b.miny && y <= b.maxy;
      if (insideBox) continue;
      s += lum[y * W + x];
      n++;
    }
  }
  return n ? s / n : 255;
};

const flames = [];
for (const b of blobs) {
  if (b.n < MIN_CORE || b.n > MAX_CORE) continue;
  const w = b.maxx - b.minx + 1;
  const h = b.maxy - b.miny + 1;
  if (h < w * 0.9) continue; // flames are upright teardrops, not smears
  if (w > 90) continue;
  // Peak inside the blob vs its surroundings.
  let peak = 0;
  for (let y = b.miny; y <= b.maxy; y++)
    for (let x = b.minx; x <= b.maxx; x++) {
      const l = lum[y * W + x];
      if (l > peak) peak = l;
    }
  const ring = ringMean(b);
  if (peak - ring < Number(process.env.CONTRAST || 55)) continue;
  const t = inTable(b.cx, b.cy);
  flames.push({
    x: +b.cx.toFixed(1),
    y: +b.cy.toFixed(1),
    w,
    h,
    area: b.n,
    table: t ? t.name : null,
  });
}

const kept = flames.filter((f) => f.table);
const dropped = flames.filter((f) => !f.table);

// Debug overlay: green = will be animated, red = left as filmed.
const rects = [];
const box = (f, colour) => {
  const pad = Math.max(6, Math.round(Math.max(f.w, f.h) * 0.9));
  const x = Math.max(0, Math.round(f.x - f.w / 2 - pad));
  const y = Math.max(0, Math.round(f.y - f.h / 2 - pad * 1.6));
  const w = Math.min(W - x, f.w + pad * 2);
  const h = Math.min(H - y, f.h + pad * 2.6);
  rects.push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${colour}" stroke-width="3"/>`,
  );
};
kept.forEach((f) => box(f, '#00ff66'));
dropped.forEach((f) => box(f, '#ff2222'));
const tbl = TABLES.map(
  (t) =>
    `<rect x="${t.x0 * W}" y="${t.y0 * H}" width="${(t.x1 - t.x0) * W}" height="${(t.y1 - t.y0) * H}" fill="none" stroke="#3399ff" stroke-width="4" stroke-dasharray="18 12"/>`,
).join('');
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${tbl}${rects.join('')}</svg>`;
// Composite at full size FIRST — sharp resizes before it composites, so an
// overlay built in plate coords has to land before any downscale.
const overlaid = await sharp(SRC)
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png()
  .toBuffer();
await sharp(overlaid).resize(1600).png().toFile(OUT);

writeFileSync(
  OUT.replace(/\.png$/, '.json'),
  JSON.stringify({ W, H, kept, dropped }, null, 1),
);
console.log(
  JSON.stringify({
    totalBlobs: blobs.length,
    flameCandidates: flames.length,
    keptOnTables: kept.length,
    droppedHanging: dropped.length,
    byTable: TABLES.map((t) => `${t.name}:${kept.filter((f) => f.table === t.name).length}`).join(' '),
    sizePx: `median h ${kept.map((f) => f.h).sort((a, b) => a - b)[Math.floor(kept.length / 2)]}`,
  }),
);
