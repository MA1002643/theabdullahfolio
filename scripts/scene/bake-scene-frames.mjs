// Stamp the MA seal into every frame of the raw ambient clip, and flatten the
// model's exposure ramp, producing the "sealed master" that
// finish-projects-scene.sh then loop-closes.
//
//   node scripts/scene/bake-scene-frames.mjs <raw.mp4> <base-still.png> <out.mp4>
//
// ── WHY THE RUG IS A FIXED PLATE ────────────────────────────────────────
// Two things are true about every clip minimax returns for this scene:
//
//   1. The rug sigil is the single worst-drifting region in the frame. Over
//      12 s the rug region's mean luminance climbs +29 (hold-b) to +42
//      (hold-a) while the global frame climbs only +6 to +16. The model reads
//      any "already blazing" wording as an instruction to IGNITE, and the
//      sigil is where it spends most of that.
//   2. The sigil also MORPHS — the clean two-ring mark in the original
//      artwork becomes a multi-ring spiral, drifting its centre ~20px.
//
// Running the seal bake per frame would therefore have to remove a target
// that changes shape and brightness continuously, and any residue would
// itself ramp — visible as the seal's surroundings crawling over the loop.
//
// So the rug is composited ONCE, on the base still, and that finished region
// is stamped into every frame. Consequences, all of them wanted:
//   * the seal is pixel-identical in all frames, so it cannot crawl, flicker
//     or de-register;
//   * the loop seam has EXACTLY zero error inside the rug window, so the
//     search only has to match flames;
//   * the poster and the video's rug agree by construction, so the
//     still -> video handover cannot pop.
//
// The plate is not dead, though: its glow is modulated a few percent by the
// frame's own flame luminance (BREATHE), so the seal reads as lit by the
// same fire as everything else rather than as a decal pasted on top.
//
// ── WHY EXPOSURE IS FLATTENED HERE, NOT BY THE SHELL PIPELINE ───────────
// finish-projects-scene.sh has a DRIFT stage, but it applies a CONSTANT
// per-second gamma slope. The real ramp is not linear — it is steep early and
// plateaus. Fitting the actual trend (heavy temporal smoothing, then dividing
// it out) removes it properly, and leaves the high-frequency flicker that
// makes the fire read as fire completely untouched. Run the shell script with
// DRIFT=0 after this.
import { spawn } from "node:child_process";
import sharp from "sharp";
import ffmpeg from "ffmpeg-static";

const [RAW, BASE, OUT] = process.argv.slice(2);
if (!RAW || !BASE || !OUT) {
  console.error("usage: node scripts/scene/bake-scene-frames.mjs <raw.mp4> <base-still.png> <out.mp4>");
  process.exit(1);
}

const FF = process.env.FFMPEG ?? ffmpeg;

const W = 2560;
const H = 1440;
const FPS = 24;
const FRAME = W * H * 3;

// Rug window — must match bake-rug-seal.mjs.
const RX0 = 1020, RX1 = 1800, RY0 = 1090, RY1 = 1400;
const RW = RX1 - RX0, RH = RY1 - RY0;
// Feather width for the plate's edge, in px.
const FEATHER = 46;
// How much the plate breathes with the scene's fire, peak-to-peak fraction.
const BREATHE = Number(process.env.BREATHE ?? 0.05);

// ── RELIGHT: fix the boiling lantern interiors ──────────────────────────
// The ENCLOSED fixtures are the scene's worst artefact. A candle flame is a
// naked flame and the model animates it convincingly, but inside a glazed
// lantern it redraws the whole interior every frame: the glass texture,
// glazing bars and inner glow reorganise instead of a flame moving behind
// fixed glass. Measured over a 1.9 s window (temporal std of luminance):
//
//     left lantern  4.40      chandelier 3.03      stone floor 0.53
//
// That is 8x the static-scene baseline, and it reads exactly as "broken".
//
// The fix is not to freeze the region (that kills the life) and not to blur
// it (that kills the crispness the 2K generation was for). It is to SPLIT
// light from structure: keep the still's structure, which is sharp and
// correct, and drive it with the video's low-frequency BRIGHTNESS, which is
// the part the model gets right. The lantern then breathes and pulses with
// the fire while its glass, bars and filigree stay exactly where they are.
//
//     out = plate_rgb * blur(frame_luma) / blur(plate_luma)
//
// Positions are the `k: 'lantern'` entries from SceneEmbers' SOURCES table —
// already hand-placed against this artwork, so the two layers are guaranteed
// to agree about where the lanterns are.
const LANTERNS = [
  { u: 0.064, v: 0.393, r: 95 },
  { u: 0.268, v: 0.178, r: 85 },
  { u: 0.321, v: 0.247, r: 75 },
  { u: 0.432, v: 0.343, r: 60 },
  { u: 0.468, v: 0.286, r: 50 },
  { u: 0.768, v: 0.152, r: 110 },
  { u: 0.929, v: 0.203, r: 80 },
  { u: 0.971, v: 0.273, r: 70 },
  { u: 0.925, v: 0.393, r: 85 },
  { u: 0.8, v: 0.419, r: 55 },
  { u: 0.746, v: 0.368, r: 45 },
];
// Radius multiplier: SOURCES radii describe each lantern's GLOW, which is a
// little wider than the body that needs stabilising.
const RELIGHT_R = Number(process.env.RELIGHT_R ?? 1.05);
// Blur radius for the light/structure split. Must be well above the glazing
// detail (a few px) and well below the fixture (~100px).
const RELIGHT_BLUR = 13;
const RELIGHT_ON = process.env.RELIGHT !== "0";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

console.log("reading base still…");
const base = await sharp(BASE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
if (base.info.width !== W || base.info.height !== H) {
  throw new Error(`base still must be ${W}x${H}, got ${base.info.width}x${base.info.height}`);
}
// The finished rug region, lifted out of the base still.
const plate = new Float32Array(RW * RH * 3);
for (let y = 0; y < RH; y++) {
  for (let x = 0; x < RW; x++) {
    const s = ((RY0 + y) * W + (RX0 + x)) * 3;
    const d = (y * RW + x) * 3;
    plate[d] = base.data[s];
    plate[d + 1] = base.data[s + 1];
    plate[d + 2] = base.data[s + 2];
  }
}
// Feathered mask so the stamp has no visible border on the weave.
const mask = new Float32Array(RW * RH);
for (let y = 0; y < RH; y++) {
  for (let x = 0; x < RW; x++) {
    const dx = Math.min(x, RW - 1 - x);
    const dy = Math.min(y, RH - 1 - y);
    const t = clamp(Math.min(dx, dy) / FEATHER, 0, 1);
    mask[y * RW + x] = t * t * (3 - 2 * t);
  }
}

// Separable box blur over a small region (two running-sum passes).
function boxBlurRegion(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[y * w + clamp(i, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc * norm;
      acc += src[y * w + clamp(x + r + 1, 0, w - 1)] - src[y * w + clamp(x - r, 0, w - 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += tmp[clamp(i, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * norm;
      acc += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x];
    }
  }
  return out;
}

const REGIONS = RELIGHT_ON
  ? LANTERNS.map(({ u, v, r }) => {
      const R = r * RELIGHT_R;
      const cx = u * W;
      const cy = v * H;
      const pad = RELIGHT_BLUR * 2 + 4;
      const x0 = Math.max(0, Math.floor(cx - R - pad));
      const x1 = Math.min(W, Math.ceil(cx + R + pad));
      const y0 = Math.max(0, Math.floor(cy - R - pad));
      const y1 = Math.min(H, Math.ceil(cy + R + pad));
      const rw = x1 - x0;
      const rh = y1 - y0;
      const mask = new Float32Array(rw * rh);
      const plum = new Float32Array(rw * rh);
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          const px = x0 + x + 0.5;
          const py = y0 + y + 0.5;
          const t = clamp((R - Math.hypot(px - cx, py - cy)) / (R * 0.35), 0, 1);
          mask[y * rw + x] = t * t * (3 - 2 * t);
          const o = ((y0 + y) * W + (x0 + x)) * 3;
          plum[y * rw + x] =
            0.299 * base.data[o] + 0.587 * base.data[o + 1] + 0.114 * base.data[o + 2];
        }
      }
      return {
        x0, y0, rw, rh, mask,
        plateBlur: boxBlurRegion(plum, rw, rh, RELIGHT_BLUR),
        scratch: new Float32Array(rw * rh),
      };
    })
  : [];
if (RELIGHT_ON) console.log(`relight: ${REGIONS.length} enclosed fixtures`);

// ── pass 1: measure the exposure trend ──────────────────────────────────
// Luminance is measured OUTSIDE the rug window, because the rug is about to
// be replaced and its ramp is far steeper than the rest of the frame; letting
// it into the average would over-correct everything else.
// onFrame may return a promise; the decoder is PAUSED until it settles.
// Without this the decoder floods the encoder's stdin — a 2560x1440 rgb24
// frame is 11 MB, so a 288-frame clip is 3.2 GB through a 64 KB pipe, and
// ignoring the `write() === false` backpressure signal fails hard (EINVAL on
// Node 25) rather than merely buffering.
// Decode RAW as rgb24 frames, optionally downscaled. onFrame may return a
// promise; the decoder is PAUSED until it settles.
//
// Two things here are load-bearing:
//   * A PREALLOCATED frame buffer that chunks are copied into. The obvious
//     `buf = Buffer.concat([buf, chunk])` is quadratic — an 11 MB frame
//     arriving in 64 KB chunks means ~170 concats each copying up to 11 MB,
//     i.e. ~1.9 GB of memcpy PER FRAME. That alone took the run past 10 min.
//   * Backpressure. Ignoring `write() === false` while piping 3.2 GB through
//     a 64 KB pipe fails hard (EINVAL on Node 25) rather than buffering.
function decode(onFrame, w = W, h = H) {
  const size = w * h * 3;
  return new Promise((resolve, reject) => {
    const args = ["-hide_banner", "-loglevel", "error", "-i", RAW];
    if (w !== W || h !== H) args.push("-vf", `scale=${w}:${h}`);
    args.push("-f", "rawvideo", "-pix_fmt", "rgb24", "-");
    const ff = spawn(FF, args);
    const frame = Buffer.allocUnsafe(size);
    let filled = 0;
    let n = 0;
    let chain = Promise.resolve();
    ff.stdout.on("data", (chunk) => {
      let off = 0;
      while (off < chunk.length) {
        const take = Math.min(size - filled, chunk.length - off);
        chunk.copy(frame, filled, off, off + take);
        filled += take;
        off += take;
        if (filled === size) {
          const copy = Buffer.from(frame);
          const i = n++;
          filled = 0;
          ff.stdout.pause();
          chain = chain
            .then(() => onFrame(copy, i))
            .then(() => ff.stdout.resume())
            .catch(reject);
        }
      }
    });
    ff.stderr.on("data", (d) => process.stderr.write(d));
    ff.on("close", (code) =>
      chain.then(() => (code === 0 ? resolve(n) : reject(new Error(`ffmpeg ${code}`)))));
    ff.on("error", reject);
  });
}

// Write honouring backpressure.
const writeAsync = (stream, chunk) =>
  new Promise((res, rej) => {
    stream.write(chunk, (err) => (err ? rej(err) : res()));
  });

// Measured on a 320x180 decode: exposure is a whole-frame property, so full
// resolution buys nothing here and costs 64x the memcpy.
const MW = 320, MH = 180;
const SC = MW / W;
const mrx0 = Math.floor(RX0 * SC), mrx1 = Math.ceil(RX1 * SC);
const mry0 = Math.floor(RY0 * SC), mry1 = Math.ceil(RY1 * SC);

function meanOutsideRug(buf, w, h) {
  let sum = 0, cnt = 0;
  for (let y = 0; y < h; y++) {
    const inRugRow = y >= mry0 && y < mry1;
    for (let x = 0; x < w; x++) {
      if (inRugRow && x >= mrx0 && x < mrx1) continue;
      const o = (y * w + x) * 3;
      sum += 0.299 * buf[o] + 0.587 * buf[o + 1] + 0.114 * buf[o + 2];
      cnt++;
    }
  }
  return sum / cnt;
}

const means = [];
console.log("pass 1: measuring exposure trend…");
await decode((f) => { means.push(meanOutsideRug(f, MW, MH)); }, MW, MH);
const N = means.length;
console.log(`  ${N} frames, luminance ${means[0].toFixed(1)} -> ${means[N - 1].toFixed(1)} ` +
  `(drift ${(means[N - 1] - means[0]).toFixed(1)})`);

// Heavy temporal smoothing = the trend; what's left is flicker, which stays.
const SIG = 14;
const trend = means.map((_, i) => {
  let s = 0, w = 0;
  for (let j = Math.max(0, i - 3 * SIG); j < Math.min(N, i + 3 * SIG); j++) {
    const k = Math.exp(-((i - j) ** 2) / (2 * SIG * SIG));
    s += k * means[j];
    w += k;
  }
  return s / w;
});
// Hold the clip at the base still's own level so poster and video agree.
// Measured through the SAME 320x180 path as the trend — comparing a full-res
// mean against a downscaled one would bake a systematic offset into the gain.
const baseSmall = await sharp(BASE).removeAlpha().resize(MW, MH).raw().toBuffer();
const baseLum = meanOutsideRug(baseSmall, MW, MH);
const gains = trend.map((t) => clamp(baseLum / t, 0.6, 1.4));
console.log(`  base level ${baseLum.toFixed(1)}; gain ${gains[0].toFixed(3)} -> ${gains[N - 1].toFixed(3)}`);

// Flame drive for the plate's breathing: the flicker left after the trend,
// normalised to roughly [-1, 1].
const resid = means.map((m, i) => m / trend[i] - 1);
const rmax = Math.max(...resid.map(Math.abs), 1e-6);

// ── pass 2: correct exposure, stamp the plate, encode ───────────────────
console.log("pass 2: stamping seal + flattening exposure…");
const enc = spawn(FF, [
  "-hide_banner", "-loglevel", "error",
  "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
  "-an",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-y", OUT,
]);
enc.stderr.on("data", (d) => process.stderr.write(d));
const encDone = new Promise((res, rej) => {
  enc.on("close", (c) => (c === 0 ? res() : rej(new Error(`encode exit ${c}`))));
  enc.on("error", rej);
});

const out = Buffer.alloc(FRAME);
let idx = 0;
await decode((f, i) => {
  const g = gains[i];
  const breathe = 1 + BREATHE * (resid[i] / rmax);
  f.copy(out);
  // global exposure correction
  if (Math.abs(g - 1) > 1e-4) {
    for (let o = 0; o < FRAME; o++) out[o] = clamp(out[o] * g, 0, 255);
  }
  // relight the enclosed fixtures: still's structure, video's brightness
  for (const rg of REGIONS) {
    const { x0, y0, rw, rh, mask, plateBlur, scratch } = rg;
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const o = ((y0 + y) * W + (x0 + x)) * 3;
        scratch[y * rw + x] = 0.299 * out[o] + 0.587 * out[o + 1] + 0.114 * out[o + 2];
      }
    }
    const frameBlur = boxBlurRegion(scratch, rw, rh, RELIGHT_BLUR);
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const i = y * rw + x;
        const m = mask[i];
        if (m <= 0) continue;
        // Clamped so a bad frame cannot blow the fixture out or kill it.
        const ratio = clamp(frameBlur[i] / Math.max(plateBlur[i], 1e-3), 0.55, 1.9);
        const o = ((y0 + y) * W + (x0 + x)) * 3;
        for (let c = 0; c < 3; c++) {
          const want = clamp(base.data[o + c] * ratio, 0, 255);
          out[o + c] = clamp(out[o + c] * (1 - m) + want * m, 0, 255);
        }
      }
    }
  }

  // stamp the finished rug
  for (let y = 0; y < RH; y++) {
    for (let x = 0; x < RW; x++) {
      const m = mask[y * RW + x];
      if (m <= 0) continue;
      const p = (y * RW + x) * 3;
      const o = ((RY0 + y) * W + (RX0 + x)) * 3;
      for (let c = 0; c < 3; c++) {
        const want = clamp(plate[p + c] * breathe, 0, 255);
        out[o + c] = clamp(out[o + c] * (1 - m) + want * m, 0, 255);
      }
    }
  }
  idx++;
  if (idx % 48 === 0) console.log(`  ${idx}/${N}`);
  return writeAsync(enc.stdin, Buffer.from(out));
});
enc.stdin.end();
await encDone;
console.log(`wrote ${OUT} (${idx} frames)`);
