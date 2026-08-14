// Bake the MA seal into the workshop rug — replaces the generated arcane sigil.
//
//   node scripts/scene/bake-rug-seal.mjs <in.png|jpg> <out.png> [--plate <plate.png>]
//
// ── WHAT THIS REPLACES ──────────────────────────────────────────────────
// The artwork's rug carries a glowing arcane summoning-circle: two concentric
// rings around a tree/floral medallion. It is not a texture, an SVG or
// geometry — it is baked raster pixels in project-bg.webp and in every video
// frame, produced by the original image generation. (gen-projects-scene.mjs's
// SHARED_LOCK still carries the clause written to stop it re-igniting.) So it
// cannot be removed by any code change; it has to be repainted.
//
// ── THE CORE IDEA: REPLACE THE SHAPE, KEEP THE ENERGY ───────────────────
// Naively erasing the sigil and pasting a logo on top gives a decal: the rug
// would still be lit as if rings were glowing, and the surrounding pot, table
// legs and floor would keep bounce-light with no visible source.
//
// So split the sigil's light into two parts and treat them differently:
//
//   ENVELOPE  E = heavily blurred luminance excess. This is the soft pool the
//               sigil casts across the weave and onto everything near it.
//               KEEP IT, untouched — it is the scene's lighting, and it is
//               what makes the replacement read as lit by the same source.
//
//   STRUCTURE S = excess - envelope. These are the sharp ring strokes, i.e.
//               the SHAPE of the mark. REMOVE IT, and spend the same energy
//               on the seal's strokes instead.
//
// Net effect: the rug is lit exactly as before, but what is glowing in the
// weave is now the MA seal.
//
// ── PERSPECTIVE ─────────────────────────────────────────────────────────
// Ground-plane homography with no roll and no x-shear (the camera's x-axis is
// parallel to the floor, verified: the sigil ellipse's principal axis is
// [-1.0, 0.004]):
//
//     x = (a*u + e) / (h*v + 1)
//     y = (f*v + g) / (h*v + 1)
//
// a/e/f/g come from the measured sigil ellipse in the ORIGINAL still (centre
// 1395.5,1235.5; semi-axes 223.5 x 58.5 -> b/a = 0.262, i.e. a camera ~15 deg
// above the floor). h is the perspective term, and its sign matters: h < 0
// expands the near (lower) side of the seal and compresses the far side.
//
// Fitting h from the sigil's own two rings FAILED — they sit at plane radii
// 1.0 and 0.82, too short a baseline, and the fit returned it with the wrong
// sign at a magnitude (2%) below the noise floor of a soft thresholded glow.
// So h is taken from the rug rectangle instead, whose front edge is ~6.4%
// longer than its back edge; the seal spans about half the rug's depth, hence
// ~3% across the seal -> h = -0.0148.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const [, , IN, OUT, ...rest] = process.argv;
if (!IN || !OUT) {
  console.error("usage: node scripts/scene/bake-rug-seal.mjs <in> <out> [--plate <plate.png>]");
  process.exit(1);
}
const plateIdx = rest.indexOf("--plate");
const PLATE = plateIdx >= 0 ? rest[plateIdx + 1] : null;

const W = 2560;
const H = 1440;

// ── Seal placement on the floor plane ───────────────────────────────────
// A = image px per plane unit along the seal's major axis. The original sigil
// measured 223.5; the seal is set slightly larger so the lettering band has
// room to resolve, while staying well inside the rug (which spans ~685px).
const A = Number(process.env.SEAL_A ?? 268);
const E_X = 1393.0; // seal centre x
const HH = -0.0148; // perspective term (near side expands ~3%)
// f and g are solved so the seal's vertical extent straddles the sigil's
// measured band (y 1176..1296) once the perspective divisor is applied.
const Y_NEAR = 1296.0;
const Y_FAR = 1176.0;
const G_Y = (Y_NEAR * (1 + HH) + Y_FAR * (1 - HH)) / 2;
const F_Y = (Y_NEAR * (1 + HH) - Y_FAR * (1 - HH)) / 2;

// Logo space: alpha>0.05 spans r=0..486.5 about (511.5, 511.5); the outermost
// ring sits at r~486, so that radius maps to plane radius 1.0.
const LOGO_R = 486.5;
const LOGO_C = 511.5;

// Rug region worked on (generous; the seal plus its bloom sits well inside).
const RX0 = 1020, RX1 = 1800, RY0 = 1090, RY1 = 1400;

// ember tokens (tailwind.config.js): the seal is emissive light, not ink, so
// it is coloured from the scene's own fire palette rather than the logo's
// brand orange — halo in the stroke cores, neon at their edges.
const EMBER_HALO = [252, 246, 153];
const EMBER_NEON = [234, 181, 62];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ── separable gaussian blur on a Float32 plane ──────────────────────────
function blur(src, w, h, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        acc += k[i + r] * src[y * w + clamp(x + i, 0, w - 1)];
      }
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        acc += k[i + r] * tmp[clamp(y + i, 0, h - 1) * w + x];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

// ── build the warped seal once; it is identical for every frame ─────────
async function buildSealMask() {
  const logo = await sharp("public/background/logo.png")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: L, info } = logo;
  const LW = info.width, LH = info.height, LC = info.channels;

  const rw = RX1 - RX0, rh = RY1 - RY0;
  const alpha = new Float32Array(rw * rh); // seal coverage
  const shade = new Float32Array(rw * rh); // logo luminance inside the mark

  const SS = 3; // 3x3 supersampling — the lettering is only ~12px tall here
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      let aAcc = 0, sAcc = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = RX0 + x + (sx + 0.5) / SS;
          const py = RY0 + y + (sy + 0.5) / SS;
          // image -> plane
          const v = (G_Y - py) / (py * HH - F_Y);
          const denom = HH * v + 1;
          const u = (px * denom - E_X) / A;
          if (u * u + v * v > 1.02) continue;
          // plane -> logo pixel
          const lx = LOGO_C + u * LOGO_R;
          const ly = LOGO_C + v * LOGO_R;
          if (lx < 0 || ly < 0 || lx >= LW - 1 || ly >= LH - 1) continue;
          // bilinear sample of alpha + luminance
          const x0 = Math.floor(lx), y0 = Math.floor(ly);
          const fx = lx - x0, fy = ly - y0;
          let av = 0, sv = 0;
          for (let j = 0; j < 2; j++) {
            for (let i = 0; i < 2; i++) {
              const w2 = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
              const o = ((y0 + j) * LW + (x0 + i)) * LC;
              const aa = L[o + 3] / 255;
              av += w2 * aa;
              sv += w2 * aa * (0.299 * L[o] + 0.587 * L[o + 1] + 0.114 * L[o + 2]) / 255;
            }
          }
          aAcc += av;
          sAcc += sv;
        }
      }
      const n = SS * SS;
      alpha[y * rw + x] = aAcc / n;
      shade[y * rw + x] = sAcc / n;
    }
  }
  return { alpha, shade, rw, rh };
}

async function main() {
  const seal = await buildSealMask();
  const { alpha, shade, rw, rh } = seal;
  const cov = alpha.reduce((s, v) => s + (v > 0.02 ? 1 : 0), 0);
  console.log(`seal mask: ${cov} covered px of ${rw * rh} in the rug window`);

  const img = await sharp(IN).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const P = Float32Array.from(img.data);
  if (img.info.width !== W || img.info.height !== H) {
    throw new Error(`expected ${W}x${H}, got ${img.info.width}x${img.info.height}`);
  }

  // Luminance of the rug window.
  const lum = new Float32Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const o = ((RY0 + y) * W + (RX0 + x)) * 3;
      lum[y * rw + x] = 0.299 * P[o] + 0.587 * P[o + 1] + 0.114 * P[o + 2];
    }
  }

  // Plane radius of every pixel in the window, plus a feathered footprint.
  // The footprint fades out over a wide band (1.0 -> 1.45) so the removal can
  // never leave a visible hard edge on the weave.
  const rad = new Float32Array(rw * rh);
  const foot = new Float32Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const px = RX0 + x + 0.5, py = RY0 + y + 0.5;
      const v = (G_Y - py) / (py * HH - F_Y);
      const denom = HH * v + 1;
      const u = (px * denom - E_X) / A;
      const r = Math.hypot(u, v);
      rad[y * rw + x] = r;
      const t = clamp((1.45 - r) / 0.45, 0, 1);
      foot[y * rw + x] = t * t * (3 - 2 * t); // smoothstep
    }
  }
  const footSoft = blur(foot, rw, rh, 12);

  // ── IDEALISED LIGHT POOL ────────────────────────────────────────────────
  // A plain blur does NOT separate the sigil from its pool: the sigil is a
  // set of CONCENTRIC rings, so it is radially symmetric, and both a blur and
  // an angular average preserve it. (The first attempt used blur alone and
  // the rings survived as ghosts.)
  //
  // What actually distinguishes "pool" from "rings" is that a pool falls off
  // monotonically with radius and rings do not. So: take the angular mean of
  // the smoothed luminance per radius, force it non-increasing (running
  // minimum outward from the centre), smooth it, and use THAT as the light
  // the rug should be receiving. Everything above it is ring structure.
  const lumSmooth = blur(lum, rw, rh, 5); // above weave scale, below ring scale
  const NB = 130, RMAX = 1.45;
  const acc = new Float64Array(NB), cnt = new Float64Array(NB);
  for (let i = 0; i < rad.length; i++) {
    if (rad[i] >= RMAX) continue;
    const b = Math.min(NB - 1, Math.floor((rad[i] / RMAX) * NB));
    acc[b] += lumSmooth[i];
    cnt[b] += 1;
  }
  const prof = new Float64Array(NB);
  for (let b = 0; b < NB; b++) prof[b] = cnt[b] > 0 ? acc[b] / cnt[b] : 0;
  // running minimum outward => monotone non-increasing
  for (let b = 1; b < NB; b++) prof[b] = Math.min(prof[b], prof[b - 1]);
  // smooth the profile so the removal has no radial banding
  const sm = new Float64Array(NB);
  for (let b = 0; b < NB; b++) {
    let s = 0, w2 = 0;
    for (let k = -6; k <= 6; k++) {
      const j = clamp(b + k, 0, NB - 1);
      const wk = Math.exp(-(k * k) / 18);
      s += wk * prof[j];
      w2 += wk;
    }
    sm[b] = s / w2;
  }
  const idealAt = (r) => {
    if (r >= RMAX) return sm[NB - 1];
    const t = (r / RMAX) * NB - 0.5;
    const b0 = clamp(Math.floor(t), 0, NB - 1);
    const b1 = clamp(b0 + 1, 0, NB - 1);
    const fr = clamp(t - b0, 0, 1);
    return sm[b0] * (1 - fr) + sm[b1] * fr;
  };

  // Everything the smoothed image has ABOVE the floor is ring light. Weave
  // detail is finer than the sigma-5 smoothing, so it is not in here and
  // survives the subtraction intact.
  //
  // The floor is the LOWER of two estimates, because each one alone leaves a
  // different residue:
  //   * the monotone radial pool misses rings that are not concentric about
  //     our centre — and the settled sigil is a SPIRAL whose centre sits ~20px
  //     off the seal's, so angular averaging smears its peaks flat;
  //   * a wide blur is centre-agnostic and catches those, but being a local
  //     mean it sits inside broad glow and leaves the low-frequency part.
  // Taking the minimum means a pixel has to look like background to BOTH.
  const wide = blur(lum, rw, rh, 46);
  const structure = new Float32Array(rw * rh);
  for (let i = 0; i < lum.length; i++) {
    const floor = Math.min(wide[i], idealAt(rad[i]));
    structure[i] = Math.max(0, lumSmooth[i] - floor);
  }

  // Weave modulation: local relative brightness of the DE-GLOWED rug. >1 on
  // raised threads, <1 in the grooves. This is what makes the seal read as
  // printed into the weave rather than floating above it.
  const deglow = new Float32Array(rw * rh);
  for (let i = 0; i < lum.length; i++) deglow[i] = lum[i] - structure[i] * footSoft[i];
  const deglowBase = blur(deglow, rw, rh, 7);

  // The seal is brightest where the artwork's own pool is brightest, so it
  // inherits the scene's falloff instead of being uniformly lit.
  const poolMax = idealAt(0);

  // Emissive seal layer, built at unit gain first so the gain can be chosen
  // from the result rather than guessed. Energy-matching against the removed
  // rings (the first attempt) blew straight through its clamp: the rings cover
  // a far larger area than the seal's thin strokes, so equal energy means an
  // absurd per-pixel amplitude. Peak-matching is the right control.
  const addR = new Float32Array(rw * rh);
  const addG = new Float32Array(rw * rh);
  const addB = new Float32Array(rw * rh);
  const unit = new Float32Array(rw * rh);
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i];
    if (a <= 0.002) continue;
    const weave = clamp(deglow[i] / Math.max(deglowBase[i], 1e-3), 0.55, 1.5);
    const pool = clamp(idealAt(rad[i]) / Math.max(poolMax, 1e-3), 0.4, 1.0);
    unit[i] = a * (0.35 + 0.65 * shade[i]) * pool * (0.7 + 0.45 * weave);
  }
  // Build the layer at unit gain, measure the ACTUAL added luminance, then
  // scale. Deriving the gain algebraically is what went wrong before: the
  // amplitude passes through a /255 and then a ~230-luminance colour, so a
  // formula that misses either factor is off by ~270x (the seal was added at
  // roughly 1/280th intensity and the old rings simply showed through).
  for (let i = 0; i < unit.length; i++) {
    if (unit[i] <= 0) continue;
    // thicker/denser strokes burn toward halo, thin ones sit at neon
    const t = clamp(shade[i] * 1.15, 0, 1);
    addR[i] = unit[i] * (EMBER_NEON[0] + (EMBER_HALO[0] - EMBER_NEON[0]) * t);
    addG[i] = unit[i] * (EMBER_NEON[1] + (EMBER_HALO[1] - EMBER_NEON[1]) * t);
    addB[i] = unit[i] * (EMBER_NEON[2] + (EMBER_HALO[2] - EMBER_NEON[2]) * t);
  }
  const addLum = Float32Array.from(addR, (_, i) =>
    0.299 * addR[i] + 0.587 * addG[i] + 0.114 * addB[i]);
  const sorted = Float32Array.from(addLum).sort();
  const p998 = sorted[Math.floor(sorted.length * 0.998)] || 1e-6;
  // The page composites this through backdrop opacity 0.88 AND .projects-scrim,
  // which lands at alpha 0.727 over the rug — so on screen the rug keeps only
  // ~24% of the luminance baked here. At peak 232 the seal measured just 66/255
  // on-page: readable, but lit paint rather than a light source. The sigil it
  // replaces was blown out at ~250, so matching that is authentic, not hot.
  const TARGET_PEAK = Number(process.env.SEAL_PEAK ?? 254);
  const gain = TARGET_PEAK / p998;
  console.log(`added-luminance p99.8 ${p998.toFixed(2)} -> gain ${gain.toFixed(2)}`);
  for (let i = 0; i < addR.length; i++) {
    addR[i] *= gain;
    addG[i] *= gain;
    addB[i] *= gain;
  }

  // Bloom, at two scales. The tight one (sigma 9) spills into the weave right
  // around each stroke so nothing reads as hard-edged print. The wide one
  // (sigma 40) is the light POOL the seal throws across the rug — and that
  // pool is what survives the scrim: a broad low-amplitude lift is compressed
  // far less than thin bright strokes, so it is what tells the eye the mark is
  // emitting rather than merely being lit.
  const bR = blur(addR, rw, rh, 9);
  const bG = blur(addG, rw, rh, 9);
  const bB = blur(addB, rw, rh, 9);
  const wR = blur(addR, rw, rh, 40);
  const wG = blur(addG, rw, rh, 40);
  const wB = blur(addB, rw, rh, 40);
  // Kept deliberately low. At 1.5 the pool swamped the strokes and the whole
  // mark went milky — through a scrim, CONTRAST reads and absolute brightness
  // does not, so a broad haze actively destroys legibility rather than helping.
  const WIDE = Number(process.env.SEAL_POOL ?? 0.45);

  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      const o = ((RY0 + y) * W + (RX0 + x)) * 3;
      const strip = structure[i] * footSoft[i];
      // Remove the ring light HUE-PRESERVINGLY. Subtracting a fixed amount
      // per channel (the first attempt used 1.00/0.95/0.82) leaves a cyan
      // fringe wherever the sigil was blown out near white, because the same
      // absolute subtraction is a much bigger relative cut to the channel
      // that was already lower. Scaling all three by one factor cannot shift
      // hue at all.
      const l0 = 0.299 * P[o] + 0.587 * P[o + 1] + 0.114 * P[o + 2];
      const k = l0 > 1e-3 ? clamp((l0 - strip) / l0, 0.12, 1) : 1;
      let r = P[o] * k;
      let g = P[o + 1] * k;
      let b = P[o + 2] * k;
      // add the seal: stroke core + tight bloom + wide pool
      r += addR[i] + bR[i] * 0.55 + wR[i] * WIDE;
      g += addG[i] + bG[i] * 0.55 + wG[i] * WIDE;
      b += addB[i] + bB[i] * 0.55 + wB[i] * WIDE;
      P[o] = clamp(r, 0, 255);
      P[o + 1] = clamp(g, 0, 255);
      P[o + 2] = clamp(b, 0, 255);
    }
  }

  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < buf.length; i++) buf[i] = P[i] + 0.5;
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(OUT);
  console.log(`wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
