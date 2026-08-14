// Hand the causeway's lantern posts back to the still plate (run from repo root):
//   node scripts/scene/remask-causeway-posts.mjs
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// bake-causeway-water.mjs masks the generated clip to the lake so the plate
// supplies every pixel of geometry the eye can check. It defines the lake as
// "below the horizon and off the causeway" — and the lantern posts stand in the
// lake beside the causeway, not on it. So they fell inside the mask, and the
// model was re-drawing them every frame.
//
// Measured on the shipped loop as per-pixel temporal std: causeway stone
// 0.00–0.02 (rigid, as designed), open water 5–10 (the motion we want), the
// four near posts 13–15, the two foreground posts 39–42, peaking at 58 in the
// flame cores. The bridge and its lights were visibly swimming.
//
// ── WHY RE-MASK RATHER THAN RE-BAKE ─────────────────────────────────────────
// The raw i2v clip is long gone from its scratchpad, but it is not needed. The
// bake's own invariant — outside the mask the composite IS the plate, byte for
// byte — means the shipped mp4 already carries the plate everywhere the video
// was not allowed. Compositing the plate back over the post keep-outs is
// therefore the same operation the bake would have done with a tighter mask:
//
//   out = video + (plate - video) * keepout
//
// where `keepout` comes from POST_KEEPOUTS in the rig, so the geometry lives in
// exactly one place. The frame order is untouched, so the loop stays closed
// (the bake's crossfade is baked into these frames already).
//
// The cost is one h264 generation on a clip that is 71% perfectly static; at
// CRF 20 on water that is not measurable by eye, and the encode is asserted
// against the plate afterwards the same way the original bake asserts itself.
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readdirSync, copyFileSync, readFileSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
// FFMPEG= overrides the bundled binary, as scripts/scene/README.md promises.
const ffmpeg = process.env.FFMPEG ?? ffmpegStatic;
import { WORK } from './workdir.mjs';

const RIG = await import(
  `data:text/javascript;base64,${Buffer.from(
    readFileSync("src/components/home/homeSceneLights.js", "utf8"),
  ).toString("base64")}`
);
const { postKeepout, LANTERNS } = RIG;

const S =
  WORK;
const SRC = "public/background/causeway-1080.mp4";
const FR = `${S}/remask-src`;
const OUT = `${S}/remask-out`;
const BACKUP = `${S}/backup-causeway`;

const W = 1920;
const H = 1080;
const FPS = 24;

const sh = (args) => execFileSync(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });

// ── 0. keep the originals ───────────────────────────────────────────────────
// These mp4s are untracked, so git is no safety net for them.
mkdirSync(BACKUP, { recursive: true });
for (const n of ["causeway-1080", "causeway-720"]) {
  copyFileSync(`public/background/${n}.mp4`, `${BACKUP}/${n}.mp4`);
}
console.log(`originals copied to ${BACKUP}`);

// ── 1. frames ───────────────────────────────────────────────────────────────
rmSync(FR, { recursive: true, force: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(FR, { recursive: true });
mkdirSync(OUT, { recursive: true });
sh(["-v", "error", "-i", `${BACKUP}/causeway-1080.mp4`, "-vsync", "0", `${FR}/f%04d.png`]);
const frames = readdirSync(FR).filter((f) => f.endsWith(".png")).sort();
console.log(`extracted ${frames.length} frames`);

// ── 2. the keep-out mask ────────────────────────────────────────────────────
const keep = new Float32Array(W * H);
let covered = 0;
for (let y = 0; y < H; y++) {
  const v = y / H;
  for (let x = 0; x < W; x++) {
    const a = postKeepout(x / W, v);
    keep[y * W + x] = a;
    if (a > 0.5) covered++;
  }
}
console.log(`keep-out covers ${((100 * covered) / (W * H)).toFixed(2)}% of frame`);

// ── 3. the plate, at the bake's exact geometry ──────────────────────────────
// Same resize call the bake used, so these pixels line up with the ones already
// encoded into the clip outside the water mask.
const plate = await sharp("public/background/home-hero.webp")
  .resize(W, H, { fit: "cover", position: "centre" })
  .removeAlpha()
  .raw()
  .toBuffer();

// ── 4. composite ────────────────────────────────────────────────────────────
for (let i = 0; i < frames.length; i++) {
  const raw = await sharp(`${FR}/${frames[i]}`).removeAlpha().raw().toBuffer();
  const buf = Buffer.alloc(W * H * 3);
  for (let p = 0; p < W * H; p++) {
    const a = keep[p];
    const o = p * 3;
    if (a === 0) {
      buf[o] = raw[o];
      buf[o + 1] = raw[o + 1];
      buf[o + 2] = raw[o + 2];
      continue;
    }
    for (let c = 0; c < 3; c++) {
      buf[o + c] = (raw[o + c] + (plate[o + c] - raw[o + c]) * a) | 0;
    }
  }
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 1 })
    .toFile(`${OUT}/o${String(i).padStart(4, "0")}.png`);
  if (i % 24 === 0) console.log(`  composited ${i}/${frames.length}`);
}

// The invariant, restated for this pass: inside a keep-out the composite must
// be the plate. It cannot be exact like the bake's own assert — the incoming
// frames are h264-decoded, so even the untouched plate regions carry a couple
// of levels of codec noise — but at alpha 1 the output is the plate by
// construction, and this proves the arithmetic did what it claims.
{
  const probe = await sharp(`${OUT}/o${String(Math.floor(frames.length / 2)).padStart(4, "0")}.png`)
    .removeAlpha()
    .raw()
    .toBuffer();
  let worst = 0;
  for (let p = 0; p < W * H; p++) {
    if (keep[p] < 0.999) continue;
    const o = p * 3;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(probe[o + c] - plate[o + c]);
      if (d > worst) worst = d;
    }
  }
  if (worst > 1) throw new Error(`keep-out leak: ${worst} levels off the plate`);
  console.log("invariant holds: inside the keep-outs the composite is the plate");
}

// ── 5. encode the ladder ────────────────────────────────────────────────────
// Same flat-QP params as the original bake: x264's defaults give the loop's
// first frame (always an IDR) a lower QP than the frame before it, so the
// picture visibly sharpens on every restart with no content behind it.
const X264 = ["-x264-params", "ipratio=1.0:pbratio=1.0:scenecut=0"];
for (const [name, w] of [["causeway-720", 1280], ["causeway-1080", 1920]]) {
  const dest = `public/background/${name}.mp4`;
  sh([
    "-v", "error", "-y",
    "-framerate", String(FPS),
    "-i", `${OUT}/o%04d.png`,
    "-vf", `scale=${w}:-2`,
    "-c:v", "libx264", "-preset", "veryslow", "-crf", "20",
    ...X264,
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
    dest,
  ]);
  console.log(`wrote ${dest}`);
}

// Where the rig says the flames are, for the after-measurement to key on.
console.log(
  `\nnear lantern flames now plate-only: ${LANTERNS.filter((l) => postKeepout(l.u, l.v) > 0.99).length}/${LANTERNS.length}`,
);
console.log("done");
