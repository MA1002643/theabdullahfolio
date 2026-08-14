// Where did the model INVENT geometry, and where is its water safe to use?
//
// The clip was withdrawn once already on the finding that invented structure
// "covered most of the near-field water". That verdict decided the whole tier,
// so it is worth re-deriving rather than inheriting: the distinction that
// matters is not "did pixels change" (water pixels are SUPPOSED to change) but
// "did a hard EDGE appear where the plate has none". Invented lanterns and
// pillars are edges. Ripples are not.
//
// So, per pixel, over N sampled frames:
//   motion    — temporal std. High is good in water, damning on stone.
//   ghosting  — how much gradient ENERGY the frame carries that the plate does
//               not, at the same place. A duplicated pillar shows here; a
//               rippling reflection barely does, because a reflection's edges
//               are soft and the plate has soft edges there too.
//
// Reported per region so the mask can be cut on evidence.
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
// FFMPEG= overrides the bundled binary, as scripts/scene/README.md promises.
const ffmpeg = process.env.FFMPEG ?? ffmpegStatic;
import { WORK } from './workdir.mjs';

const RAW =
  process.argv[2] ||
  `${WORK}/causeway-raw.mp4`;
const SP =
  WORK;
const DIR = `${SP}/ghost`;

const W = 960;
const H = 540;
const N = 16;

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
execFileSync(ffmpeg, [
  '-hide_banner', '-loglevel', 'error',
  '-i', RAW,
  '-vf', `fps=${N / 5},scale=${W}:${H}`,
  '-frames:v', String(N),
  `${DIR}/f%03d.png`,
]);
const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
console.log(`frames: ${files.length} at ${W}x${H}`);

const gray = async (buf) => {
  const { data } = await sharp(buf).grayscale().raw().toBuffer({ resolveWithObject: true });
  return data;
};

// The plate the clip started from, at the same size.
const plate = await gray(
  await sharp(process.argv[3] || 'assets/source/home-hero-src.webp').resize(W, H, { fit: 'cover' }).png().toBuffer(),
);

const frames = [];
for (const f of files) frames.push(await gray(`${DIR}/${f}`));

// Sobel-ish gradient magnitude.
const grad = (g) => {
  const out = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y += 1) {
    for (let x = 1; x < W - 1; x += 1) {
      const i = y * W + x;
      const gx = g[i - 1] - g[i + 1];
      const gy = g[i - W] - g[i + W];
      out[i] = Math.hypot(gx, gy);
    }
  }
  return out;
};

const gPlate = grad(plate);
const gFrames = frames.map(grad);

const motion = new Float32Array(W * H);
const ghost = new Float32Array(W * H);
for (let i = 0; i < W * H; i += 1) {
  let m = 0;
  let m2 = 0;
  let gh = 0;
  for (let k = 0; k < frames.length; k += 1) {
    const v = frames[k][i];
    m += v;
    m2 += v * v;
    // Gradient energy this frame has that the plate does not, at this pixel.
    gh += Math.max(0, gFrames[k][i] - gPlate[i]);
  }
  const n = frames.length;
  motion[i] = Math.sqrt(Math.max(0, m2 / n - (m / n) ** 2));
  ghost[i] = gh / n;
}

// Regions in plate uv. `expect` is what the tier NEEDS to be true.
const REGIONS = [
  ['causeway stone (near)', 0.5, 0.9, 0.16, 0.08, 'rigid'],
  ['causeway stone (mid)', 0.5, 0.72, 0.1, 0.05, 'rigid'],
  ['near-left pillar', 0.176, 0.86, 0.035, 0.1, 'rigid'],
  ['near-right pillar', 0.831, 0.86, 0.035, 0.1, 'rigid'],
  ['near-left lantern', 0.18, 0.655, 0.03, 0.05, 'rigid'],
  ['near-right lantern', 0.83, 0.665, 0.03, 0.05, 'rigid'],
  ['post row left (2-3)', 0.4, 0.575, 0.05, 0.04, 'rigid'],
  ['post row right (2-3)', 0.64, 0.575, 0.05, 0.04, 'rigid'],
  ['trees left', 0.08, 0.2, 0.07, 0.12, 'rigid'],
  ['trees right', 0.93, 0.2, 0.06, 0.12, 'rigid'],
  ['sky', 0.5, 0.08, 0.15, 0.06, 'rigid'],
  ['WATER far-left open', 0.06, 0.62, 0.05, 0.06, 'water'],
  ['WATER far-right open', 0.95, 0.62, 0.04, 0.06, 'water'],
  ['WATER bottom-left', 0.07, 0.92, 0.06, 0.06, 'water'],
  ['WATER bottom-right', 0.94, 0.92, 0.05, 0.06, 'water'],
  ['WATER beside L pillar', 0.1, 0.8, 0.05, 0.06, 'water'],
  ['WATER beside R pillar', 0.9, 0.8, 0.05, 0.06, 'water'],
  ['WATER lantern reflection L', 0.18, 0.78, 0.03, 0.04, 'water'],
  ['WATER lantern reflection R', 0.83, 0.79, 0.03, 0.04, 'water'],
  ['WATER mist band', 0.3, 0.555, 0.08, 0.012, 'water'],
];

const stat = (arr, u, v, du, dv) => {
  const x0 = Math.max(1, Math.round((u - du) * W));
  const x1 = Math.min(W - 1, Math.round((u + du) * W));
  const y0 = Math.max(1, Math.round((v - dv) * H));
  const y1 = Math.min(H - 1, Math.round((v + dv) * H));
  let s = 0;
  let n = 0;
  let mx = 0;
  for (let y = y0; y < y1; y += 1)
    for (let x = x0; x < x1; x += 1) {
      const q = arr[y * W + x];
      s += q;
      if (q > mx) mx = q;
      n += 1;
    }
  return { mean: s / Math.max(1, n), max: mx };
};

const rows = REGIONS.map(([name, u, v, du, dv, expect]) => {
  const m = stat(motion, u, v, du, dv);
  const g = stat(ghost, u, v, du, dv);
  return {
    region: name,
    expect,
    motion: +m.mean.toFixed(2),
    motionMax: +m.max.toFixed(1),
    ghost: +g.mean.toFixed(2),
    ghostMax: +g.max.toFixed(1),
  };
});
console.table(rows);

// Ghost map as an image, so the invented structure can be SEEN and the mask cut
// against it rather than guessed.
const vis = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i += 1) {
  vis[i * 3] = Math.min(255, ghost[i] * 9); // red   = invented edges
  vis[i * 3 + 1] = Math.min(255, motion[i] * 7); // green = motion
  vis[i * 3 + 2] = 0;
}
await sharp(vis, { raw: { width: W, height: H, channels: 3 } })
  .png()
  .toFile(`${SP}/ghost-map.png`);
console.log('\nghost-map.png  RED = invented edges, GREEN = motion');
