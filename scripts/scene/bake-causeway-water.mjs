// Salvage the generated clip into a shippable ambient loop (run from repo root):
//   node scripts/scene/bake-causeway-water.mjs
//
// ── WHY A BAKE AND NOT THE CLIP ─────────────────────────────────────────────
// The seedance i2v pass produced genuinely good water — slow ripples, drizzle
// rings, and lantern reflections that wobble — but would not hold the causeway
// rigid: the paving pattern slides frame to frame. Measured as per-pixel
// temporal std, the stone came back at 28.6 against 6.0 for the water it was
// supposed to be animating, i.e. the scene moved everywhere EXCEPT where it was
// asked to. It is not a rigid camera drift either — vidstab's static-camera
// mode left it at 28.0 — so no stabiliser can recover it; the model is
// re-drawing geometry.
//
// That only kills the clip if you use all of it. Water has no rigid structure,
// so drift inside water is invisible; stone advertises it instantly. So the
// video is masked to the lake and composited over the STILL plate, which
// supplies every pixel of geometry the eye can check.
//
// ── WHY THIS TIER CAME BACK ─────────────────────────────────────────────────
// It was withdrawn once, on the finding that invented structure "covered most
// of the near-field water" — which, re-derived, does not hold. That verdict
// came from a metric that could not tell "these pixels changed" (water pixels
// are SUPPOSED to change) from "an edge appeared where the plate has none",
// which is the only kind of change that matters. Scored on gradient energy the
// frame carries that the plate does not (.ghost-hunt.mjs, 16 frames):
//
//     causeway stone      ghost 11.3-16.9   <- re-drawn, and masked out
//     lanterns / posts    ghost 11.9-12.1   <- re-drawn, and masked out
//     trees, sky          ghost  1.7-5.2    <- masked out
//     OPEN WATER          ghost  0.8-2.7    <- an order of magnitude lower
//     lantern reflections ghost  1.9-2.7  motion 7.6  <- the best of the clip
//
// The invention is concentrated in exactly the structure the mask already
// excludes, and the strongest honest motion in the whole clip is the lantern
// reflections wobbling — which is precisely where the eye goes.
//
// ── THE MASK IS CUT BY MEASUREMENT, NOT BY HAND ─────────────────────────────
// Two changes from the version that shipped before. First, the mask now takes
// its geometry from the rig's own `waterGaps`, so the causeway AND the lantern
// posts standing in the lake are excluded by the same function every other
// consumer asks — the posts were the specific hole through which a second
// lantern and pillar were drawn beside each foreground post. Second, whatever
// ghosting survives that is suppressed by the GHOST MAP ITSELF: the mask is
// multiplied down wherever the clip invents edge energy, so a hot spot hands
// itself back to the plate without anyone authoring a rectangle around it.
//
// ── AND THEN THE FLAMES CAME BACK TOO ───────────────────────────────────────
// Excluding the posts threw the FIRE out with them, and the fire is the one
// thing this clip does better than any shader can. /projects looks alive
// because it ships filmed flames; the homepage was left relighting a frozen
// photograph, and no amount of tuning makes a warp burn. So the flames are cut
// back IN, as small windows inside the post keep-outs — see § 6 below, which
// is where all the flame-specific reasoning lives.
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import ffmpegStatic from 'ffmpeg-static';
// FFMPEG= overrides the bundled binary, as scripts/scene/README.md promises.
const ffmpeg = process.env.FFMPEG ?? ffmpegStatic;
import { WORK } from './workdir.mjs';

// The rig is imported, never re-typed: if the mask and the components disagreed
// about where the water is, the video tier and the shader tier would disagree
// about it too, and the bug would only show as a faint edge nobody could place.
// `homeSceneLights.js` is ESM but lives under a package with no `"type":
// "module"`, so plain Node would load it as CommonJS and choke on `export
// const`. It imports nothing itself, so evaluating it through a data: URL is
// enough to get the real module — no rename, no second copy.
const RIG = await import(
  `data:text/javascript;base64,${Buffer.from(
    readFileSync('src/components/home/homeSceneLights.js', 'utf8'),
  ).toString('base64')}`
);
const { IW, IH, WATER_TOP, waterGaps, flameSources, FIRE_BOX, fireBoxAlpha } = RIG;

const SRC =
  WORK;
const S =
  WORK;
const RAW = `${SRC}/causeway-raw.mp4`;
const FR = `${S}/bake-src`;
const OUT = `${S}/bake-out`;

const W = 1920;
const H = 1080;
const FPS = 24;
const FADE = 24; // 1s crossfade to close the WATER loop
// Output length, stated rather than derived. It used to be N - FADE, which for
// this clip is 97 — a PRIME, so no flame loop shorter than the whole thing
// could divide it, and a flame loop that does not divide the output jumps at
// the video's own wrap. 96 costs one frame and divides by 48, 32 and 24.
const M = 96;

// The plate is graded (bake-home-grade.mjs). The clip was generated from the
// UNGRADED original, so its water must take the same grade or the masked region
// would sit at a different saturation from the lake around it — an edge the
// exposure normalisation below cannot see, because it only matches luminance.
const GRADE_SAT = 0.8;
const GRADE_LINEAR = [0.97, 1.0, 1.03];

// The still is painted at opacity 0.9, and this clip REPLACES it outright — it
// is a full-frame composite, so whatever is underneath stops mattering the
// moment it plays. It therefore carries the 0.9 BAKED IN and composites at CSS
// opacity 1, rather than stacking a second 0.9 on the plate's own: that lands
// at 0.99 x plate, so the whole hero would brighten 10% the instant the video
// started. Same invariant the shader tier holds (PLATE_OPACITY in the rig), and
// the reason the swap from still to video is invisible rather than a pop.
const PLATE_OPACITY = 0.9;

const sh = (args) => execFileSync(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });

// ── 1. frames ───────────────────────────────────────────────────────────────
rmSync(FR, { recursive: true, force: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(FR, { recursive: true });
mkdirSync(OUT, { recursive: true });
sh(['-v', 'error', '-i', RAW, '-vsync', '0', '-q:v', '1', `${FR}/f%04d.png`]);
const frames = readdirSync(FR)
  .filter((f) => f.endsWith('.png'))
  .sort();
const N = frames.length;
console.log(`extracted ${N} frames`);

// Graded, at working size, as raw RGB — read once and reused for the ghost map,
// the flame patches and the composite.
const gradedFrame = async (i) =>
  sharp(`${FR}/${frames[i]}`)
    .resize(W, H)
    .modulate({ saturation: GRADE_SAT })
    .linear(GRADE_LINEAR, [0, 0, 0])
    .removeAlpha()
    .raw()
    .toBuffer();

// The plate, graded here from the PRISTINE source rather than read back from
// the shipped file. § 9 writes the shipped file, so reading it would make this
// script feed on its own output: the flame windows it had already baked in
// would become the reference the next run registers against. Grading from
// home-hero-src.webp — the same input, and the same two operations,
// bake-home-grade.mjs uses — keeps one source of truth and makes the run
// reproducible.
const PLATE_SRC = 'assets/source/home-hero-src.webp';
const PLATE_LIVE = 'public/background/home-hero.webp';
const gradedPlate = (w, h) =>
  sharp(existsSync(PLATE_SRC) ? PLATE_SRC : PLATE_LIVE)
    .resize(w, h, { fit: 'cover', position: 'centre' })
    .modulate({ saturation: GRADE_SAT })
    .linear(GRADE_LINEAR, [0, 0, 0])
    .removeAlpha();
if (!existsSync(PLATE_SRC)) {
  console.warn(`WARNING: ${PLATE_SRC} missing — grading from the shipped plate instead`);
}
const plate = await gradedPlate(W, H).raw().toBuffer();

// ── 2. the ghost map ────────────────────────────────────────────────────────
// Gradient energy a frame carries that the plate does not, averaged over a
// subsample. This is what tells an invented pillar (a hard edge with no
// counterpart in the plate) from a rippling reflection (soft, and the plate is
// soft there too), and it is what cuts the mask below.
const lum = (rgb, i) => 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2];
const lumMap = (rgb) => {
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) g[i] = lum(rgb, i);
  return g;
};
const grad = (g) => {
  const out = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y += 1)
    for (let x = 1; x < W - 1; x += 1) {
      const i = y * W + x;
      out[i] = Math.hypot(g[i - 1] - g[i + 1], g[i - W] - g[i + W]);
    }
  return out;
};

const gPlate = grad(lumMap(plate));
const ghost = new Float32Array(W * H);
const STEP = 8;
let nGhost = 0;
for (let i = 0; i < N; i += STEP) {
  const gF = grad(lumMap(await gradedFrame(i)));
  for (let p = 0; p < W * H; p += 1) ghost[p] += Math.max(0, gF[p] - gPlate[p]);
  nGhost += 1;
}
for (let p = 0; p < W * H; p += 1) ghost[p] /= nGhost;
console.log(`ghost map from ${nGhost} frames`);

// Blur it, so suppression covers the whole invented object rather than only the
// pixels its edges land on, and so the mask has no hard cut-outs of its own.
const ghost8 = Buffer.alloc(W * H);
for (let p = 0; p < W * H; p += 1) ghost8[p] = Math.min(255, Math.round(ghost[p] * 6));
const ghostBlur = await sharp(ghost8, { raw: { width: W, height: H, channels: 1 } })
  .blur(18)
  .raw()
  .toBuffer();

// ── 3. the water mask ───────────────────────────────────────────────────────
// Geometry from the rig (causeway + the posts standing in the lake), feathered
// on every edge that matters, then multiplied down by the ghost map.
const FEATHER_V = 0.055; // in v units
const FEATHER_U = 0.028; // in u units
// Ghost suppression band, in the same units as ghostBlur (ghost x6, blurred).
// Below GHOST_LO the clip is trusted outright; above GHOST_HI it is refused.
const GHOST_LO = 14;
const GHOST_HI = 42;

const mask = Buffer.alloc(W * H);
for (let y = 0; y < H; y += 1) {
  const v = y / H;
  if (v <= WATER_TOP) continue;
  const vRamp = Math.min(1, (v - WATER_TOP) / FEATHER_V);
  // Everything at this row that is NOT water, as merged [u0,u1] intervals.
  const gaps = waterGaps(v);
  for (let x = 0; x < W; x += 1) {
    const u = x / W;
    // Distance out of the nearest non-water interval.
    let d = Infinity;
    for (const [g0, g1] of gaps) {
      const dd = u < g0 ? g0 - u : u > g1 ? u - g1 : -1;
      if (dd < 0) {
        d = -1;
        break;
      }
      if (dd < d) d = dd;
    }
    if (d < 0) continue; // on the causeway or a post: plate only
    const uRamp = Math.min(1, d / FEATHER_U);
    // Outer frame edges: fade the lake out before it reaches the banks.
    const edge = Math.min(1, Math.min(u, 1 - u) / 0.05);
    const gh = ghostBlur[y * W + x];
    const ghostOk =
      gh <= GHOST_LO ? 1 : gh >= GHOST_HI ? 0 : 1 - (gh - GHOST_LO) / (GHOST_HI - GHOST_LO);
    mask[y * W + x] = Math.round(255 * vRamp * uRamp * edge * ghostOk);
  }
}
await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
  .png()
  .toFile(`${S}/water-mask.png`);
const covered = mask.reduce((n, m) => n + (m > 8 ? 1 : 0), 0);
console.log(`mask covers ${((100 * covered) / (W * H)).toFixed(1)}% of frame`);

// ── 4. plate exposure reference ─────────────────────────────────────────────
const maskedMean = (rgb) => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < W * H; i += 1) {
    if (mask[i] < 200) continue;
    s += lum(rgb, i);
    n += 1;
  }
  return s / n;
};
const plateMean = maskedMean(plate);
console.log(`plate masked mean luminance: ${plateMean.toFixed(2)}`);

// ── 5. flame windows ────────────────────────────────────────────────────────
// A window per lantern, cut to the rig's own FIRE_BOX — the same box the
// fallback shader warps, so the two tiers cannot disagree about where a flame
// is. Deliberately NOT the measured flame box: FIRE_BOX is wider, which means
// the window also carries the glazing bars either side of the flame, and that
// turns out to be what makes the de-drift below safe (§ 6.1).
//
// The windows live INSIDE the post keep-outs, where the water mask is zero, so
// the two regions never touch the same pixel and each can run its own clock.
// Sampling margin: the de-drift shift below reads from PAD pixels outside the
// window, so PAD must exceed the largest walk the model performs. Measured at
// 51 px on the near pair, which is most of a lantern's own width — the first
// run of this bake used 44 and clamped, smearing the window's edge column
// across the flame. Asserted after tracking rather than trusted.
const PAD = 96;
const sources = flameSources();
const flames = sources.map((s) => {
  const cx = s.u * W;
  const cy = s.v * H;
  const rx = (s.r / IW) * W;
  const ry = (s.r / IH) * H;
  const wx = rx * FIRE_BOX.half;
  const wyTop = ry * FIRE_BOX.top;
  const wyBot = ry * FIRE_BOX.bottom;
  const x0 = Math.max(0, Math.floor(cx - wx - PAD));
  const x1 = Math.min(W - 1, Math.ceil(cx + wx + PAD));
  const y0 = Math.max(0, Math.floor(cy - wyTop - PAD));
  const y1 = Math.min(H - 1, Math.ceil(cy + wyBot + PAD));
  return { s, cx, cy, rx, ry, x0, y0, x1, y1, rw: x1 - x0 + 1, rh: y1 - y0 + 1 };
});

// Window alpha in frame space, from the rig's shared box function.
const winAlpha = new Float32Array(W * H);
for (const f of flames) {
  for (let y = f.y0; y <= f.y1; y += 1)
    for (let x = f.x0; x <= f.x1; x += 1) {
      const a = fireBoxAlpha((x + 0.5 - f.cx) / f.rx, (f.cy - y - 0.5) / f.ry);
      const i = y * W + x;
      if (a > winAlpha[i]) winAlpha[i] = a;
    }
}
{
  let n = 0;
  for (let i = 0; i < W * H; i += 1) if (winAlpha[i] > 0.004) n += 1;
  console.log(
    `${flames.length} flame windows, covering ${((100 * n) / (W * H)).toFixed(3)}% of frame`,
  );
}

// Per-frame patches, cropped to each window's padded region. Tiny next to a
// frame, which is what lets every frame's flames be held in memory at once —
// the schedules below need random access to source frames, and re-decoding
// 1920x1080 PNGs for each would dominate the run.
const patches = flames.map(() => []);
// Per-frame exposure gain, captured here because this pass already decodes
// every frame. It is the same number the water composite applies, and the
// flames need it just as much: the clip ramps the WHOLE frame's exposure as it
// runs (+16 luma in the sky over 5s), so an un-normalised flame window brightens
// steadily through the loop and drops back at the wrap. That showed up as the
// seam cost growing with loop length — 22x a natural frame step at 4s against
// 5x at 1s, on a clip whose fire is identical throughout.
const frameGain = [];
for (let i = 0; i < N; i += 1) {
  const raw = await gradedFrame(i);
  frameGain.push(plateMean / maskedMean(raw));
  for (let k = 0; k < flames.length; k += 1) {
    const f = flames[k];
    const buf = Buffer.alloc(f.rw * f.rh * 3);
    for (let y = 0; y < f.rh; y += 1)
      for (let x = 0; x < f.rw; x += 1) {
        const si = ((f.y0 + y) * W + (f.x0 + x)) * 3;
        const di = (y * f.rw + x) * 3;
        buf[di] = raw[si];
        buf[di + 1] = raw[si + 1];
        buf[di + 2] = raw[si + 2];
      }
    patches[k].push(buf);
  }
}
console.log(`flame patches captured for ${N} frames`);

// The flames take the RAMP out of that gain, not the level. The water's gain
// matches the clip's lake to the plate's lake, and the lake is dark (mean
// luminance 20.5), so it lands around 0.65 — applying it whole dimmed every
// flame by a third, which the per-source level match below then had to undo,
// clamping at its ceiling on five of the eleven. Dividing by its own mean
// leaves exactly the temporal drift, which is the part the flames actually
// share with the water, and lets the level match do its own job.
const gainMean = frameGain.reduce((a, b) => a + b, 0) / N;
const flameExposure = frameGain.map((g) => g / gainMean);
console.log(
  `exposure ramp across the clip: ${(100 * (Math.max(...flameExposure) - Math.min(...flameExposure))).toFixed(1)}%`,
);

// ── 6. what the flames need that the water does not ─────────────────────────
//
// 6.1 DE-DRIFT. The model holds the small post lanterns still (hot-core offset
// from the plate: mean 1.1-3.6 px over the clip) but WALKS the two foreground
// ones — 2 px at frame 24, 15 px by frame 60, 30 px by frame 96 — and the whole
// housing goes with them. Composited raw, that reads as the bridge's lanterns
// sliding sideways, which is the exact failure the post keep-outs were cut to
// prevent.
//
// The walk is removable because it is SLOW and the fire is FAST: they separate
// in time. A +/-12 frame moving average of the offset IS the walk, and
// subtracting it re-registers the flame on the wick the plate photographed
// while leaving the flicker — the only motion anyone came for — untouched.
// Measured over frames 0-95, mean offset falls 13.2 -> 1.4 px and 14.8 -> 2.6
// px on the near pair, and the posts, which were already fine, go to 0.1-0.7.
// The residual is the flame's own dance, and it is supposed to be there.
//
// It also fixes the glazing bars for free: the bars drifted WITH the housing,
// so shifting the window back puts them where the plate's bars are. That is why
// the window is FIRE_BOX-wide rather than cut to the flame — a narrow window
// would have had nothing in it to prove the registration by.
//
// 6.2 A SEPARATE LOOP. The water's 1s crossfade closes its loop by dissolving
// the tail into the head. On water that is invisible (no rigid structure for a
// blend to smear); on fire it is the "candles fade out and rebuild themselves"
// artefact find-loop-point.mjs was written to kill — for a whole second the
// flame is a double exposure of two states. Flames get a 6-frame fade instead,
// which find-loop-point.mjs measured as below the threshold where the eye reads
// structure changing.
//
// 6.3 A SEPARATE RANGE. The near pair does not merely drift, it dies: warm
// energy relative to the plate holds at 1.3-1.7 until frame ~72, then falls
// 0.90, 0.62, 0.48, 0.06. Those frames are unusable at any registration. The
// posts are healthy for all 121. One shared range would throw away good post
// frames to protect the near pair, so each group gets its own loop length — the
// windows are disjoint, so nothing couples them.
const HALF = 12; // +/- half a second, the de-drift averaging window
const MASS_COLLAPSE = 0.55; // fraction of a flame's OWN median that reads as out

// Warm-and-bright energy and its centroid, over a BOX inside a patch. The same
// yellow-white test .measure-flames.mjs settled on, which passes the flame and
// rejects the dull amber of the lit housing.
//
// The box matters as much as the test. Measuring over the whole padded patch —
// which the first run of this bake did — reports every flame as healthy for all
// 121 frames, because the padding reaches out into water and stone whose warm
// energy never changes and swamps the flame's. The near pair, which visibly go
// out, came back at 0.88 of their own median. The box below is cut to the flame
// and FOLLOWED frame to frame instead.
const hot = (buf, f, cx, cy, hx, hyTop, hyBot) => {
  const x0 = Math.max(0, Math.floor(cx - hx));
  const x1 = Math.min(f.rw - 1, Math.ceil(cx + hx));
  const y0 = Math.max(0, Math.floor(cy - hyTop));
  const y1 = Math.min(f.rh - 1, Math.ceil(cy + hyBot));
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let y = y0; y <= y1; y += 1)
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * f.rw + x) * 3;
      const r = buf[i];
      const g = buf[i + 1];
      const b = buf[i + 2];
      const w = Math.max(0, Math.min(r, g) - 150) * Math.max(0, r - b);
      if (w <= 0) continue;
      sx += x * w;
      sy += y * w;
      sw += w;
    }
  return { x: sw ? sx / sw : cx, y: sw ? sy / sw : cy, mass: sw };
};

const platePatch = flames.map((f) => {
  const buf = Buffer.alloc(f.rw * f.rh * 3);
  for (let y = 0; y < f.rh; y += 1)
    for (let x = 0; x < f.rw; x += 1) {
      const si = ((f.y0 + y) * W + (f.x0 + x)) * 3;
      const di = (y * f.rw + x) * 3;
      buf[di] = plate[si];
      buf[di + 1] = plate[si + 1];
      buf[di + 2] = plate[si + 2];
    }
  return buf;
});

const track = flames.map((f, k) => {
  // Tight measuring box, a quarter wider than the window itself so the flame
  // has somewhere to lean without falling out of its own tracker.
  const hx = f.rx * (FIRE_BOX.half + FIRE_BOX.feather) * 1.25;
  const hyTop = f.ry * (FIRE_BOX.top + FIRE_BOX.feather) * 1.25;
  const hyBot = f.ry * (FIRE_BOX.bottom + FIRE_BOX.feather) * 1.25;
  const base = hot(platePatch[k], f, f.cx - f.x0, f.cy - f.y0, hx, hyTop, hyBot);

  // FOLLOWED, not fixed. The model walks the near lanterns most of their own
  // width, so a box pinned to the plate's flame loses them halfway through the
  // clip and reports the walk saturating and the fire dying — two artefacts of
  // the measurement, not of the clip. Re-centring on the previous frame tracks
  // the real thing, and because the step between frames is small the box never
  // has the chance to latch onto a neighbouring light.
  let px = base.x;
  let py = base.y;
  const raw = patches[k].map((p) => {
    const h = hot(p, f, px, py, hx, hyTop, hyBot);
    // A guttered frame has no centroid worth believing; hold position so the
    // tracker is still pointing at the wick when the flame comes back.
    if (h.mass > 0.15 * base.mass) {
      px = h.x;
      py = h.y;
    }
    return { dx: px - base.x, dy: py - base.y, m: base.mass ? h.mass / base.mass : 1 };
  });
  // Smoothed offset = the walk. Guttered frames carry a meaningless centroid,
  // so they are kept out of the average rather than dragging it toward noise.
  const off = raw.map((_, i) => {
    let sx = 0;
    let sy = 0;
    let c = 0;
    for (let j = Math.max(0, i - HALF); j <= Math.min(N - 1, i + HALF); j += 1) {
      if (raw[j].m < 0.5) continue;
      sx += raw[j].dx;
      sy += raw[j].dy;
      c += 1;
    }
    return c ? { dx: sx / c, dy: sy / c } : { dx: 0, dy: 0 };
  });
  // Last frame from which this flame is still burning honestly.
  //
  // Judged on SMOOTHED energy, RELATIVE TO THIS FLAME'S OWN median — not to the
  // plate's. Two things go wrong with an absolute ratio, and the first run of
  // this bake hit both: a real flame dips constantly, so any fixed floor cuts
  // the loop the first time the fire flickered; and the model simply draws the
  // small posts at a different brightness from the photograph, so a
  // plate-relative floor condemned flames that burn perfectly for all 121
  // frames (one was cut at frame 44, another rejected outright) while passing
  // the two that genuinely die. Guttering is a COLLAPSE — the near pair fall to
  // 4% of their own average — and only a self-relative test names it.
  const ms = raw.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - HALF); j <= Math.min(N - 1, i + HALF); j += 1) {
      s += raw[j].m;
      c += 1;
    }
    return s / c;
  });
  const med = [...ms].sort((a, b) => a - b)[Math.floor(N / 2)];
  let good = N - 1;
  for (let i = 0; i < N; i += 1) {
    if (ms[i] < MASS_COLLAPSE * med) {
      good = i - 1;
      break;
    }
  }
  return { raw, off, good, ms, med };
});
let worstWalk = 0;
for (let k = 0; k < flames.length; k += 1) {
  const walk = Math.max(...track[k].off.map((o) => Math.hypot(o.dx, o.dy)));
  if (walk > worstWalk) worstWalk = walk;
  console.log(
    `  flame ${flames[k].s.i} r=${flames[k].s.r}  usable 0..${track[k].good}  ` +
      `walk ${walk.toFixed(1)}px  energy ` +
      track[k].ms
        .map((m, i) => (i % 12 === 0 ? (m / track[k].med).toFixed(2) : null))
        .filter(Boolean)
        .join(' '),
  );
}
// The de-drift reads PAD pixels outside the window; if the walk exceeds that,
// `sample` clamps and smears the edge column across the flame instead of
// failing, which is the kind of bug that only shows as "the fire looks wrong".
if (worstWalk + 4 > PAD) {
  throw new Error(`walk ${worstWalk.toFixed(1)}px exceeds PAD ${PAD} — raise PAD`);
}

// Bilinear sample of a patch, shifted so the flame lands where the plate's is.
const sample = (buf, f, x, y) => {
  const cx = Math.min(f.rw - 1.001, Math.max(0, x));
  const cy = Math.min(f.rh - 1.001, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const fx = cx - x0;
  const fy = cy - y0;
  const i00 = (y0 * f.rw + x0) * 3;
  const i10 = i00 + 3;
  const i01 = i00 + f.rw * 3;
  const i11 = i01 + 3;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const a = buf[i00 + c] * (1 - fx) + buf[i10 + c] * fx;
    const b = buf[i01 + c] * (1 - fx) + buf[i11 + c] * fx;
    out[c] = a * (1 - fy) + b * fy;
  }
  return out;
};

// A de-drifted patch for source frame `a`, as a plain RGB buffer in patch
// space. Everything downstream works on these, so the drift correction exists
// in exactly one place. Memoised because the seam search below asks for the
// same handful of frames once per candidate start — there are only
// sources x frames distinct answers, and they are small.
const regCache = new Map();
const registered = (k, a) => {
  const key = k * 4096 + a;
  const hit = regCache.get(key);
  if (hit) return hit;
  const f = flames[k];
  const { dx, dy } = track[k].off[a];
  const eg = flameExposure[a];
  const buf = Buffer.alloc(f.rw * f.rh * 3);
  for (let y = 0; y < f.rh; y += 1)
    for (let x = 0; x < f.rw; x += 1) {
      const [r, g, b] = sample(patches[k][a], f, x + dx, y + dy);
      const di = (y * f.rw + x) * 3;
      buf[di] = Math.min(255, r * eg);
      buf[di + 1] = Math.min(255, g * eg);
      buf[di + 2] = Math.min(255, b * eg);
    }
  regCache.set(key, buf);
  return buf;
};

// ── 6.4 the loop for each flame ─────────────────────────────────────────────
// Length must DIVIDE M or the flame jumps at the video's own wrap; the largest
// that fits the usable range wins, because repetition is itself a tell.
const FLAME_FADE = 8;
const LENGTHS = [96, 48, 32, 24]; // longest first: the choice below prefers length

// Seam cost for starting a loop of length L at ts: how far apart the fade's two
// ends are, in appearance and in direction of travel. Same scoring as
// find-loop-point.mjs, restricted to this window.
const seamCost = (k, ts, L) => {
  const f = flames[k];
  let app = 0;
  let mot = 0;
  for (let j = 0; j < FLAME_FADE; j += 1) {
    const a = registered(k, ts + j);
    const b = registered(k, ts + L + j);
    const aPrev = registered(k, ts + j + 1);
    const bPrev = registered(k, ts + L + j + 1);
    for (let p = 0; p < f.rw * f.rh; p += 1) {
      const la = lum(a, p);
      const lb = lum(b, p);
      app += (la - lb) ** 2;
      const da = lum(aPrev, p) - la;
      const db = lum(bPrev, p) - lb;
      mot += (da - db) ** 2;
    }
  }
  const px = f.rw * f.rh * FLAME_FADE;
  return { app: app / px, mot: mot / px, score: app / px + 0.5 * (mot / px) };
};

// What one ordinary frame step costs inside this window — the number that makes
// a seam score mean something. On its own a seam score is uninterpretable,
// because a shorter loop always scores better simply by offering the search
// more places to cut: measured here, cost falls geometrically with length
// (23x a natural step at 4s, 4x at 1s on the largest flame) with no change in
// the clip whatsoever. Scoring seam against length therefore just slides to the
// shortest option — a soft 8%-per-second penalty put every flame on a 1s loop,
// which is precisely the repetition this is meant to avoid.
const naturalStep = (k) => {
  const f = flames[k];
  let s = 0;
  for (let i = 1; i < N; i += 1) {
    const a = registered(k, i - 1);
    const b = registered(k, i);
    for (let p = 0; p < f.rw * f.rh; p += 1) s += (lum(a, p) - lum(b, p)) ** 2;
  }
  return s / (f.rw * f.rh * (N - 1));
};

// The seam a fade of FLAME_FADE frames can absorb. Over F frames each frame
// moves 1/F of the way across the mismatch, so the wrap asks the picture to
// move no faster than it already does once the seam is within what the clip
// itself covers in F frames. Both sides are mean SQUARED differences, hence the
// square: RMS_seam / F <= RMS_natural.
const absorbable = (natural) => natural * FLAME_FADE * FLAME_FADE;

// How far this frame's flame is from the PLATE's, in shape alone.
//
// The still is on screen until the clip paints, and outside the two masks the
// two are identical by construction — so the swap can only show at the flames,
// where the plate's frozen fire gives way to the clip's. Measured on the first
// build, that step was 15-70 RMS against a normal frame step of 0.7-18: once
// per page load, but real.
//
// Level is excluded deliberately (both sides are scaled to their own window
// mean) because the per-source gain below already matches it. What is left is
// the only part the loop start can do anything about: which flame SHAPE the
// clip happens to be showing when it starts.
const swapCost = (k, a) => {
  const f = flames[k];
  const buf = registered(k, a);
  let mp = 0;
  let mv = 0;
  let n = 0;
  for (let y = 0; y < f.rh; y += 1)
    for (let x = 0; x < f.rw; x += 1) {
      if (winAlpha[(f.y0 + y) * W + (f.x0 + x)] < 0.5) continue;
      mp += lum(plate, (f.y0 + y) * W + (f.x0 + x));
      mv += lum(buf, y * f.rw + x);
      n += 1;
    }
  if (!n || !mv) return 0;
  const k2 = mp / mv;
  let s = 0;
  for (let y = 0; y < f.rh; y += 1)
    for (let x = 0; x < f.rw; x += 1) {
      if (winAlpha[(f.y0 + y) * W + (f.x0 + x)] < 0.5) continue;
      s += (lum(plate, (f.y0 + y) * W + (f.x0 + x)) - lum(buf, y * f.rw + x) * k2) ** 2;
    }
  return s / n;
};

const plans = flames.map((f, k) => {
  const good = track[k].good;
  const natural = naturalStep(k);
  const budget = absorbable(natural);
  let best = null;
  let shortest = null;
  const byLength = [];
  for (const L of LENGTHS) {
    // The fade reads one frame past its own end (the motion term), so the last
    // source frame a plan touches is ts + L + FLAME_FADE.
    if (L > M || M % L !== 0 || L + FLAME_FADE >= good) continue;
    let atL = null;
    for (let ts = 0; ts <= good - L - FLAME_FADE; ts += 1) {
      const c = seamCost(k, ts, L);
      if (!atL || c.score < atL.score) atL = { ts, L, ...c };
    }
    if (!atL) continue;
    byLength.push(atL);
    // LENGTHS runs longest first, so the first length inside budget wins, and
    // within a length the lowest seam wins outright.
    //
    // Spending the slack under the budget on the still-to-video swap instead
    // was tried and reverted. It is the wrong trade twice over: the seam
    // recurs every 2-4s for as long as the page is open while the swap happens
    // once, and it bought almost nothing anyway — an i2v pass re-renders fine
    // detail everywhere (27 dB PSNR against the image it was fed, measured on
    // the /projects clip), so NO frame closely matches the photograph and the
    // choice of start barely moves the swap. It did push seams from comfortable
    // margins to the budget edge (112.7 of 114, 122.3 of 123). The swap is
    // handled where it belongs instead: the plate's own flames are re-baked
    // from this loop's first frame (§ 9), the same reason /projects rebuilds
    // its poster from the loop rather than from the source still.
    if (!best && atL.app <= budget) best = atL;
    shortest = atL;
  }
  // Nothing clears the budget: take the shortest loop on offer, which is the
  // best seam available, and say so rather than shipping a wrap that jumps.
  if (!best && shortest) {
    console.log(`  flame ${f.s.i}: NO length within budget — falling back to ${shortest.L}`);
    best = shortest;
  }
  if (!best) return null;
  console.log(
    `  flame ${f.s.i}: loop ${best.L} frames (${(best.L / FPS).toFixed(2)}s) from ${best.ts}, ` +
      `seam app ${best.app.toFixed(1)} of ${budget.toFixed(0)} budget ` +
      `(natural step ${natural.toFixed(1)}), swap RMS ` +
      `${Math.sqrt(best.swap ?? swapCost(k, best.ts + best.L)).toFixed(1)}` +
      (process.env.PROBE
        ? `   [${byLength.map((b) => `${b.L}:${b.app.toFixed(0)}`).join(' ')}]`
        : ''),
  );
  return best;
});

// Per-source gain, so the lantern's AVERAGE brightness over the loop is the
// plate's. The model burns the near pair 1.3-1.7x hotter than the photograph,
// and left alone the hero would visibly brighten at those two lanterns the
// instant the video started — the still-to-video swap has to be invisible.
// Only the average is matched: the flicker around it is the whole point.
const gains = flames.map((f, k) => {
  const plan = plans[k];
  if (!plan) return 1;
  let want = 0;
  let got = 0;
  let n = 0;
  for (let j = 0; j < plan.L; j += 1) {
    const buf = registered(k, plan.ts + j);
    for (let y = 0; y < f.rh; y += 1)
      for (let x = 0; x < f.rw; x += 1) {
        const a = winAlpha[(f.y0 + y) * W + (f.x0 + x)];
        if (a < 0.5) continue;
        want += lum(plate, (f.y0 + y) * W + (f.x0 + x));
        got += lum(buf, y * f.rw + x);
        n += 1;
      }
  }
  const g = n ? Math.min(1.6, Math.max(0.5, want / got)) : 1;
  console.log(`  flame ${f.s.i}: gain ${g.toFixed(3)}`);
  return g;
});

// PROBE=1 stops here: everything above is the analysis that decides how each
// flame is cut, and iterating on it should not cost a composite and two encodes.
if (process.env.PROBE) {
  console.log('PROBE: stopping before the composite');
  process.exit(0);
}

// The window's contribution to output frame i, already de-drifted, gained and
// loop-closed. Returns null when this source has no workable plan, in which
// case the plate's own flame is simply left alone.
const flameFrame = (k, i) => {
  const plan = plans[k];
  if (!plan) return null;
  const f = flames[k];
  const j = i % plan.L;
  const head = registered(k, plan.ts + j);
  if (j >= FLAME_FADE) return head;
  // Same construction the water uses: the first FLAME_FADE frames blend the
  // continuation into the head, so out[L-1] -> out[0] are two CONSECUTIVE
  // source frames and the wrap is exact rather than merely smooth.
  const tail = registered(k, plan.ts + plan.L + j);
  const w = j / FLAME_FADE;
  const buf = Buffer.alloc(head.length);
  for (let p = 0; p < head.length; p += 1) buf[p] = Math.round(head[p] * w + tail[p] * (1 - w));
  return buf;
};

// ── 7. composite ───────────────────────────────────────────────────────────
// Per-frame gain normalises the clip's exposure ramp (+16 in the sky over 5s)
// to the plate's own level INSIDE the mask. That does double duty: it removes
// the drift, and it guarantees the composite matches the plate exactly at the
// mask boundary, which is what makes the feather invisible rather than merely
// soft.
//
// The blend is done by hand on raw buffers rather than with sharp's
// `composite`. Two attempts through the library failed in ways only visible by
// inspecting pixels: compositing an RGBA input silently produced a 4-channel
// raw output that later reads interpreted as 3-channel (frames came out grey
// and horizontally tiled), and once that was fixed, the alpha added by
// `joinChannel` was not honoured by `composite` at all — measured against the
// plate, the "masked" output differed by mean 35.3 OUTSIDE the mask and only
// 20.2 inside, i.e. exactly backwards. A per-pixel lerp has no hidden channel
// semantics to get wrong and can be asserted on.
const water = async (i) => {
  const raw = await gradedFrame(i);
  const gain = frameGain[i];
  const out = Buffer.alloc(W * H * 3);
  for (let p = 0; p < W * H; p += 1) {
    const a = mask[p] / 255;
    const o = p * 3;
    if (a === 0) {
      out[o] = plate[o];
      out[o + 1] = plate[o + 1];
      out[o + 2] = plate[o + 2];
      continue;
    }
    for (let c = 0; c < 3; c += 1) {
      const pv = plate[o + c];
      const vv = Math.min(255, raw[o + c] * gain);
      out[o + c] = (pv + (vv - pv) * a) | 0;
    }
  }
  return out;
};

console.log(`compositing ${M} output frames (${(M / FPS).toFixed(2)}s)`);
let leak = 0;
let frameZero = null;
for (let i = 0; i < M; i += 1) {
  // Water first, including its own loop close: the first FADE frames blend the
  // tail into the head, so out[M-1] -> out[0] are two consecutive source frames
  // and the wrap is exact by construction — the reason this is done here rather
  // than with ffmpeg's xfade, whose transition never completes and which wedges
  // at EOF. A crossfade is safe for the lake in a way it is not for the flames:
  // this region differs from the plate only inside water, and water has no
  // rigid structure for a blend to smear.
  const buf = await water(i);
  if (i < FADE) {
    const tail = await water(i + M);
    const w = i / FADE; // 0 -> 1 : tail fades out, head fades in
    for (let p = 0; p < buf.length; p += 1) buf[p] = Math.round(buf[p] * w + tail[p] * (1 - w));
  }

  // Then the flames, on their own clocks. They land inside the post keep-outs,
  // where the water mask is zero and `buf` is still exactly the plate.
  for (let k = 0; k < flames.length; k += 1) {
    const patch = flameFrame(k, i);
    if (!patch) continue;
    const f = flames[k];
    const g = gains[k];
    for (let y = 0; y < f.rh; y += 1)
      for (let x = 0; x < f.rw; x += 1) {
        const a = winAlpha[(f.y0 + y) * W + (f.x0 + x)];
        if (a < 0.004) continue;
        const di = ((f.y0 + y) * W + (f.x0 + x)) * 3;
        const si = (y * f.rw + x) * 3;
        for (let c = 0; c < 3; c += 1) {
          const vv = Math.min(255, patch[si + c] * g);
          buf[di + c] = (buf[di + c] + (vv - buf[di + c]) * a) | 0;
        }
      }
  }

  // Assert the invariant the whole approach rests on: outside BOTH regions the
  // composite must be the plate, byte for byte. If this ever drifts, the video
  // tier is showing generated geometry and the causeway will swim again.
  if (i === Math.floor(M / 2)) {
    for (let p = 0; p < W * H; p += 1) {
      if (mask[p] !== 0 || winAlpha[p] > 0) continue;
      const o = p * 3;
      for (let c = 0; c < 3; c += 1) {
        const d = Math.abs(buf[o + c] - plate[o + c]);
        if (d > leak) leak = d;
      }
    }
    if (leak !== 0) throw new Error(`mask leak: ${leak} outside water+flames (must be 0)`);
    console.log('invariant holds: outside the mask the composite is the plate, exactly');
  }

  // Frame 0 is what the still has to agree with, so keep it BEFORE the opacity
  // multiply: the plate is painted at CSS opacity 0.9, this carries the same
  // 0.9 baked in, and § 9 has to compare like with like.
  if (i === 0) frameZero = Buffer.from(buf);

  // Carry the still's own opacity (see PLATE_OPACITY above). Applied last so
  // the invariant above compares like with like.
  for (let q = 0; q < buf.length; q += 1) buf[q] = (buf[q] * PLATE_OPACITY) | 0;

  await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 1 })
    .toFile(`${OUT}/o${String(i).padStart(4, '0')}.png`);
  if (i % 24 === 0) console.log(`  frame ${i}/${M}`);
}

// ── 8. encode the ladder ────────────────────────────────────────────────────
// Flat QP (ipratio/pbratio 1.0, scenecut off): x264's defaults give the loop's
// first frame — always an IDR — a lower QP than the frame before it, so the
// picture visibly sharpens on every restart with no content behind it. That
// artefact was diagnosed on the /projects loop and the fix carries over.
const X264 = ['-x264-params', 'ipratio=1.0:pbratio=1.0:scenecut=0'];
for (const [name, w] of [
  ['causeway-720', 1280],
  ['causeway-1080', 1920],
]) {
  const dest = `public/background/${name}.mp4`;
  sh([
    '-v', 'error', '-y',
    '-framerate', String(FPS),
    '-i', `${OUT}/o%04d.png`,
    '-vf', `scale=${w}:-2`,
    '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '20',
    ...X264,
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
    dest,
  ]);
  console.log(`wrote ${dest}`);
}

// ── 9. the plate's own flames ───────────────────────────────────────────────
// The still is what the page paints until the clip is decoded and running, and
// outside the two masks the two are identical by construction — so the swap
// from one to the other can only show at the flames, where the plate's frozen
// fire gives way to the clip's. Measured on the first build with flames, that
// step was 15-70 RMS against a normal frame step of 0.7-18: once per load, but
// real, and a regression, because before this change neither layer's flames
// moved and the two agreed everywhere.
//
// It cannot be tuned away by choosing where each loop starts (tried, reverted —
// see the plans block): an i2v pass re-renders fine detail across the whole
// frame, so no frame of the clip closely matches the photograph. /projects hit
// exactly this and answered it the other way round — "the poster IS this clip's
// own first frame" — and the same answer works here, confined to the windows:
// give the PLATE the loop's frame-0 flames, and the two agree by construction.
//
// Everything outside the windows stays the photograph, so the rig's measured
// coordinates, the ignite and the scrim are all untouched. Written at the
// plate's native 2560x1440 (the rig's own space), with the windows upsampled
// from the working frame — which is what the browser will show anyway, since
// the video tops out at 1920.
{
  const flamesUp = await sharp(frameZero, { raw: { width: W, height: H, channels: 3 } })
    .resize(IW, IH)
    .raw()
    .toBuffer();
  const full = await gradedPlate(IW, IH).raw().toBuffer();
  let changed = 0;
  for (const s of sources) {
    const cx = s.u * IW;
    const cy = s.v * IH;
    const x0 = Math.max(0, Math.floor(cx - s.r * (FIRE_BOX.half + FIRE_BOX.feather)));
    const x1 = Math.min(IW - 1, Math.ceil(cx + s.r * (FIRE_BOX.half + FIRE_BOX.feather)));
    const y0 = Math.max(0, Math.floor(cy - s.r * (FIRE_BOX.top + FIRE_BOX.feather)));
    const y1 = Math.min(IH - 1, Math.ceil(cy + s.r * (FIRE_BOX.bottom + FIRE_BOX.feather)));
    for (let y = y0; y <= y1; y += 1)
      for (let x = x0; x <= x1; x += 1) {
        const a = fireBoxAlpha((x + 0.5 - cx) / s.r, (cy - y - 0.5) / s.r);
        if (a < 0.004) continue;
        const o = (y * IW + x) * 3;
        for (let c = 0; c < 3; c += 1) {
          // No opacity conversion, deliberately. `frameZero` is captured BEFORE
          // the composite's PLATE_OPACITY multiply, which is exactly the space
          // the plate lives in: the encode applies the 0.9 to the video, CSS
          // applies it to the still. Dividing here as well — which the first cut
          // did — leaves the plate 11% hot in the windows, so the flames dim the
          // instant the clip takes over. Measured at 146 against the video's
          // 131 where the window is fully opaque.
          full[o + c] = (full[o + c] + (flamesUp[o + c] - full[o + c]) * a) | 0;
        }
        changed += 1;
      }
  }
  // Same quality and effort bake-home-grade.mjs uses, and the same write-then-
  // copy: sharp cannot read and write one path in a single pipeline, and the
  // fallback branch above may have read this very file.
  await sharp(full, { raw: { width: IW, height: IH, channels: 3 } })
    .webp({ quality: 86, effort: 5 })
    .toFile(`${PLATE_LIVE}.tmp`);
  await copyFile(`${PLATE_LIVE}.tmp`, PLATE_LIVE);
  rmSync(`${PLATE_LIVE}.tmp`, { force: true });
  console.log(
    `wrote ${PLATE_LIVE} — graded plate + the loop's frame-0 flames ` +
      `(${((100 * changed) / (IW * IH)).toFixed(3)}% of pixels)`,
  );
}

// Poster = the loop's own first frame, so the still and the video's frame 0
// agree by construction and the swap cannot pop.
await sharp(`${OUT}/o0000.png`).webp({ quality: 82, effort: 6 }).toFile(`${S}/causeway-poster.webp`);
writeFileSync(`${S}/bake-done.txt`, 'ok');
console.log('done');
