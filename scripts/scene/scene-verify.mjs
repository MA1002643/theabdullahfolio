// Verify the shipped causeway loop: does the fire move, does everything else
// stay nailed down, and does the wrap read as a normal frame step?
//
//   node scripts/scene/scene-verify.mjs
//
// Three checks, because the failure modes are different and a single number
// hides all of them:
//   RIGIDITY — per-pixel temporal std by region. Stone and post housings must
//              measure ~0; water and flame windows must not.
//   SEAM     — the wrap-around step against the clip's own normal step, the
//              ratio test seam-check.mjs applies to the /projects loop.
//   EYE      — contact sheets of the flame windows, which is the only check
//              that can tell "burning" from "moving".
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
// FFMPEG= overrides the bundled binary, as scripts/scene/README.md promises.
const ffmpeg = process.env.FFMPEG ?? ffmpegStatic;
import { WORK } from './workdir.mjs';

const SP = WORK;
const RIG = await import(
  `data:text/javascript;base64,${Buffer.from(
    readFileSync('src/components/home/homeSceneLights.js', 'utf8'),
  ).toString('base64')}`
);
const { IW, IH, FIRE_BOX, fireBoxAlpha, flameSources, POST_KEEPOUTS } = RIG;

const W = 1920;
const H = 1080;
const DIR = `${SP}/verify`;
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const VIDEO = process.argv[2] || 'public/background/causeway-1080.mp4';
console.log(`verifying ${VIDEO}`);
execFileSync(ffmpeg, ['-v', 'error', '-i', VIDEO, '-vsync', '0', '-q:v', '1', `${DIR}/v%04d.png`]);
const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
console.log(`${files.length} frames of the shipped loop\n`);

const frames = [];
for (const f of files) frames.push(await sharp(`${DIR}/${f}`).removeAlpha().raw().toBuffer());
const lum = (b, i) => 0.2126 * b[i * 3] + 0.7152 * b[i * 3 + 1] + 0.0722 * b[i * 3 + 2];

// Flame windows, from the rig — the same geometry the bake cut.
const sources = flameSources();
const win = new Float32Array(W * H);
for (const s of sources) {
  const cx = s.u * W;
  const cy = s.v * H;
  const rx = (s.r / IW) * W;
  const ry = (s.r / IH) * H;
  const x0 = Math.max(0, Math.floor(cx - rx * (FIRE_BOX.half + FIRE_BOX.feather)));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx * (FIRE_BOX.half + FIRE_BOX.feather)));
  const y0 = Math.max(0, Math.floor(cy - ry * (FIRE_BOX.top + FIRE_BOX.feather)));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry * (FIRE_BOX.bottom + FIRE_BOX.feather)));
  for (let y = y0; y <= y1; y += 1)
    for (let x = x0; x <= x1; x += 1) {
      const a = fireBoxAlpha((x + 0.5 - cx) / rx, (cy - y - 0.5) / ry);
      if (a > win[y * W + x]) win[y * W + x] = a;
    }
}

// ── 1. rigidity by region ───────────────────────────────────────────────────
// Regions in u,v so they survive the working size. "post housing" is a keep-out
// rectangle MINUS the flame window inside it — the whole point of the change is
// that one moves and the other does not.
const REGIONS = {
  'sky / trees': [0.05, 0.1, 0.95, 0.35],
  'causeway stone': [0.44, 0.72, 0.56, 0.95],
  'open water L': [0.05, 0.62, 0.25, 0.9],
  'open water R': [0.75, 0.62, 0.95, 0.9],
  'post housing L': [POST_KEEPOUTS[0].u0, 0.58, POST_KEEPOUTS[0].u1, 0.9],
  'post housing R': [POST_KEEPOUTS[1].u0, 0.58, POST_KEEPOUTS[1].u1, 0.9],
};
const stdIn = (u0, v0, u1, v1, mode) => {
  let s = 0;
  let n = 0;
  for (let y = Math.round(v0 * H); y < Math.round(v1 * H); y += 1)
    for (let x = Math.round(u0 * W); x < Math.round(u1 * W); x += 1) {
      const i = y * W + x;
      const inWin = win[i] > 0.02;
      if (mode === 'flame' && !inWin) continue;
      if (mode === 'nonflame' && inWin) continue;
      let m = 0;
      for (const fr of frames) m += lum(fr, i);
      m /= frames.length;
      let v = 0;
      for (const fr of frames) v += (lum(fr, i) - m) ** 2;
      s += Math.sqrt(v / frames.length);
      n += 1;
    }
  return n ? s / n : NaN;
};

console.log('region                temporal std');
for (const [name, r] of Object.entries(REGIONS)) {
  console.log(`  ${name.padEnd(20)} ${stdIn(...r, 'nonflame').toFixed(2)}`);
}
for (let k = 0; k < 2; k += 1) {
  const s = sources[k];
  const rx = (s.r / IW) * W;
  const ry = (s.r / IH) * H;
  const box = [
    (s.u * W - rx * 1.2) / W,
    (s.v * H - ry * 1.4) / H,
    (s.u * W + rx * 1.2) / W,
    (s.v * H + ry * 1.2) / H,
  ];
  console.log(`  ${`flame ${s.i} (window)`.padEnd(20)} ${stdIn(...box, 'flame').toFixed(2)}`);
}

// ── 2. the seam ─────────────────────────────────────────────────────────────
const step = (a, b, mode) => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < W * H; i += 1) {
    const inWin = win[i] > 0.02;
    if (mode === 'flame' && !inWin) continue;
    if (mode === 'all' && false) continue;
    s += (lum(frames[a], i) - lum(frames[b], i)) ** 2;
    n += 1;
  }
  return Math.sqrt(s / n);
};
for (const mode of ['all', 'flame']) {
  const normal = [];
  for (let i = 1; i < frames.length; i += 1) normal.push(step(i - 1, i, mode));
  const wrap = step(frames.length - 1, 0, mode);
  const mean = normal.reduce((a, b) => a + b, 0) / normal.length;
  console.log(
    `\nseam (${mode}): wrap ${wrap.toFixed(2)} vs normal step mean ${mean.toFixed(2)} ` +
      `max ${Math.max(...normal).toFixed(2)}  -> ${(wrap / Math.max(...normal)).toFixed(2)}x max`,
  );
}

// ── 3. the eye ──────────────────────────────────────────────────────────────
for (const s of sources.slice(0, 3)) {
  const rx = (s.r / IW) * W;
  const ry = (s.r / IH) * H;
  const b = {
    left: Math.round(s.u * W - rx * 1.9),
    top: Math.round(s.v * H - ry * 2.0),
    width: Math.round(rx * 3.8),
    height: Math.round(ry * 3.4),
  };
  const zoom = Math.max(2, Math.round(130 / b.width));
  const tiles = [];
  for (let i = 0; i < frames.length; i += 6)
    tiles.push(
      await sharp(frames[i], { raw: { width: W, height: H, channels: 3 } })
        .extract(b)
        .resize(b.width * zoom, b.height * zoom, { kernel: 'nearest' })
        .png()
        .toBuffer(),
    );
  const tw = b.width * zoom;
  const th = b.height * zoom;
  await sharp({
    create: { width: tw * tiles.length, height: th, channels: 3, background: '#0b0f14' },
  })
    .composite(tiles.map((input, k) => ({ input, left: k * tw, top: 0 })))
    .png()
    .toFile(`${SP}/out-flame-${s.i}.png`);
  console.log(`out-flame-${s.i}.png (${tiles.length} tiles, every 6th frame)`);
}

// The seam itself, as pictures: the last frames of the loop then the first,
// so a jump at the wrap is visible rather than merely scored.
{
  const s = sources[0];
  const rx = (s.r / IW) * W;
  const ry = (s.r / IH) * H;
  const b = {
    left: Math.round(s.u * W - rx * 1.9),
    top: Math.round(s.v * H - ry * 2.0),
    width: Math.round(rx * 3.8),
    height: Math.round(ry * 3.4),
  };
  const order = [90, 92, 94, 95, 0, 1, 2, 4].filter((i) => i < frames.length);
  const tiles = [];
  for (const i of order)
    tiles.push(
      await sharp(frames[i], { raw: { width: W, height: H, channels: 3 } })
        .extract(b)
        .resize(b.width * 3, b.height * 3, { kernel: 'nearest' })
        .png()
        .toBuffer(),
    );
  await sharp({
    create: { width: b.width * 3 * tiles.length, height: b.height * 3, channels: 3, background: '#0b0f14' },
  })
    .composite(tiles.map((input, k) => ({ input, left: k * b.width * 3, top: 0 })))
    .png()
    .toFile(`${SP}/out-seam.png`);
  console.log(`out-seam.png — frames ${order.join(',')} across the wrap`);
}
