// Cut a seamless forward-only loop out of the graded master.
//
//   node scripts/scene/close-loop.mjs <graded.mp4> <out.mp4> <tsFrame> <teFrame> <fadeFrames> [crf]
//
// ── WHY THIS REPLACED ffmpeg's xfade ────────────────────────────────────
// The previous assembly used `xfade` plus a "+1 frame" correction, on the
// reasoning that xfade's last in-range frame is only (F-1)/F across. Measured
// at native resolution, that correction does not land: the shipped loop's
// final frame matched NO master frame (nearest was 2.66 mean abs luma away,
// against 1.43 for frame 0, which is just the CRF floor) — the signature of a
// frame that is still a BLEND of two moments five seconds apart. The result
// was a wrap step of 2.9 against a mean consecutive step of 0.38: a 7.6x jump
// once per cycle, which is exactly the "you can tell it's a repeating video"
// tell. The rug gave it away — that region is a pixel-identical plate in every
// master frame, yet still measured a wrap of 1.25, which no content difference
// could explain.
//
// Doing the blend here makes the endpoint exact by construction:
//
//   head  = master[ts .. ts+F-1]                  (F frames)
//   body  = master[ts+F .. te-1]
//   out[i]        = body[i]                                    for i < OFF
//   out[OFF + k]  = lerp(body[OFF+k], head[k], (k+1)/F)         for k < F
//   OFF   = (te - ts) - 2F
//
// The final output frame is k = F-1, whose weight is exactly F/F = 1, so it
// IS head[F-1] = master[ts+F-1]. Output frame 0 is body[0] = master[ts+F].
// Those are CONSECUTIVE master frames, so the wrap is a normal frame step —
// not approximately, but exactly.
//
// It also sidesteps the xfade EOF wedge (the graph stalls near-idle when its
// second input EOFs before the transition window) that the shell pipeline
// needed a tpad clone-pad to work around.
import { spawn } from "node:child_process";
import ffmpeg from "ffmpeg-static";

const [GRADED, OUT, tsArg, teArg, fadeArg, crfArg] = process.argv.slice(2);
if (!GRADED || !OUT || !tsArg || !teArg || !fadeArg) {
  console.error("usage: close-loop.mjs <graded.mp4> <out.mp4> <ts> <te> <fade> [crf]");
  process.exit(1);
}
const TS = Number(tsArg);
const TE = Number(teArg);
const F = Number(fadeArg);
const CRF = crfArg ?? "22";
const FPS = 24;
const W = 2560;
const H = 1440;
const FRAME = W * H * 3;
const OFF = TE - TS - 2 * F;
if (OFF < 1) throw new Error(`loop too short for fade ${F}: OFF=${OFF}`);

const FF = process.env.FFMPEG ?? ffmpeg;

const writeAsync = (stream, chunk) =>
  new Promise((res, rej) => stream.write(chunk, (e) => (e ? rej(e) : res())));

// Decode only [TS, TE) — seek by frame with the select filter so there is no
// timestamp rounding to get an off-by-one from.
function decodeRange(onFrame) {
  return new Promise((resolve, reject) => {
    const ff = spawn(FF, [
      "-hide_banner", "-loglevel", "error",
      "-i", GRADED,
      "-vf", `select='between(n\\,${TS}\\,${TE - 1})'`,
      "-vsync", "0",
      "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ]);
    const frame = Buffer.allocUnsafe(FRAME);
    let filled = 0;
    let n = 0;
    let chain = Promise.resolve();
    ff.stdout.on("data", (chunk) => {
      let off = 0;
      while (off < chunk.length) {
        const take = Math.min(FRAME - filled, chunk.length - off);
        chunk.copy(frame, filled, off, off + take);
        filled += take;
        off += take;
        if (filled === FRAME) {
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
    ff.on("close", (c) =>
      chain.then(() => (c === 0 ? resolve(n) : reject(new Error(`ffmpeg ${c}`)))));
    ff.on("error", reject);
  });
}

// ── FLAT QP: the other half of "you can tell it's a repeating video" ────
// Even with a structurally exact seam, x264's defaults give the loop away.
// `ipratio` (default 1.4) encodes I-frames at a markedly lower QP than P
// frames, so the loop's first frame — always an IDR — is visibly CLEANER than
// the P-frame that precedes it. The picture subtly sharpens on every restart:
// a periodic "refresh" with no content behind it at all.
//
// ipratio=1.0 + pbratio=1.0 spend bits evenly across frame types, and
// scenecut=0 stops x264 inserting extra IDRs mid-loop (each of which would be
// its own little sharpening pop). Measured on the blur-robust seam metric,
// wrap/max-natural-step: 1.55 (old) -> 1.38 (flat QP at CRF 22) -> 1.15
// (flat QP at CRF 20), against 0.67 for a near-lossless reference.
export const X264_FLAT = "ipratio=1.0:pbratio=1.0:scenecut=0:qcomp=0.8";

const enc = spawn(FF, [
  "-hide_banner", "-loglevel", "error",
  "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
  "-an",
  "-c:v", "libx264", "-profile:v", "high", "-preset", "veryslow", "-crf", String(CRF),
  "-x264-params", X264_FLAT,
  "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-y", OUT,
]);
enc.stderr.on("data", (d) => process.stderr.write(d));
const encDone = new Promise((res, rej) => {
  enc.on("close", (c) => (c === 0 ? res() : rej(new Error(`encode ${c}`))));
  enc.on("error", rej);
});

const head = [];
const out = Buffer.alloc(FRAME);
let written = 0;

console.log(`loop: frames ${TS}..${TE} (${TE - TS}), fade ${F}, body-only ${OFF}`);
await decodeRange(async (f, i) => {
  if (i < F) {
    head.push(f);           // head frames are needed later, so keep them
    return;
  }
  const b = i - F;          // index within body
  if (b < OFF) {
    written++;
    return writeAsync(enc.stdin, f);
  }
  const k = b - OFF;
  if (k >= F) return;       // past the loop; ignore
  const w = (k + 1) / F;    // k = F-1 -> w = 1 -> pure head
  const hf = head[k];
  for (let o = 0; o < FRAME; o++) out[o] = f[o] + (hf[o] - f[o]) * w;
  written++;
  return writeAsync(enc.stdin, Buffer.from(out));
});
enc.stdin.end();
await encDone;
console.log(`wrote ${OUT}: ${written} frames (${(written / FPS).toFixed(2)}s)`);
