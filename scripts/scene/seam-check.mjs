// Is the loop's wrap-around distinguishable from an ordinary frame step?
// The seam is perceptible exactly when jumping last→first costs more than a
// normal frame-to-frame change; the ratio is the number to watch, not the
// absolute error.
import { spawn } from "node:child_process";
import ffmpeg from "ffmpeg-static";

const file = process.argv[2];
const W = 240, H = 135, PIX = W * H;
const FF = process.env.FFMPEG ?? ffmpeg;

const frames = await new Promise((resolve, reject) => {
  const chunks = [];
  const ff = spawn(FF, ["-v", "error", "-i", file, "-vf", `scale=${W}:${H},format=gray`,
    "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  ff.stdout.on("data", (c) => chunks.push(c));
  ff.on("error", reject);
  ff.on("close", () => {
    const buf = Buffer.concat(chunks);
    const out = [];
    for (let o = 0; o + PIX <= buf.length; o += PIX) out.push(buf.subarray(o, o + PIX));
    resolve(out);
  });
});

const mse = (a, b) => {
  let s = 0;
  for (let p = 0; p < PIX; p++) { const d = a[p] - b[p]; s += d * d; }
  return s / PIX;
};

const steps = [];
for (let i = 1; i < frames.length; i++) steps.push(mse(frames[i - 1], frames[i]));
steps.sort((x, y) => x - y);
const median = steps[Math.floor(steps.length / 2)];
const p90 = steps[Math.floor(steps.length * 0.9)];
const max = steps[steps.length - 1];
const wrap = mse(frames[frames.length - 1], frames[0]);

console.log(JSON.stringify({
  frames: frames.length,
  normalStep: { median: +median.toFixed(1), p90: +p90.toFixed(1), max: +max.toFixed(1) },
  wrapAroundStep: +wrap.toFixed(1),
  ratioToMedian: +(wrap / median).toFixed(2),
  verdict: wrap <= p90 ? "seam indistinguishable from a normal frame step"
    : wrap <= max ? "seam within the clip's own motion range"
    : "seam LARGER than any normal step — visible",
}, null, 2));
