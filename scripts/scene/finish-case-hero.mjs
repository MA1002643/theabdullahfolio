// Turn a raw homepage recording into the case-study hero loop: find the
// orbit's own repeat, close the seam exactly, and export every shipped file
// (issue #31, owner 2026-11-21). Companion to record-case-hero.mjs.
//
//   node scripts/scene/finish-case-hero.mjs <recording.webm> [settleSeconds]
//
// Writes into public/projects/theabdullahfolio/: hero-loop.webm/.mp4
// (1600×1000), hero-loop-960.webm/.mp4, and hero.webp — the loop's FIRST
// frame, so the <video> fading in over the still reads as "the picture
// starts moving", never a swap. Intermediates go to SCRATCH (default
// .scene-work/case-hero).
//
// ── WHY THE LOOP IS ~40s, FOUND NOT ASSUMED ─────────────────────────────
// The ambient orbit turns at AUTO_DEG_PER_SEC = 9 (navigation/index.jsx)
// with eight DISTINCT buttons, so the ring's geometry repeats every 5s but
// the scene only truly repeats every 360/9 = 40s. Measured on the first
// take: the best full-cycle pair sat 39.96s apart at 76k SSD over the orbit
// band against a 14k adjacent-frame noise floor, while the best two-slot
// (10s) pair scored 413k — positions align at 10s, but the wrong icons
// occupy the pills, and a crossfade would visibly morph the glyphs. The
// matcher scores ONLY the orbit band (x 0.18–0.82, y 0.52–0.98): flames and
// mist are noise that no seam choice can align, and scoring them would
// drown the buttons, which are the one thing a viewer can catch jumping.
//
// ── WHY THE SEAM IS BLENDED HERE, NOT WITH xfade ────────────────────────
// close-loop.mjs's lesson, inherited wholesale: xfade's last in-range frame
// is still a blend of two moments, so the wrap lands on a frame that exists
// nowhere in the master — a once-per-cycle step the eye reads as "it's a
// repeating video". Blending in this process makes the endpoint exact by
// construction: with head = master[ts..ts+F) and body = master[ts+F..te),
// the final output frame IS master[ts+F-1] and frame 0 is master[ts+F] —
// consecutive master frames, a normal step. Its flat-QP x264 params ride
// along too (ipratio/pbratio 1.0, scenecut 0): without them the loop's
// first frame — always an IDR — is visibly cleaner than the P-frame before
// it, a periodic "refresh" with no content behind it. The VP9 rungs get one
// giant GOP (-g 9999) for the same reason: frame 0's keyframe is the only
// one, so nothing mid-loop pops back to clean.
import { spawnSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const [REC, settleArg] = process.argv.slice(2);
if (!REC) {
  console.error('usage: node scripts/scene/finish-case-hero.mjs <recording.webm> [settleSeconds]');
  process.exit(1);
}
const FF = process.env.FFMPEG ?? ffmpeg;
const SCRATCH = process.env.SCRATCH ?? '.scene-work/case-hero';
const OUT_DIR = 'public/projects/theabdullahfolio';
const SETTLE_S = Number(settleArg ?? 35); // skip loader + reveal + spin-up
const W = 1600;
const H = 1000;
const FPS = 25; // Playwright's screencast container rate
const CYCLE_S = 360 / 9; // one full orbit label cycle at AUTO_DEG_PER_SEC = 9
const FADE = 12; // ~0.5s; the matched pair leaves the blend almost nothing to hide
const X264_FLAT = 'ipratio=1.0:pbratio=1.0:scenecut=0:qcomp=0.8';

mkdirSync(SCRATCH, { recursive: true });
const run = (args, what) => {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${what} failed (${r.status})`);
};

// 1 ── Normalize the steady segment to a CFR master the frame maths can trust.
const master = path.join(SCRATCH, 'master.mp4');
run(
  ['-ss', String(SETTLE_S), '-i', REC, '-r', String(FPS), '-c:v', 'libx264', '-crf', '6',
   '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-an', '-y', master],
  'master normalize',
);

// 2 ── Find the loop pair on a grayscale thumbnail dump, orbit band only.
const AW = 160;
const AH = 100;
const grayRaw = path.join(SCRATCH, 'gray.raw');
run(
  ['-i', master, '-vf', `scale=${AW}:${AH},format=gray`, '-f', 'rawvideo', '-y', grayRaw],
  'analysis dump',
);
const buf = readFileSync(grayRaw);
const N = Math.floor(buf.length / (AW * AH));
const frame = (i) => buf.subarray(i * AW * AH, (i + 1) * AW * AH);
const X0 = Math.round(0.18 * AW);
const X1 = Math.round(0.82 * AW);
const Y0 = Math.round(0.52 * AH);
const Y1 = Math.round(0.98 * AH);
const diff = (a, b) => {
  let s = 0;
  for (let y = Y0; y < Y1; y++) {
    const row = y * AW;
    for (let x = X0; x < X1; x++) {
      const d = a[row + x] - b[row + x];
      s += d * d;
    }
  }
  return s;
};
let best = null;
for (let i0 = 3 * FPS; i0 <= 25 * FPS; i0 += FPS) {
  if (i0 < FADE) continue; // the seam needs F frames of lead-in before i0
  const ref = frame(i0);
  const lo = i0 + Math.round((CYCLE_S - 1.5) * FPS);
  const hi = i0 + Math.round((CYCLE_S + 1.5) * FPS);
  for (let i1 = lo; i1 <= hi && i1 < N; i1++) {
    const d = diff(ref, frame(i1));
    if (!best || d < best.d) best = { i0, i1, d };
  }
}
if (!best) throw new Error(`recording too short: ${N} frames after settle, need ~${CYCLE_S + 30}s`);
const floor = diff(frame(best.i0), frame(best.i0 + 1));
console.log(
  `loop: ${best.i0}..${best.i1} (${((best.i1 - best.i0) / FPS).toFixed(2)}s), ` +
    `band SSD ${Math.round(best.d / 1e3)}k vs noise floor ${Math.round(floor / 1e3)}k`,
);

// 3 ── Close the seam exactly (close-loop.mjs's construction, this geometry).
const TS = best.i0 - FADE;
const TE = best.i1;
const OFF = TE - TS - 2 * FADE;
const FRAME_BYTES = W * H * 3;
const closed = path.join(SCRATCH, 'loop-closed.mp4');

const dec = spawn(FF, [
  '-hide_banner', '-loglevel', 'error', '-i', master,
  '-vf', `select='between(n\\,${TS}\\,${TE - 1})'`, '-vsync', '0',
  '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
]);
const enc = spawn(FF, [
  '-hide_banner', '-loglevel', 'error',
  '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-an', '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'medium', '-crf', '10',
  '-x264-params', X264_FLAT, '-pix_fmt', 'yuv420p', '-y', closed,
]);
dec.stderr.on('data', (d) => process.stderr.write(d));
enc.stderr.on('data', (d) => process.stderr.write(d));
const encDone = new Promise((res, rej) => {
  enc.on('close', (c) => (c === 0 ? res() : rej(new Error(`seam encode ${c}`))));
  enc.on('error', rej);
});
const writeAsync = (chunk) =>
  new Promise((res, rej) => enc.stdin.write(chunk, (e) => (e ? rej(e) : res())));

await new Promise((resolve, reject) => {
  const head = [];
  const out = Buffer.alloc(FRAME_BYTES);
  const cur = Buffer.allocUnsafe(FRAME_BYTES);
  let filled = 0;
  let n = 0;
  let chain = Promise.resolve();
  dec.stdout.on('data', (chunk) => {
    let off = 0;
    while (off < chunk.length) {
      const take = Math.min(FRAME_BYTES - filled, chunk.length - off);
      chunk.copy(cur, filled, off, off + take);
      filled += take;
      off += take;
      if (filled === FRAME_BYTES) {
        const f = Buffer.from(cur);
        const i = n++;
        filled = 0;
        dec.stdout.pause();
        chain = chain
          .then(() => {
            if (i < FADE) {
              head.push(f);
              return undefined;
            }
            const b = i - FADE;
            if (b < OFF) return writeAsync(f);
            const k = b - OFF;
            if (k >= FADE) return undefined;
            const w = (k + 1) / FADE; // k = FADE-1 → pure head: exact wrap
            const hf = head[k];
            for (let o = 0; o < FRAME_BYTES; o++) out[o] = f[o] + (hf[o] - f[o]) * w;
            return writeAsync(Buffer.from(out));
          })
          .then(() => dec.stdout.resume())
          .catch(reject);
      }
    }
  });
  dec.on('close', (c) => chain.then(() => (c === 0 ? resolve() : reject(new Error(`decode ${c}`)))));
  dec.on('error', reject);
});
enc.stdin.end();
await encDone;

// 4 ── Shipped rungs. One file per painted-width rung (HeroSceneLoop picks in
// JS; <source media> is only honoured inside <picture>), webm + mp4 within.
const rung = (vf, webmOut, mp4Out, vpCrf, x264Crf) => {
  run(
    ['-i', closed, ...(vf ? ['-vf', vf] : []), '-c:v', 'libvpx-vp9', '-crf', String(vpCrf),
     '-b:v', '0', '-row-mt', '1', '-cpu-used', '2', '-g', '9999', '-pix_fmt', 'yuv420p',
     '-an', '-y', path.join(OUT_DIR, webmOut)],
    webmOut,
  );
  run(
    ['-i', closed, ...(vf ? ['-vf', vf] : []), '-c:v', 'libx264', '-crf', String(x264Crf),
     '-preset', 'slow', '-x264-params', X264_FLAT, '-pix_fmt', 'yuv420p',
     '-movflags', '+faststart', '-an', '-y', path.join(OUT_DIR, mp4Out)],
    mp4Out,
  );
};
rung(null, 'hero-loop.webm', 'hero-loop.mp4', 38, 24);
rung('scale=960:600', 'hero-loop-960.webm', 'hero-loop-960.mp4', 40, 25);

// 5 ── The still IS frame 0 of the loop (which is master[TS+FADE] = the
// matched i0), so the takeover cannot pop.
run(
  ['-i', closed, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '86', '-y',
   path.join(OUT_DIR, 'hero.webp')],
  'hero.webp',
);
console.log('done: hero-loop(.webm|.mp4), hero-loop-960(.webm|.mp4), hero.webp in', OUT_DIR);
