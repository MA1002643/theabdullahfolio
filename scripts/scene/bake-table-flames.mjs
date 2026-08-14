// Give the /projects workshop's TABLE candles a little genuine life, by
// gently moving each flame's own filmed pixels. Nothing is drawn on top of
// the plate and nothing outside a flame's own neighbourhood is touched, so
// the hanging lanterns and the crystal chandelier come through exactly as
// generated — the brief's hard constraint.
//
// ── Why this is a straight warp and not a decomposition ──────────────────
// The obvious approach is to split each window into background + flame
// emission, move the emission, and put it back. Three separate attempts at
// that all failed VISIBLY, each in its own way, because every error in the
// split becomes an artefact:
//   • a plain erosion for the background ate the candle bodies, so every
//     candle wore a dark band where its wax used to be lit;
//   • a morphological opening fixed that but strips the carved filigree
//     behind the candles, which the warp then dragged around as scenery;
//   • gating the emission on brightness excluded that carving but also
//     excluded the flame's own soft halo, so the clipped core moved while
//     the halo stayed put and the flame read as a thin ragged spike;
//   • growing the core back out over the halo restored the body but pulled
//     so much surrounding glow through the round-trip that the flame went
//     hazy and washed out.
//
// None of it is necessary. The movement wanted here is about ONE AND A HALF
// PIXELS. At that size the honest thing is to warp the image itself inside a
// soft mask and cross-fade to the untouched original at its edge. Background
// caught inside the mask shifts by a pixel, which no one can see, and there
// is no background estimate to be wrong — so bands, spikes and haze are all
// structurally impossible rather than merely tuned away.
//
// Every time signal is a sum of sine harmonics of the loop length, so the
// animation is EXACTLY periodic over the clip and the existing seamless loop
// stays seamless — no crossfade, no drift, no re-cut.
import { openSync, readSync, writeSync, closeSync, readFileSync, statSync } from 'node:fs';

const [, , RAW_IN, RAW_OUT, FLAMES_JSON, W_S, H_S] = process.argv;
const W = Number(W_S);
const H = Number(H_S);
const FRAME = W * H * 3;
const N = Math.floor(statSync(RAW_IN).size / FRAME);

const { kept } = JSON.parse(readFileSync(FLAMES_JSON, 'utf8'));

// ── Motion parameters ────────────────────────────────────────────────────
// RESTRAINT IS THE POINT. An earlier pass ran these ~6× hotter (lean 0.40,
// height 0.30, emission 0.42) and was rejected on sight, rightly: at that
// amplitude 89 flames slide sideways like flags, balloon, and throb together,
// which reads as an effect applied to a photograph rather than as a lit room.
//
// A real candle in still interior air barely TRANSLATES. It holds its place
// and changes shape — tapering, elongating, dimming a little — so lateral
// travel is a whisper and the work is carried by vertical breathing and a
// gentle change in brightness. Each value is a proportion of the flame's OWN
// height, so a big foreground candle and a small far one stay plausible for
// their size.
const LEAN = 0.06; // sideways travel at the tip, × flame height (~1.5px)
const VSCALE = 0.10; // ± height
const BRIGHT = 0.11; // ± brightness of the flame body

// Not every candle in a room is equally busy. Each flame's amplitude is
// scaled into this range off its own seed, so some sit near still and some
// work — uniform animation was a large part of what made the first attempt
// read as mechanical.
const AMP_MIN = 0.5;

// Below this a flame is too few pixels to warp without turning to mush; those
// keep their brightness change only, and are never moved.
const MIN_WARP_H = 12;

// Harmonics of the loop. Integer multiples only — that is what guarantees the
// result closes on itself. Deliberately LOW: at 24fps over 100 frames the top
// one lands near 1.9Hz, the pace of the large-scale movement the eye actually
// reads on a candle. An earlier pass reached 5.5Hz and the extra energy only
// made the flames jitter.
const HARM = [
  [2, 1.0],
  [3, 0.7],
  [5, 0.42],
  [8, 0.22],
];
const HNORM = HARM.reduce((s, [, a]) => s + a, 0);
const wave = (n, phase) => {
  let s = 0;
  for (const [k, a] of HARM) s += a * Math.sin((2 * Math.PI * k * n) / N + phase * (1 + k * 0.37));
  return s / HNORM;
};

const hash = (x, y) => {
  let h = (Math.round(x) * 374761393 + Math.round(y) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ── Per-flame precomputation ─────────────────────────────────────────────
const fdIn = openSync(RAW_IN, 'r');
const frame0 = Buffer.allocUnsafe(FRAME);
readSync(fdIn, frame0, 0, FRAME, 0);

const flames = [];
for (const f of kept) {
  const fh = Math.max(10, f.h * 1.35); // visible flame is bigger than its clipped core
  const fw = Math.max(6, f.w * 1.5);
  const bx = f.x;
  const by = f.y + f.h * 0.55; // the wick, where a real flame is anchored

  // Window: only as large as the mask plus the travel, since nothing spills
  // beyond it any more.
  const padX = Math.ceil(fw * 2.4 + fh * LEAN + 4);
  const padUp = Math.ceil(fh * 1.7 + 4);
  const padDn = Math.ceil(fh * 0.5 + 4);
  const x0 = Math.max(0, Math.round(bx - padX));
  const x1 = Math.min(W - 1, Math.round(bx + padX));
  const y0 = Math.max(0, Math.round(by - padUp));
  const y1 = Math.min(H - 1, Math.round(by + padDn));
  const ww = x1 - x0 + 1;
  const wh = y1 - y0 + 1;
  if (ww < 8 || wh < 8) continue;

  const mcx = bx - x0;
  const mcy = by - y0 - fh * 0.45;
  const mrx = fw * 1.7;
  const mry = fh * 1.15;

  // Blend mask: 1 over the flame, easing to 0 well before the window edge so
  // the warp cross-fades into untouched pixels and can never show a seam.
  // Gated at the wick as well, so the candle's wax is never moved.
  const mask = new Float32Array(ww * wh);
  for (let y = 0; y < wh; y++) {
    const t = (y - (by - y0)) / (fh * 0.3);
    const gate = t <= 0 ? 1 : t >= 1 ? 0 : 0.5 + 0.5 * Math.cos(t * Math.PI);
    for (let x = 0; x < ww; x++) {
      const dx = (x - mcx) / mrx;
      const dy = (y - mcy) / mry;
      const d = Math.sqrt(dx * dx + dy * dy);
      let m = 0;
      if (d <= 0.75) m = 1;
      else if (d < 1.5) m = 0.5 + 0.5 * Math.cos(((d - 0.75) / 0.75) * Math.PI);
      mask[y * ww + x] = m * gate;
    }
  }

  // Where the flame body actually is, for the brightness change only. A soft
  // ramp high above the lit wax so the candles themselves never pulse.
  const core = new Float32Array(ww * wh);
  for (let y = 0; y < wh; y++) {
    for (let x = 0; x < ww; x++) {
      const p = ((y0 + y) * W + (x0 + x)) * 3;
      const l = 0.2126 * frame0[p] + 0.7152 * frame0[p + 1] + 0.0722 * frame0[p + 2];
      const t = (l - 205) / 35;
      core[y * ww + x] = (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)) * mask[y * ww + x];
    }
  }

  // WHAT IS ALLOWED TO MOVE.
  //
  // Weighting the displacement by the geometric mask alone moves everything
  // inside it — so the carved column and the shelf rail standing behind these
  // candles travelled with the flame, which is the one thing wrong with an
  // otherwise settled look. This weight replaces it: the flame's own bright
  // pixels, tight around its core, get the full shift and everything else
  // gets none, so background samples itself and holds perfectly still.
  //
  // It stays a straight resample — there is no background/emission split
  // here — so none of the banding, thin-spike or haze failures that dogged
  // the decomposition attempts can return through this door.
  //
  // Two terms, and both are needed. The luminance ramp sits ABOVE lit wax
  // (which reaches 230+) so a neighbouring candle body caught in the window
  // is not mistaken for flame; the tight ellipse then keeps even a bright
  // neighbour from qualifying, because it is not near THIS flame's core.
  const move = new Float32Array(ww * wh);
  const trx = fw * 1.25;
  const trY = fh * 0.95;
  for (let y = 0; y < wh; y++) {
    const g = (y - (by - y0)) / (fh * 0.3);
    const gate = g <= 0 ? 1 : g >= 1 ? 0 : 0.5 + 0.5 * Math.cos(g * Math.PI);
    for (let x = 0; x < ww; x++) {
      const dx = (x - mcx) / trx;
      const dy = (y - mcy) / trY;
      const d = Math.sqrt(dx * dx + dy * dy);
      let near = 0;
      if (d <= 0.8) near = 1;
      else if (d < 1.3) near = 0.5 + 0.5 * Math.cos(((d - 0.8) / 0.5) * Math.PI);
      if (near <= 0) continue;
      const p = ((y0 + y) * W + (x0 + x)) * 3;
      const l = 0.2126 * frame0[p] + 0.7152 * frame0[p + 1] + 0.0722 * frame0[p + 2];
      const t = (l - 198) / 40;
      move[y * ww + x] = (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)) * near * gate;
    }
  }

  flames.push({
    x0,
    y0,
    ww,
    wh,
    bx: mcx,
    by: by - y0,
    fh,
    mask,
    core,
    move,
    ph: hash(f.x, f.y) * Math.PI * 2,
    amp: AMP_MIN + (1 - AMP_MIN) * hash(f.y, f.x),
    warp: f.h >= MIN_WARP_H,
  });
}

console.log(`flames prepared: ${flames.length} / ${kept.length}`);

// ── Frame loop ───────────────────────────────────────────────────────────
const fdOut = openSync(RAW_OUT, 'w');
const src = Buffer.allocUnsafe(FRAME);
const out = Buffer.allocUnsafe(FRAME);

for (let n = 0; n < N; n++) {
  readSync(fdIn, src, 0, FRAME, n * FRAME);
  src.copy(out);

  for (const f of flames) {
    const { x0, y0, ww, wh, bx, by, fh, core, move, amp } = f;
    const lean = f.warp ? LEAN * amp * fh * wave(n, f.ph) : 0;
    const vs = f.warp ? 1 + VSCALE * amp * wave(n, f.ph + 2.1) : 1;
    const br = BRIGHT * amp * wave(n, f.ph + 4.3);
    const hs = 1 / Math.sqrt(vs); // a taller flame is a narrower one

    for (let y = 0; y < wh; y++) {
      for (let x = 0; x < ww; x++) {
        const wi = y * ww + x;
        const m = move[wi];
        const k = core[wi];
        if (m <= 0.002 && k <= 0.002) continue;
        const oi = ((y0 + y) * W + (x0 + x)) * 3;

        let r = src[oi];
        let g = src[oi + 1];
        let b = src[oi + 2];

        if (m > 0.002 && f.warp) {
          // Inverse warp, expressed as a DISPLACEMENT so it can be bounded.
          //
          // A pure scale about the wick displaces in proportion to distance
          // from it, so pixels well above the flame move further than the
          // flame itself. A flame elongates; the air above it does not, so
          // `decay` holds the displacement over the flame body and releases
          // it to zero just past the tip.
          //
          // `m` is the flame alpha, NOT the geometric mask. That is what
          // keeps the scenery still: only the flame's own bright pixels are
          // displaced, so the carved column and shelf rail behind these
          // candles sample themselves and do not travel with the fire.
          const dy = y - by;
          const dx = x - bx;
          const upn = Math.max(0, -dy) / fh;
          const decay = upn <= 1 ? 1 : Math.max(0, 1 - (upn - 1) / 0.5);
          const t = m * decay;

          // Lean grows with height above the wick — the tip travels, the base
          // stays put, which is what a candle actually does.
          const prof = Math.min(1, upn) ** 1.2;
          const dispY = dy * (1 / vs - 1) * t;
          const dispX = (dx * (1 / hs - 1) - lean * prof) * t;
          const sx = x + dispX;
          const sy = y + dispY;

          if (sx >= 0 && sy >= 0 && sx < ww - 1 && sy < wh - 1) {
            const ix = sx | 0;
            const iy = sy | 0;
            const fx = sx - ix;
            const fy = sy - iy;
            const p00 = ((y0 + iy) * W + (x0 + ix)) * 3;
            const p10 = p00 + 3;
            const p01 = p00 + W * 3;
            const p11 = p01 + 3;
            const w00 = (1 - fx) * (1 - fy);
            const w10 = fx * (1 - fy);
            const w01 = (1 - fx) * fy;
            const w11 = fx * fy;
            const wr = src[p00] * w00 + src[p10] * w10 + src[p01] * w01 + src[p11] * w11;
            const wg =
              src[p00 + 1] * w00 + src[p10 + 1] * w10 + src[p01 + 1] * w01 + src[p11 + 1] * w11;
            const wb =
              src[p00 + 2] * w00 + src[p10 + 2] * w10 + src[p01 + 2] * w01 + src[p11 + 2] * w11;
            // The displacement is already tapered, so take the warped sample
            // outright — blending by the mask a second time would only soften
            // the flame against a copy of itself.
            r = wr;
            g = wg;
            b = wb;
          }
        }

        if (k > 0.002 && br !== 0) {
          // Brightness rides the flame body only, so wax and scenery hold.
          const gain = 1 + br * k;
          r *= gain;
          g *= gain;
          b *= gain;
        }

        out[oi] = r < 0 ? 0 : r > 255 ? 255 : r;
        out[oi + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        out[oi + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }
  }

  writeSync(fdOut, out, 0, FRAME);
  if (n % 10 === 0) process.stdout.write(`  frame ${n}/${N}\r`);
}
closeSync(fdIn);
closeSync(fdOut);
console.log(`\ndone: ${N} frames`);
