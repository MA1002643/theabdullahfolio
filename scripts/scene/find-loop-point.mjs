// Pick the loop in/out points for the /projects ambient scene, so the
// crossfade has almost nothing left to hide.
//
//   node scripts/scene/find-loop-point.mjs <master.mp4> [fadeFrames] [minLoopSeconds]
//
// WHY THIS EXISTS. The first loop simply crossfaded the clip's tail into its
// head over a full second — and a one-second dissolve between two unrelated
// moments of a scene is visible as exactly what it is: for that second the
// candles are a double exposure of two different flame states, so they read
// as fading out and rebuilding themselves on every cycle. Shortening the
// fade alone just trades a dissolve for a jump.
//
// The fix is to stop treating the clip's own ends as the loop's ends. The
// scene is static except for fire, so somewhere inside a long clip there are
// two moments whose flames happen to sit in nearly the same state. Cut there
// and the seam has almost no work to do — a 4-6 frame fade, below the
// threshold where the eye reads structure changing, is enough.
//
// Scoring, over a window of `fade` frame pairs (tail vs head):
//   • appearance — mean squared luma difference, the thing a dissolve shows
//   • motion     — squared difference of consecutive-frame deltas, so the
//                  flames are also moving the same WAY across the seam (a
//                  matching still frame whose flame is travelling the other
//                  direction still snaps)
// Longer loops are preferred on a mild tie-break: repetition is itself a
// tell, so the best seam that costs half the runtime is not a good trade.
import { spawn } from "node:child_process";
import ffmpeg from "ffmpeg-static";

const [master, fadeArg, minLoopArg] = process.argv.slice(2);
if (!master) {
  console.error("usage: node scripts/scene/find-loop-point.mjs <master.mp4> [fadeFrames] [minLoopSeconds]");
  process.exit(1);
}
const FADE = Number(fadeArg ?? 6);
const MIN_LOOP_S = Number(minLoopArg ?? 3);
const FPS = 24;
// ── TWO-STAGE SEARCH ────────────────────────────────────────────────────
// The search is O(N^2 * FADE * PIX), so it cannot simply be run at high
// resolution. But running it ONLY at 240x135 is what shipped a loop whose
// wrap measured 7.5x a normal frame step at native resolution while the
// coarse scorer called it excellent: at 240x135 the fine detail that makes a
// wrap visible — glazing bars, crystal drops, candle tips — is smoothed away,
// so many pairs look equally good and the winner is close to arbitrary.
//
// So: score every pair coarsely, keep a shortlist, and re-score only those at
// a resolution where the detail actually exists. Cost is the coarse pass plus
// SHORTLIST re-scores, not N^2 at high resolution.
const CW = 240, CH = 135;             // coarse
const FW = 640, FH = 360;             // fine
const SHORTLIST = Number(process.env.SHORTLIST ?? 400);
const FF = process.env.FFMPEG ?? ffmpeg;

const decode = (w, h) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    const ff = spawn(FF, [
      "-v", "error", "-i", master,
      "-vf", `scale=${w}:${h},format=gray`,
      "-f", "rawvideo", "-pix_fmt", "gray", "-",
    ]);
    ff.stdout.on("data", (c) => chunks.push(c));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}`));
      const buf = Buffer.concat(chunks);
      const size = w * h;
      const out = [];
      for (let o = 0; o + size <= buf.length; o += size) out.push(buf.subarray(o, o + size));
      resolve(out);
    });
  });

let frames = await decode(CW, CH);

const N = frames.length;
let PIX = CW * CH;
const minLoop = Math.round(MIN_LOOP_S * FPS);

const appearance = (a, b) => {
  let s = 0;
  for (let p = 0; p < PIX; p++) {
    const d = frames[a][p] - frames[b][p];
    s += d * d;
  }
  return s / PIX;
};

// Velocity match: compare each frame to its predecessor, then compare those
// two motion fields. Cheap stand-in for optical flow, enough to reject pairs
// whose flames are momentarily identical but moving apart.
const motion = (a, b) => {
  let s = 0;
  for (let p = 0; p < PIX; p++) {
    const da = frames[a][p] - frames[a - 1][p];
    const db = frames[b][p] - frames[b - 1][p];
    const d = da - db;
    s += d * d;
  }
  return s / PIX;
};

const scorePair = (ts, te) => {
  let app = 0;
  let mot = 0;
  for (let k = 0; k < FADE; k++) {
    app += appearance(ts + k, te - FADE + k);
    mot += motion(ts + k, te - FADE + k);
  }
  app /= FADE;
  mot /= FADE;
  const loopFrames = te - ts;
  // Mild preference for length: 4% penalty per second short of the longest
  // loop this clip could give, which never outweighs a genuinely bad seam.
  const lengthPenalty = 1 + 0.04 * ((N - minLoop - loopFrames) / FPS);
  return { ts, te, app, mot, score: (app + 0.5 * mot) * lengthPenalty, loopFrames };
};

// Stage 1 — coarse, every pair.
const candidates = [];
for (let ts = 1; ts + minLoop + FADE <= N; ts++) {
  for (let te = ts + minLoop; te <= N - 1; te++) candidates.push(scorePair(ts, te));
}
candidates.sort((a, b) => a.score - b.score);
const shortlist = candidates.slice(0, SHORTLIST);
const coarseBest = candidates[0];

// Stage 2 — fine, shortlist only. Re-decoding at 640x360 costs one extra
// decode and rescoring 400 pairs; it is what actually picks the winner.
frames = await decode(FW, FH);
PIX = FW * FH;
let best = null;
for (const c of shortlist) {
  const r = scorePair(c.ts, c.te);
  if (!best || r.score < best.score) best = r;
}
const movedBy = Math.abs(best.ts - coarseBest.ts) + Math.abs(best.te - coarseBest.te);
console.error(
  `[loop] coarse pick ${coarseBest.ts}->${coarseBest.te}; fine pick ${best.ts}->${best.te} ` +
    `(moved ${movedBy} frames), fine app ${best.app.toFixed(1)} mot ${best.mot.toFixed(1)}`,
);

const naive = { app: 0, mot: 0 };
for (let k = 0; k < FADE; k++) {
  naive.app += appearance(k, N - FADE + k) / FADE;
  naive.mot += motion(Math.max(1, k), N - FADE + k) / FADE;
}

console.log(JSON.stringify({
  frames: N,
  fps: FPS,
  fadeFrames: FADE,
  best: {
    startFrame: best.ts,
    endFrame: best.te,
    startSeconds: +(best.ts / FPS).toFixed(4),
    endSeconds: +(best.te / FPS).toFixed(4),
    loopSeconds: +(best.loopFrames / FPS).toFixed(4),
    appearanceMSE: +best.app.toFixed(2),
    motionMSE: +best.mot.toFixed(2),
  },
  // What the old "just use the clip's own ends" recipe would have scored.
  naiveWholeClip: { appearanceMSE: +naive.app.toFixed(2), motionMSE: +naive.mot.toFixed(2) },
}, null, 2));
