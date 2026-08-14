// The homepage scene's light rig — the ONE source of truth shared by
// HomeSceneGlow (ambient flicker) and HomePathIgnite (the arrival moment).
//
// SceneEmbers' coordinates were eyeballed off the workshop artwork, which is
// fine for candles scattered across a room. It is not fine here: the causeway's
// lanterns sit on a perspective line whose spacing collapses toward the
// vanishing point, and the ignite runs a wavefront along exactly that line — so
// a few px of drift near the horizon would show as the spark missing its
// lanterns. These coordinates were therefore MEASURED off the shipped plate by
// detect-lights.mjs (warmth-thresholded blob detection with a flame-core test,
// which rejects wet-stone specular and water smear), not authored by hand.
//
// Two components animate this rig, so it lives in one module. There is no
// second copy to drift out of sync — the same rule SceneSealIgnite states about
// sharing .projects-backdrop with the still.

// home-hero.webp's intrinsic space. Every u,v below is a fraction of this
// frame; every radius is px in this frame, scaled on draw.
export const IW = 2560;
export const IH = 1440;

// Measured flames, near → far. `r` is the detected flame core in plate px;
// `g` is the authored GLOW radius (a flame's light spills far wider than the
// flame itself, and that spill is what the eye reads as brightness).
//
// `k` picks flicker character, following SceneEmbers' vocabulary:
//   lantern — enclosed, breathes slowly, never guttes to nothing
//   post    — the causeway posts: smaller, quicker, still enclosed
//   far     — the unresolvable cluster at the vanishing point; it is really
//             many lanterns averaged, so it only shimmers, never flickers
export const LANTERNS = [
  { k: 'lantern', u: 0.8303, v: 0.6604, r: 42, g: 150, a: 0.17, s: 1.0, c: '255,186,104' },
  { k: 'lantern', u: 0.1803, v: 0.6491, r: 42, g: 150, a: 0.17, s: 0.9, c: '255,186,104' },
  { k: 'post', u: 0.6689, v: 0.5882, r: 20, g: 82, a: 0.14, s: 1.6, c: '255,176,96' },
  { k: 'post', u: 0.3789, v: 0.581, r: 18, g: 78, a: 0.14, s: 1.5, c: '255,176,96' },
  { k: 'post', u: 0.6101, v: 0.5597, r: 12, g: 58, a: 0.12, s: 1.8, c: '255,176,96' },
  { k: 'post', u: 0.4241, v: 0.553, r: 10, g: 54, a: 0.12, s: 1.7, c: '255,176,96' },
  { k: 'post', u: 0.5926, v: 0.5459, r: 10, g: 48, a: 0.11, s: 1.9, c: '255,176,96' },
  { k: 'post', u: 0.5805, v: 0.5417, r: 8, g: 42, a: 0.1, s: 2.1, c: '255,176,96' },
  { k: 'post', u: 0.4465, v: 0.5403, r: 8, g: 42, a: 0.1, s: 2.0, c: '255,176,96' },
  { k: 'post', u: 0.5691, v: 0.5351, r: 8, g: 38, a: 0.1, s: 2.2, c: '255,176,96' },
  { k: 'post', u: 0.4591, v: 0.5326, r: 8, g: 38, a: 0.1, s: 1.85, c: '255,176,96' },
  { k: 'post', u: 0.5611, v: 0.5289, r: 6, g: 34, a: 0.09, s: 2.3, c: '255,176,96' },
  { k: 'post', u: 0.4695, v: 0.525, r: 6, g: 34, a: 0.09, s: 2.15, c: '255,176,96' },
  { k: 'far', u: 0.5373, v: 0.5074, r: 46, g: 120, a: 0.13, s: 0.6, c: '255,200,136' },
  { k: 'far', u: 0.4945, v: 0.5046, r: 44, g: 118, a: 0.13, s: 0.55, c: '255,200,136' },
];

// The lanterns' doubles in the water. These are NOT detected — a reflection
// never reaches the flame-core clip the detector keys on, by definition — so
// they are authored from the two foreground lanterns that visibly reflect,
// plus one faint band where the far rows meet the waterline. `y` is the
// vertical stretch: still water smears a point light downward, and drawing
// them round is the single thing that would make this read as pasted-on.
export const REFLECTIONS = [
  { u: 0.8303, v: 0.78, g: 120, y: 3.0, a: 0.075, s: 1.35, c: '255,170,92' },
  { u: 0.1803, v: 0.77, g: 120, y: 3.0, a: 0.075, s: 1.2, c: '255,170,92' },
  { u: 0.5155, v: 0.532, g: 150, y: 1.7, a: 0.045, s: 0.8, c: '255,196,140' },
];

// The cold counterweight. Every other layer in this system adds warm light;
// the causeway's depth comes from the COLD mist at the vanishing point, and
// letting it breathe very slightly on its own axis is what stops the scene
// reading as "an orange effect over a blue picture".
export const MIST = { u: 0.5155, v: 0.508, g: 420, a: 0.05, s: 0.28, c: '150,198,236' };

// ── Depth ───────────────────────────────────────────────────────────────────
// The ignite is a wavefront travelling INTO the scene, so each lantern needs a
// depth coordinate, not an index. On this perspective line depth is monotonic
// in v, so normalising v against the near/far extremes gives d in [0,1] with
// d=0 at the viewer's feet and d=1 at the vanishing point. Deriving it here
// (rather than storing a hand-numbered order) means adding or moving a lantern
// re-sorts the ignite automatically.
const V_NEAR = Math.max(...LANTERNS.map((l) => l.v));
const V_FAR = Math.min(...LANTERNS.map((l) => l.v));
export const depthOf = (v) => (V_NEAR - v) / (V_NEAR - V_FAR);

// Where the ignite's travelling band sits at a given depth, and how wide the
// causeway is there. The band starts just BELOW the bottom edge so the light
// arrives from off-screen rather than popping into existence at the frame edge.
export const BAND_V_START = 1.06;
export const BAND_V_END = V_FAR;
export const bandV = (d) => BAND_V_START + (BAND_V_END - BAND_V_START) * d;
// Causeway half-width in u, linear in v across the near field — close enough
// to true perspective at these depths that the difference is sub-pixel.
export const bandHalfWidth = (v) =>
  0.028 + 0.272 * ((v - BAND_V_END) / (BAND_V_START - BAND_V_END));

// ── The plate's own opacity ─────────────────────────────────────────────────
// The still is painted at `opacity-90`, and every layer in this scene is tuned
// against that. It matters to more than styling, so it lives here as a number:
// a layer that REPLACES plate pixels (the water warp) must pre-multiply its
// output by this and composite at CSS opacity 1. Stacking its own 0.9 on top of
// the plate's instead lands the result at 0.99 x plate, and any pixel the layer
// declines to paint stays at 0.90 x plate — a 10% step.
//
// That is not hypothetical. It is the bug the row-shear tier shipped with: it
// skipped rows whose displacement rounded near zero, those rows form bands that
// TRAVEL with the wave, and measured on the running page they read as hard
// 5-7 unit teal stripes sliding down the lake (80 of 387 water rows unpainted,
// in runs of 5-10px). What that looks like is a pale shape moving over the
// water, which is precisely what it was reported as. Additive layers are exempt
// — they add to the plate rather than standing in for it — which is why the
// glow layer at the same opacity was always fine.
export const PLATE_OPACITY = 0.9;

// ── Water ───────────────────────────────────────────────────────────────────
// The lake, as a region. The video tier's bake masks the generated clip to
// exactly this area, which is what keeps the causeway out of it.
//
// Masking matters more than it looks. The i2v pass produced good water but
// would not hold the causeway rigid — the paving pattern slides frame to
// frame, and it is NOT a rigid camera drift (vidstab's static-camera mode left
// it unchanged), so no stabiliser can recover it. Water, having no rigid
// structure, hides drift completely; stone advertises it. So the video is only
// ever allowed inside this region, and the plate supplies every pixel of
// geometry the eye can check.
export const WATER_TOP = 0.545; // just below the horizon
// Where the water PLANE vanishes, which is not the same thing as where the
// water starts. WATER_TOP is the first row a layer may touch; this is the row
// the surface converges to, and every perspective term is built on the distance
// between the two. A ripple that ignores it gets uniform wavelength down the
// whole lake, which is the single cue that says "filter" rather than "water":
// real ripples compress toward the horizon because they are the same size in
// world space and further away. Sits just ABOVE WATER_TOP so the depth term
// stays finite and positive everywhere the mask is non-zero.
export const WATER_HORIZON = 0.503;
// Causeway half-width plus a margin, so displacement never bites into stone.
export const causewayHalf = (v) => bandHalfWidth(v) + 0.014;
// Centreline drifts very slightly right toward the vanishing point.
export const causewayCentre = (v) =>
  0.5 + 0.0155 * ((BAND_V_START - v) / (BAND_V_START - BAND_V_END));

// ── Post keep-outs ──────────────────────────────────────────────────────────
// The lantern posts do NOT stand on the causeway. They stand in the lake beside
// it, which means the water region above defines them as water and the video
// tier was handing them to the generated clip — the one thing the whole masking
// approach exists to prevent.
//
// It showed exactly as the theory predicts. Measured as per-pixel temporal std
// over the shipped loop, the causeway stone comes back at 0.00–0.02 (rigid, as
// designed) and open water at 5–10 (the motion we want), while the four near
// lantern posts measure 13–15 and the two foreground ones 39–42, peaking at 58
// in the flame cores. The model was re-drawing the posts and their flames every
// frame: the housings swim and the flames jump, which reads as the bridge and
// its lights moving rather than as a lake rippling.
//
// So each near post gets a keep-out rectangle, measured off the plate at
// 2560x1440, and the composite hands those pixels back to the still. Water
// keeps every bit of its motion; the posts stop moving because the plate's
// posts never moved. Everything beyond the sixth is already outside the mask
// (its own maskDist goes negative), so the list stops there.
//
// `v1: 1` means "runs off the bottom of the frame" — the two foreground pillars
// are cut by the frame edge, and a bottom feather there would fade the keep-out
// out precisely where the pillar is widest.
export const POST_KEEPOUTS = [
  { u0: 0.136, u1: 0.216, v0: 0.558, v1: 1 }, // near left  (lantern u 0.180)
  { u0: 0.794, u1: 0.868, v0: 0.560, v1: 1 }, // near right (lantern u 0.830)
  { u0: 0.360, u1: 0.398, v0: 0.530, v1: 0.742 }, // second left  (u 0.379)
  { u0: 0.651, u1: 0.690, v0: 0.516, v1: 0.762 }, // second right (u 0.669)
  { u0: 0.412, u1: 0.439, v0: 0.518, v1: 0.614 }, // third left   (u 0.424)
  { u0: 0.598, u1: 0.626, v0: 0.516, v1: 0.650 }, // third right  (u 0.610)
];

// Feather widths for the keep-outs, in u/v units. Without these the frozen
// posts would sit in moving water inside a visible rectangle; with them the
// water simply calms as it approaches the stone, which is what it does anyway.
const KEEP_FU = 0.006;
const KEEP_FV = 0.008;

// 1 where the plate must win outright, 0 where a water layer is free, ramped
// between. Shared, so no consumer can disagree about where the posts are.
export const postKeepout = (u, v) => {
  let a = 0;
  for (const k of POST_KEEPOUTS) {
    if (u < k.u0 || u > k.u1 || v < k.v0 || v > k.v1) continue;
    const ramps = [(u - k.u0) / KEEP_FU, (k.u1 - u) / KEEP_FU, (v - k.v0) / KEEP_FV];
    // No bottom ramp on a pillar the frame edge already cuts.
    if (k.v1 < 0.999) ramps.push((k.v1 - v) / KEEP_FV);
    const r = Math.min(1, ...ramps);
    if (r > a) a = r;
  }
  return a;
};

// Everything at this depth that is NOT water, as sorted, merged [u0, u1]
// intervals: the causeway plus any post standing at this row. The video bake
// masks to the complement, which is how a filmed lake stops smearing the stone
// and the pillars standing in it.
//
// This exists because both water tiers made the same modelling error. The
// region rule ("below the horizon and off the causeway") reads the lantern
// posts as lake, since they stand IN the water beside the causeway rather than
// on it — so the video tier let a model redraw them and the procedural tier
// would have sheared them sideways. Posts are structure; the rig says so once,
// here, and both consumers ask.
export const waterGaps = (v) => {
  const gaps = [[causewayCentre(v) - causewayHalf(v), causewayCentre(v) + causewayHalf(v)]];
  for (const k of POST_KEEPOUTS) {
    if (v >= k.v0 && v <= k.v1) gaps.push([k.u0, k.u1]);
  }
  gaps.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const g of gaps) {
    const last = merged[merged.length - 1];
    if (last && g[0] <= last[1]) last[1] = Math.max(last[1], g[1]);
    else merged.push([g[0], g[1]]);
  }
  return merged;
};

// ── Flame geometry ──────────────────────────────────────────────────────────
// `r` above is a detected core RADIUS, and a radius cannot describe a flame.
// The plate's flames are tall tongues, so anything drawn from r alone comes out
// round — which is what the first relight did, and round is the one shape that
// reads as a glowing bulb rather than something burning.
//
// So the flame body was measured off the plate (.measure-flames.mjs) as a box
// rather than a radius. Two traps had to be cleared to get it:
//   • a warm-and-bright threshold swallows the lit glass housing AND the stone
//     cap under it — it returned 141x165 px for a flame the eye reads at about
//     40x77. Sweeping the threshold showed the box plateauing once red is
//     near-saturated AND green is high (a yellow-white test the housing's dull
//     amber fails), which is the flame itself;
//   • the burner plate under the flame is a separate hot blob, and a bounding
//     box happily spans the gap to it. Walking out from the hottest row and
//     stopping at the first run of empty rows sheds it.
// Across the five resolvable sources the ratios came back tight, so one rule in
// units of r serves all of them rather than a per-lantern table.
export const FLAME_HALF_R = 0.46; // measured 0.37-0.50
export const FLAME_TIP_R = 0.92; // above centre; measured 0.85-0.95
export const FLAME_BASE_R = 0.68; // below centre; the two best-resolved say 0.64
// Only the five largest sources gave a trustworthy BOX — below r=12 the flame
// is a handful of pixels and the box measurements degenerate (they start
// returning tips below the centre). The RATIOS above are what get applied
// though, and `r` itself was reliably detected for every post, so the rule
// extends down safely: every lantern on the causeway burns, and the shader
// fades the effect out by on-screen size rather than by a hard cut, so a post
// four pixels wide simply stops moving instead of popping.
//
// The far cluster is still excluded. It is many lanterns averaged into a smudge
// with no flame shape in it to move.
export const FLAME_MIN_R = 8;
// Sources whose flame is worth warping, in rig order (the shader needs the
// index to stay aligned with the noise seeds the glow layer uses).
export const flameSources = () =>
  LANTERNS.map((s, i) => ({ ...s, i })).filter((s) => s.k !== 'far' && s.r >= FLAME_MIN_R);

// The working box around a flame, in units of the detected core radius: wider
// and taller than the measured flame so there is room to move, but the LIT
// GLASS CEILING sits only about 1.05r above centre (measured), so the top is
// capped short of the metal roof — a layer that reached the frame would smear
// it, and smeared metal is the one artefact that gives the whole thing away.
//
// Lives in the rig rather than beside the shader because it now has THREE
// consumers: the shader warps this box, the shader's JS sizes its quad from it,
// and bake-causeway-water.mjs cuts the video's flame windows to it. Two of
// those must agree to the pixel or the video's flame and the fallback shader's
// flame would sit in different places.
export const FIRE_BOX = { half: 0.86, top: 1.02, bottom: 0.9, feather: 0.22 };

// The box's alpha at a point, in the same local units the shader works in:
// `lx` across in units of r, `ly` UP from the flame centre in units of r. One
// implementation, so the video bake's window and the shader's warp region are
// the same shape by construction rather than by two authors agreeing.
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
export const fireBoxAlpha = (lx, ly) => {
  const { half, top, bottom, feather } = FIRE_BOX;
  const mx = 1 - smoothstep(half - feather, half, Math.abs(lx));
  const my =
    (1 - smoothstep(top - feather, top, ly)) * (1 - smoothstep(bottom - feather, bottom, -ly));
  return mx * my;
};

// ── Projection ──────────────────────────────────────────────────────────────
// The still is painted with `object-fit: cover` + `object-position: center`.
// Every procedural layer must re-derive that exact transform, or its glows
// unglue from the artwork on the first resize. Same math SceneEmbers and
// SceneSealIgnite each carry a private copy of; here it is shared.
export const coverProjection = (cw, ch) => {
  const scale = Math.max(cw / IW, ch / IH);
  return { scale, ox: (cw - IW * scale) / 2, oy: (ch - IH * scale) / 2 };
};

// ── Flicker noise ───────────────────────────────────────────────────────────
// Deterministic hash → [0,1) keyed by (seed, lattice index); integer mixing
// keeps it cheap enough to call once per source per frame.
const rand2 = (seed, i) => {
  let h = (seed * 374761393 + i * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// 1D value noise, smoothstep-blended between lattice points.
const vnoise = (seed, t) => {
  const i = Math.floor(t);
  const f = t - i;
  const sf = f * f * (3 - 2 * f);
  return rand2(seed, i) * (1 - sf) + rand2(seed, i + 1) * sf;
};

// Two octaves — a slow breath plus a faster shimmer. A single sine reads as
// mechanical pulsing on sight; this is the same construction SceneEmbers uses.
export const flicker = (seed, t, speed) =>
  0.7 * vnoise(seed, t * speed) + 0.3 * vnoise(seed ^ 0x9e37, t * speed * 3.1);

// A FLAME's own noise, which is not the lantern's. `flicker` above drives the
// light a lantern throws — a slow breath, because an enclosed flame's spill on
// stone changes slowly. The flame itself does not: it jitters. Three octaves
// spanning roughly 3–15 Hz gives the tongue a nervous edge that two cannot,
// and the top octave is what separates "a candle is burning in there" from "a
// bulb is being dimmed".
export const flameFlicker = (seed, t) =>
  0.5 * vnoise(seed, t * 3.1) +
  0.32 * vnoise(seed ^ 0x51ed, t * 7.7) +
  0.18 * vnoise(seed ^ 0x2f19, t * 15.3);

// Sideways lean, on its own slower axis: a flame sways as much as it pulses,
// and tying the sway to the brightness noise makes it look mechanical.
export const flameLean = (seed, t) => vnoise(seed ^ 0x7c1b, t * 1.9) * 2 - 1;

// How hard the flame is licking upward right now, on a third independent axis.
// A flame's rise is not its lean and not its brightness: it surges and settles
// on its own clock, and driving all three from one number collapses the whole
// thing into a single pulsing shape.
export const flameLift = (seed, t) => vnoise(seed ^ 0x3ad9, t * 2.7) * 2 - 1;
