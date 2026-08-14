// Region-by-region motion audit of the running hero.
//
// The question "is the water moving" cannot be answered by looking at one
// screenshot, and answering it by eye across three is exactly the kind of
// judgement that has already been wrong twice here. So: sample the same boxes
// across successive frames and report mean absolute change per region, next to
// the regions that MUST NOT move (the causeway stone, the lantern housings) as
// a control.
import sharp from 'sharp';
import { WORK } from './workdir.mjs';

const SD =
  WORK;
const FRAMES = ['f1.png', 'f2.png', 'f3.png'];

const IW = 2560;
const IH = 1440;

const load = async (f) => {
  const { data, info } = await sharp(`${SD}/${f}`).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  return { data, w: info.width, h: info.height, ch: info.channels };
};

const imgs = [];
for (const f of FRAMES) imgs.push(await load(f));
const { w: CW, h: CH } = imgs[0];
console.log(`frames ${CW}x${CH}\n`);

// The same cover projection the layers use.
const scale = Math.max(CW / IW, CH / IH);
const ox = (CW - IW * scale) / 2;
const oy = (CH - IH * scale) / 2;
const sx = (u) => Math.round(ox + u * IW * scale);
const sy = (v) => Math.round(oy + v * IH * scale);

// name, u, v, half-width px, half-height px, expectation
//
// Every box here is sited AWAY from the orbiting nav ring and the floating
// laptop. The first version of this audit was not, and it reported the water
// churning at mean 46 / peak 247 — which turned out to be the clock icon
// sweeping through the sample box, not the lake. Motion measured over a region
// containing animated UI tells you nothing about the layer under it.
const REGIONS = [
  ['WATER mid-left', 0.066, 0.606, 55, 40, 'move'],
  ['WATER mid-right', 0.952, 0.606, 45, 40, 'move'],
  ['WATER bottom-left', 0.079, 0.918, 70, 45, 'move'],
  ['WATER bottom-right', 0.926, 0.918, 60, 45, 'move'],
  ['WATER beside causeway', 0.165, 0.812, 55, 40, 'move'],
  ['WATER near horizon', 0.132, 0.553, 60, 14, 'move'],
  ['FLAME near-right', 0.8303, 0.6604, 14, 26, 'move'],
  ['FLAME near-left', 0.1803, 0.6491, 14, 26, 'move'],
  ['FLAME post-r2', 0.6689, 0.5882, 7, 13, 'move'],
  ['FLAME post-l2', 0.3789, 0.581, 7, 13, 'move'],
  ['CTRL causeway stone', 0.284, 0.967, 30, 15, 'FROZEN'],
  ['CTRL right pillar', 0.8366, 0.929, 26, 30, 'FROZEN'],
  ['CTRL sky', 0.5, 0.10, 80, 40, 'FROZEN'],
  ['CTRL trees left', 0.08, 0.20, 60, 40, 'FROZEN'],
  ['UI clock icon', 0.774, 0.653, 30, 30, '(ui, moves)'],
];

const patch = (img, cx, cy, hw, hh) => {
  const out = [];
  for (let y = Math.max(0, cy - hh); y < Math.min(img.h, cy + hh); y += 1) {
    for (let x = Math.max(0, cx - hw); x < Math.min(img.w, cx + hw); x += 1) {
      const i = (y * img.w + x) * img.ch;
      out.push(img.data[i], img.data[i + 1], img.data[i + 2]);
    }
  }
  return out;
};

const rows = [];
for (const [name, u, v, hw, hh, expect] of REGIONS) {
  const cx = sx(u);
  const cy = sy(v);
  const ps = imgs.map((im) => patch(im, cx, cy, hw, hh));
  let maxMean = 0;
  let maxPeak = 0;
  for (let a = 0; a < ps.length - 1; a += 1) {
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < ps[a].length; i += 1) {
      const d = Math.abs(ps[a][i] - ps[a + 1][i]);
      sum += d;
      if (d > peak) peak = d;
    }
    const mean = sum / ps[a].length;
    if (mean > maxMean) maxMean = mean;
    if (peak > maxPeak) maxPeak = peak;
  }
  // Mean luminance, so "it moved by 2" can be read against how bright it is.
  const lum = ps[0].reduce((s, x) => s + x, 0) / ps[0].length;
  rows.push({
    region: name,
    expect,
    meanDelta: +maxMean.toFixed(2),
    peakDelta: maxPeak,
    lum: +lum.toFixed(1),
    at: `${cx},${cy}`,
  });
}
console.table(rows);
