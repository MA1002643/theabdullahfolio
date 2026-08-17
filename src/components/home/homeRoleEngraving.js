// The engraved plate behind the homepage role line: a security-print latent
// image, built the way a banknote builds one — and printed the way one is
// printed, in three colour separations that have to come into register.
//
// ── THE PHYSICS, BRIEFLY ────────────────────────────────────────────────────
// Three sets of hairlines are superposed, one per ink. They are near-identical
// engravings differing only in pitch (fractions of a percent) and angle
// (fractions of a degree) — differences far too small to see directly.
//
// What you see instead is their sum. Where two line sets fall on top of one
// another the ink covers one line's width; where they fall between one another
// it covers two, in two different colours. That is the moiré: a density AND a
// hue that beat across the plate with a period hundreds of pixels long, over a
// field whose own lines are one device pixel wide.
//
// The word is cut into the separations as a HALF-PITCH phase step, and — this
// is the part that carries the colour — a DIFFERENT step per ink. On its own
// each displacement is invisible (a 1px line moved by 1px, inside a field of
// identical 1px lines), but together they change which inks coincide inside the
// letterforms and which interleave. So the latent word surfaces as its own
// colour against the field, not merely as a lighter or darker patch, and it
// cannot be recovered from any single separation.
//
// ── COLOUR: IRIS PRINTING ───────────────────────────────────────────────────
// The three inks are not fixed. Each samples a curated hue wheel at its own
// offset plus a sweep that advances across the plate, so the ink shifts
// continuously along the line and no two columns print the same trio. That is
// Regenbogendruck — the split-fountain "rainbow" technique used on real notes
// precisely because a continuous ink blend cannot be separated and re-printed.
// It is also why the colour here is a property of the PLATE rather than a
// gradient laid over it: the hue is what the fringe is made of.
//
// ── REGISTRATION ────────────────────────────────────────────────────────────
// Every separation carries its own `tilt`, `scale` and `phase`, and the caller
// is free to hand over values that are grossly wrong. That is not a fault path,
// it is the reveal: a press starts out of register and converges. Badly
// misregistered gratings beat at a period of a few pixels — a dense, chaotic
// interference — and as they converge that period grows without bound, so the
// fringes appear to rush outward and lock. The resting design is simply the
// converged end of that same curve, which is why the arrival and the idle state
// need no crossfade between them.
//
// ── WHY IT SHARPENS AS THE TYPE SHRINKS ─────────────────────────────────────
// Every dimension that matters is in DEVICE pixels. The hairline is one device
// pixel at any breakpoint and any DPR; the pitch is a small multiple of it.
// Nothing has to grow with the type, because the signal is carried by the
// interference and not by the line — so the smaller and denser the field gets,
// the finer the fringe reads. The opposite of a surface treatment, all of which
// need interior area to shade and die at the ~1.4px stem this line has.
//
// ── WHY IT IS CHEAP ─────────────────────────────────────────────────────────
// Each separation's phase field is SEPARABLE — Φ(x, y) = P(x) + Q(y) — so a
// frame costs O(W + H) trigonometry into lookup tables and an inner loop with
// no transcendentals in it at all. The inks resolve to one colour per column
// per separation, also O(W). Per pixel a frame does three table pairs, three
// fracts, three divides, and one reciprocal to un-premultiply.

// The hairline, in DEVICE pixels. One, always — see the note above.
const LINE_PX = 1;

// The guilloche's waviness, as multiples of the pitch, and its periods as
// fractions of the plate. Expressing the periods against the plate keeps the
// pattern's CHARACTER identical at every breakpoint while the line and pitch
// stay absolute — the field gets denser as the plate shrinks instead of
// coarser, which is the whole idea.
const WAVE = [
  { amp: 3.2, along: 'x', per: 0.42 },
  { amp: 1.05, along: 'x', per: 0.16 },
  { amp: 0.85, along: 'y', per: 0.62 },
];

// The three inks' resting re-cut, relative to the first. Sized so the beat runs
// about 1.35 plate widths horizontally: the word then surfaces left-to-right,
// in reading order, instead of in stacked bands. Pitch differences are left
// small so the fringes lean rather than sweeping vertically as well.
const REST_TILT = [0, 1, -0.55];
const REST_PITCH = [0, 0.005, -0.0032];
const BEAT_SPAN_X = 1.35;

// The latent step per separation, in cycles — only the DIFFERENCES matter, so
// the first ink is the reference and stays put. Thirds of a pitch, because that
// is the arrangement that maximally interleaves three line sets: whatever the
// inks are doing outside the letterforms, inside them they are as far from
// coinciding as three sets can get. That is the largest signal the physics
// offers, and anything less is leaving the word's contrast on the table.
const REST_LATENT = [0, 0.34, 0.67];

// The latent word's own ink, and its own weight.
//
// The phase step alone is a real latent image and it behaves beautifully — it
// surfaces and sinks as the fringe drifts — but at this type size it asks the
// reader to lean in, and a line of a portfolio hero does not get that. So the
// word is also printed HALF A TURN around the hue wheel from the ground it sits
// in, and struck harder. Both are things a press can do (a latent panel in a
// second ink is ordinary security work), and neither replaces the interference:
// the step still decides where the word is legible and the drift still moves
// it, while these two decide whether you can read it from where you are sitting.
// The two are NOT interchangeable, and the split between them is the whole
// point. Hue is nearly free: rotating the word's ink to the far side of the
// wheel makes it separate from the ground without adding light, so it does not
// touch the backdrop the printed line is read against. Weight is not free at
// all — it is literally more light under the type. Measured, a gain of 0.85
// read beautifully and took every ramp stop from ~6.2:1 down to ~3.2:1, i.e.
// straight through the AA floor, because the latent's upper line passes behind
// the printed one. So the weight buys only what the hue cannot, and the
// contrast figures in globals.css are what this number is set against.
const LATENT_HUE = 0.5;
const LATENT_GAIN = 0.3;
// Below this the pixel is treated as outside the word, which keeps the ground —
// the large majority of the plate — on the cheap path.
const LATENT_EPS = 0.02;

// The hue wheel the inks ride, as sRGB 0..1. A curated loop rather than an HSV
// sweep: it never passes through the sour yellow-greens, and it stays inside a
// luminance band so no single ink can dominate the mix. Six stops, looping.
const WHEEL = [
  [0.09, 0.93, 0.82], // aqua
  [0.12, 0.61, 1.0], // azure
  [0.38, 0.42, 1.0], // periwinkle
  [0.73, 0.27, 0.98], // orchid
  [1.0, 0.26, 0.62], // rose
  [1.0, 0.62, 0.17], // amber
];
const WHEEL_LUT = 180;

// How far apart the three inks sit on the wheel, and how far the wheel turns
// across the plate — both in turns.
//
// The spread is the number that decides whether this reads as COLOUR at all,
// and the intuitive value is wrong. Spacing the inks evenly (a third apart)
// makes them sum to neutral wherever they overlap, so the plate prints a
// perfectly correct, perfectly grey field: three saturated inks averaging each
// other out. Clustering them into a narrow arc instead leaves the sum
// chromatic, and the sweep then carries that arc across the wheel — which is
// what a split fountain actually does, since the inks in one are neighbours in
// the duct rather than opposites.
//
// The spread still has to be wide enough that the separations are
// distinguishable, because the latent word is carried by WHICH inks coincide
// inside the letterforms. Too tight and the word stops having a colour of its
// own; too wide and the ground goes grey and takes the word's colour with it.
const INK_SPREAD = 0.16;
const IRIS_SWEEP = 0.62;

// Fast |(gx, gy)| — alpha-max-plus-beta-min, ~4% worst case. The gradient only
// sets how wide one device pixel is in phase units, so 4% of a hairline's
// antialiasing is not a visible quantity, and this runs once per pixel per ink.
const AMAX = 0.9604;
const BMIN = 0.3978;

const TAU = Math.PI * 2;

/**
 * The mean ink coverage of the finished ground at a given pitch, 0..1.
 *
 * A one-pixel line every `pitch` pixels covers `1/pitch` of the field, and
 * three of them superposed cover `1 - (1 - 1/pitch)^3`. This exists because the
 * pitch is not free: it is pinned to the latent type at one end and to the
 * device pixel at the other, so the same design lands on a noticeably denser
 * grating on a phone than on a desktop. Callers divide their intended DENSITY
 * by this to recover the peak level that produces it, which keeps the plate's
 * tone — and so its effect on the printed line's contrast — the same everywhere
 * while the engraving itself gets finer.
 */
export const meanCoverage = (pitch) => {
  const one = Math.min(1, LINE_PX / pitch);
  return 1 - (1 - one) * (1 - one) * (1 - one);
};

/** The three inks' resting registration, as the caller's starting point. */
export const restSeparations = () =>
  REST_TILT.map((t, i) => ({
    tilt: t,
    pitch: REST_PITCH[i],
    phase: 0,
    latent: REST_LATENT[i],
  }));

/** Sample the hue wheel, `t` in turns. Built once, read per column per ink. */
const buildWheel = () => {
  const lut = new Float32Array(WHEEL_LUT * 3);
  for (let i = 0; i < WHEEL_LUT; i += 1) {
    const t = (i / WHEEL_LUT) * WHEEL.length;
    const a = Math.floor(t) % WHEEL.length;
    const b = (a + 1) % WHEEL.length;
    const f = t - Math.floor(t);
    for (let c = 0; c < 3; c += 1) {
      lut[i * 3 + c] = WHEEL[a][c] + (WHEEL[b][c] - WHEEL[a][c]) * f;
    }
  }
  return lut;
};
const WHEEL_TABLE = buildWheel();

/**
 * Build the engraved plate.
 *
 * Everything the caller supplies is already in DEVICE pixels and already
 * rasterised — this module never touches the DOM, a font, or a canvas.
 *
 * @param {object}       o
 * @param {number}       o.W       plate width, device px
 * @param {number}       o.H       plate height, device px
 * @param {number}       o.pitch   line spacing, device px
 * @param {Float32Array} o.gain    W*H — envelope * reserve, 0 where no ink may go
 * @param {Float32Array} o.latent  W*H — coverage of the latent word, 0..1
 */
export const createEngraving = ({ W, H, pitch, gain, latent }) => {
  const k = 1 / pitch;
  const N = REST_TILT.length;

  // The wave terms, resolved to this plate. Phases are constants rather than
  // random so the engraving is identical on every visit and every machine — a
  // plate is a plate.
  const waves = WAVE.map((w, i) => ({
    along: w.along,
    amp: w.amp,
    w: TAU / Math.max(8, (w.along === 'x' ? W : H) * w.per),
    p: [0.7, 2.31, 4.02][i] ?? 0,
  }));
  const wavesX = waves.filter((w) => w.along === 'x');
  const wavesY = waves.filter((w) => w.along === 'y');

  /**
   * Fill a phase table and its derivative for one axis of one separation.
   *
   * `ramp` is the separation's linear term along this axis (cycles per px) and
   * `scale` stretches the wave arguments — which is what re-cutting a plate at
   * a different pitch actually does to the engraving, and what gives the
   * fringes their own wobble instead of leaving them as straight bars.
   */
  const fill = (phase, deriv, n, own, ramp, scale, offset) => {
    for (let i = 0; i < n; i += 1) {
      let p = ramp * i + offset;
      let d = ramp;
      for (let j = 0; j < own.length; j += 1) {
        const wv = own[j];
        const a = wv.w * scale * i + wv.p;
        p += wv.amp * Math.sin(a);
        d += wv.amp * wv.w * scale * Math.cos(a);
      }
      phase[i] = p;
      deriv[i] = d;
    }
  };

  // One phase/derivative table pair per separation per axis.
  const px = [];
  const dx = [];
  const py = [];
  const dy = [];
  for (let i = 0; i < N; i += 1) {
    px.push(new Float32Array(W));
    dx.push(new Float32Array(W));
    py.push(new Float32Array(H));
    dy.push(new Float32Array(H));
  }

  // The angle unit: one full beat across BEAT_SPAN_X plate widths. Every tilt
  // the caller passes is a multiple of this, so "1" is the resting design and
  // large values are the misregistration the reveal starts from.
  const tiltUnit = pitch / (BEAT_SPAN_X * W);

  const recut = (seps) => {
    for (let i = 0; i < N; i += 1) {
      const s = seps[i];
      const scale = 1 / (1 + s.pitch);
      fill(px[i], dx[i], W, wavesX, s.tilt * tiltUnit, scale, s.phase);
      fill(py[i], dy[i], H, wavesY, k * scale, scale, 0);
    }
  };

  // Per-column ink colour, rebuilt per frame: the iris sweep plus whatever
  // rotation and desaturation the caller is asking for this instant.
  // Two sets of per-column inks: the ground's, and the latent word's half a
  // turn away from it. Both are O(W) per frame, so the word costs its own
  // colour and nothing else.
  const colRGB = new Float32Array(N * W * 3);
  const latRGB = new Float32Array(N * W * 3);
  const inkColumns = (shift, chroma, seps) => {
    for (let pass = 0; pass < 2; pass += 1) {
      const out = pass === 0 ? colRGB : latRGB;
      const hue = pass === 0 ? 0 : LATENT_HUE;
      fillInks(out, shift + hue, chroma, seps);
    }
  };
  const fillInks = (out, shift, chroma, seps) => {
    for (let i = 0; i < N; i += 1) {
      const base = shift + i * INK_SPREAD;
      // How much of this ink has reached the sheet. Folded into the COLOUR
      // rather than the coverage so that staging the separations costs the
      // inner loop nothing — an ink that has not arrived is simply black.
      const level = seps[i].level === undefined ? 1 : seps[i].level;
      for (let x = 0; x < W; x += 1) {
        const u = W > 1 ? x / (W - 1) : 0.5;
        let t = (base + IRIS_SWEEP * u) % 1;
        if (t < 0) t += 1;
        const fi = t * WHEEL_LUT;
        const a = Math.floor(fi) % WHEEL_LUT;
        const b = (a + 1) % WHEEL_LUT;
        const f = fi - Math.floor(fi);
        const o = (i * W + x) * 3;
        let lum = 0;
        for (let c = 0; c < 3; c += 1) {
          const v = WHEEL_TABLE[a * 3 + c] + (WHEEL_TABLE[b * 3 + c] - WHEEL_TABLE[a * 3 + c]) * f;
          out[o + c] = v;
          lum += v;
        }
        // Desaturation toward the ink's own mean, so a `chroma` of 0 prints the
        // plate as a colourless blind emboss — the state a sheet is in before
        // any ink reaches it.
        lum /= 3;
        for (let c = 0; c < 3; c += 1) {
          out[o + c] = (lum + (out[o + c] - lum) * chroma) * level;
        }
      }
    }
  };

  /** Antialiased coverage of a one-device-pixel line. */
  const cover = (phi, g) => {
    const f = phi - Math.floor(phi);
    const d = f > 0.5 ? 1 - f : f; // cycles to the nearest line centre
    // A box line of width LINE_PX convolved with a one-pixel box filter is a
    // trapezoid; `outer` is where it reaches zero, and dividing by g normalises
    // back out of phase units.
    const outer = (LINE_PX + 1) * 0.5 * g;
    const c = (outer - d) / g;
    return c <= 0 ? 0 : c > LINE_PX ? LINE_PX : c;
  };

  /**
   * The phase that puts the fringe at an extreme in the middle of the plate —
   * where the latent word is at maximum contrast. Used for the still frame
   * served under `prefers-reduced-motion`, which gets one shot at showing the
   * effect and should not waste it on a null.
   */
  const alignAtCentre = (seps) => {
    recut(seps);
    const cx = W >> 1;
    const cy = H >> 1;
    const beat = px[1][cx] + py[1][cy] - (px[0][cx] + py[0][cy]);
    return -beat;
  };

  /**
   * Write one frame into `data` (an ImageData buffer whose pixels outside the
   * plate are left untouched for the layer's whole life).
   *
   * @param {Uint8ClampedArray} data
   * @param {object}   state
   * @param {Array}    state.seps    per separation: {tilt, pitch, phase, latent}
   * @param {number}   state.ink     peak level, 0..1
   * @param {number}   state.chroma  0 = blind emboss, 1 = fully inked
   * @param {number}   state.shift   iris rotation, in turns
   * @param {Float32Array} state.breath per-column multiplier (the lanterns)
   */
  const paint = (data, state) => {
    const { seps, ink, chroma, shift, breath } = state;
    recut(seps);
    inkColumns(shift, chroma, seps);

    for (let y = 0; y < H; y += 1) {
      const row = y * W;
      // Per-separation row constants, hoisted out of the x loop.
      const p0y = py[0][y];
      const p1y = py[1][y];
      const p2y = py[2][y];
      const a0y = Math.abs(dy[0][y]);
      const a1y = Math.abs(dy[1][y]);
      const a2y = Math.abs(dy[2][y]);

      for (let x = 0; x < W; x += 1) {
        const i = row + x;
        const gi = gain[i];
        const o = i * 4;
        if (gi <= 0) {
          data[o + 3] = 0;
          continue;
        }

        const lat = latent[i];
        // Inside the letterforms the plate is struck harder, so the word has a
        // weight of its own and not only a phase.
        const lvl = gi * breath[x] * ink * (1 + LATENT_GAIN * lat);

        // Ink 0
        let ax = Math.abs(dx[0][x]);
        let g = ax > a0y ? AMAX * ax + BMIN * a0y : AMAX * a0y + BMIN * ax;
        const c0 = cover(px[0][x] + p0y + lat * seps[0].latent, g);
        // Ink 1
        ax = Math.abs(dx[1][x]);
        g = ax > a1y ? AMAX * ax + BMIN * a1y : AMAX * a1y + BMIN * ax;
        const c1 = cover(px[1][x] + p1y + lat * seps[1].latent, g);
        // Ink 2
        ax = Math.abs(dx[2][x]);
        g = ax > a2y ? AMAX * ax + BMIN * a2y : AMAX * a2y + BMIN * ax;
        const c2 = cover(px[2][x] + p2y + lat * seps[2].latent, g);

        if (c0 + c1 + c2 <= 0) {
          data[o + 3] = 0;
          continue;
        }

        // Additive light: three inks laid on a dark sheet. Where they coincide
        // the mix runs toward white, where they interleave it stays chromatic —
        // which is the moiré showing up as HUE and not only as density.
        const q0 = x * 3;
        const q1 = (W + x) * 3;
        const q2 = (2 * W + x) * 3;
        let r;
        let gr;
        let b;
        if (lat < LATENT_EPS) {
          // The ground, which is most of the plate — straight off the iris.
          r = c0 * colRGB[q0] + c1 * colRGB[q1] + c2 * colRGB[q2];
          gr = c0 * colRGB[q0 + 1] + c1 * colRGB[q1 + 1] + c2 * colRGB[q2 + 1];
          b = c0 * colRGB[q0 + 2] + c1 * colRGB[q1 + 2] + c2 * colRGB[q2 + 2];
        } else {
          // Inside the word, each ink crosses to its opposite on the wheel over
          // the mask's own antialiased edge, so the letterforms carry a
          // contrasting hue without a hard seam around them.
          const m = lat;
          const n = 1 - m;
          const k0r = colRGB[q0] * n + latRGB[q0] * m;
          const k0g = colRGB[q0 + 1] * n + latRGB[q0 + 1] * m;
          const k0b = colRGB[q0 + 2] * n + latRGB[q0 + 2] * m;
          const k1r = colRGB[q1] * n + latRGB[q1] * m;
          const k1g = colRGB[q1 + 1] * n + latRGB[q1 + 1] * m;
          const k1b = colRGB[q1 + 2] * n + latRGB[q1 + 2] * m;
          const k2r = colRGB[q2] * n + latRGB[q2] * m;
          const k2g = colRGB[q2 + 1] * n + latRGB[q2 + 1] * m;
          const k2b = colRGB[q2 + 2] * n + latRGB[q2 + 2] * m;
          r = c0 * k0r + c1 * k1r + c2 * k2r;
          gr = c0 * k0g + c1 * k1g + c2 * k2g;
          b = c0 * k0b + c1 * k1b + c2 * k2b;
        }

        r *= lvl;
        gr *= lvl;
        b *= lvl;

        // Un-premultiply. The compositor will multiply the colour back by this
        // alpha, so the light that lands on the page is exactly (r, gr, b) —
        // and the same alpha correctly lets dense ink cover the sheet, which is
        // what ink does.
        const peak = r > gr ? (r > b ? r : b) : gr > b ? gr : b;
        if (peak <= 0) {
          data[o + 3] = 0;
          continue;
        }
        const inv = 255 / peak;
        data[o] = r * inv;
        data[o + 1] = gr * inv;
        data[o + 2] = b * inv;
        data[o + 3] = peak * 255;
      }
    }
  };

  return { paint, alignAtCentre, separations: N };
};
