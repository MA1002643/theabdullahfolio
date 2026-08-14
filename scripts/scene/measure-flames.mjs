// Measure each lantern's FLAME BOX, and the GLASS that contains it, off the
// shipped plate.
//
// The rig stores one scalar `r` per source (the detected core radius). The
// plate's flames are not round — they are tall tongues — so a single radius can
// neither place nor size a flame warp. Two boxes are wanted per source:
//
//   flame — the flame body, which needs a tighter test than "warm and bright":
//           the glass housing AND the burner plate under the flame are both lit
//           warm, and a loose threshold swallows both (a first pass returned
//           141x165 for a flame the eye reads as roughly 40x77). A sweep showed
//           the box plateauing at minR=250/minG=205, which is the flame itself.
//           The burner is then shed by contiguity: walk out from the hottest row
//           and stop at the first run of empty rows, so the detached blob below
//           the flame cannot extend the box.
//
//   glass — the lit housing interior at a LOOSE threshold, which is the region a
//           flame warp is allowed to touch. A warp that reached past this would
//           smear the metal frame, the one artefact that would give it away.
import sharp from 'sharp';

const IW = 2560;
const IH = 1440;

const SOURCES = [
  ['lantern', 0.8303, 0.6604, 42],
  ['lantern', 0.1803, 0.6491, 42],
  ['post', 0.6689, 0.5882, 20],
  ['post', 0.3789, 0.581, 18],
  ['post', 0.6101, 0.5597, 12],
  ['post', 0.4241, 0.553, 10],
  ['post', 0.5926, 0.5459, 10],
  ['post', 0.5805, 0.5417, 8],
  ['post', 0.4465, 0.5403, 8],
  ['post', 0.5691, 0.5351, 8],
  ['post', 0.4591, 0.5326, 8],
  ['post', 0.5611, 0.5289, 6],
  ['post', 0.4695, 0.525, 6],
];

const { data, info } = await sharp('public/background/home-hero.webp')
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const CH = info.channels;
const px = (x, y) => {
  const i = (y * info.width + x) * CH;
  return [data[i], data[i + 1], data[i + 2]];
};

const FLAME_R = 250;
const FLAME_G = 205;
const GLASS_R = 190;
const GLASS_G = 110;

// Per-row extent of pixels passing a test, within a window.
const rowScan = (cx, cy, win, winY, minR, minG, minWarm) => {
  const rows = new Map();
  for (let y = Math.max(0, cy - winY); y <= Math.min(IH - 1, cy + winY); y += 1) {
    let lo = 1e9;
    let hi = -1e9;
    let n = 0;
    for (let x = Math.max(0, cx - win); x <= Math.min(IW - 1, cx + win); x += 1) {
      const [R, G, B] = px(x, y);
      if (R < minR || G < minG || R - B < minWarm) continue;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
      n += 1;
    }
    if (n) rows.set(y, { lo, hi, n });
  }
  return rows;
};

// Contiguous run of occupied rows around the hottest one. `gap` empty rows in a
// row terminate it — this is what separates the flame from the burner plate.
const contiguous = (rows, seedY, gap) => {
  if (!rows.size) return null;
  let best = seedY;
  let bestN = -1;
  for (const [y, r] of rows) {
    if (Math.abs(y - seedY) <= 24 && r.n > bestN) {
      bestN = r.n;
      best = y;
    }
  }
  let top = best;
  for (let y = best, miss = 0; y >= best - 200; y -= 1) {
    if (rows.has(y)) {
      top = y;
      miss = 0;
    } else if (++miss > gap) break;
  }
  let bot = best;
  for (let y = best, miss = 0; y <= best + 200; y += 1) {
    if (rows.has(y)) {
      bot = y;
      miss = 0;
    } else if (++miss > gap) break;
  }
  let lo = 1e9;
  let hi = -1e9;
  for (let y = top; y <= bot; y += 1) {
    const r = rows.get(y);
    if (!r) continue;
    if (r.lo < lo) lo = r.lo;
    if (r.hi > hi) hi = r.hi;
  }
  return { top, bot, lo, hi };
};

console.log(`plate ${info.width}x${info.height}\n`);

const out = [];
for (const [k, u, v, r] of SOURCES) {
  const cx = Math.round(u * IW);
  const cy = Math.round(v * IH);
  const fRows = rowScan(cx, cy, Math.round(r * 2.2), Math.round(r * 3.2), FLAME_R, FLAME_G, 90);
  const f = contiguous(fRows, cy, 2);
  const gRows = rowScan(cx, cy, Math.round(r * 3.0), Math.round(r * 3.6), GLASS_R, GLASS_G, 55);
  const g = contiguous(gRows, cy, 3);
  if (!f || !g) {
    out.push({ k, u, v, r, note: 'not resolvable' });
    continue;
  }
  out.push({
    k,
    u,
    v,
    r,
    // FLAME, as offsets from the stored centre in units of r — this is the form
    // the drawing code wants, so one rule can serve every source.
    fHalfR: +(((f.hi - f.lo + 1) / 2 / r).toFixed(2)),
    fTipR: +(((f.top - cy) / r).toFixed(2)),
    fBaseR: +(((f.bot + 1 - cy) / r).toFixed(2)),
    fDxR: +((((f.lo + f.hi) / 2 - cx) / r).toFixed(2)),
    fAspect: +(((f.bot - f.top + 1) / (f.hi - f.lo + 1)).toFixed(2)),
    // GLASS clip, same units.
    gHalfR: +(((g.hi - g.lo + 1) / 2 / r).toFixed(2)),
    gTopR: +(((g.top - cy) / r).toFixed(2)),
    gBotR: +(((g.bot + 1 - cy) / r).toFixed(2)),
  });
}
console.table(out);

const good = out.filter((o) => !o.note && o.r >= 10);
const avg = (key) => +(good.reduce((s, o) => s + o[key], 0) / good.length).toFixed(3);
console.log('\nMEANS over resolvable sources (r >= 10), in units of r:');
console.log({
  fHalfR: avg('fHalfR'),
  fTipR: avg('fTipR'),
  fBaseR: avg('fBaseR'),
  fAspect: avg('fAspect'),
  gHalfR: avg('gHalfR'),
  gTopR: avg('gTopR'),
  gBotR: avg('gBotR'),
});
