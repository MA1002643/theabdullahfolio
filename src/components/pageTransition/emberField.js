// The CPU half of the Ember Passage: it turns the MA monogram outline into a
// cloud of TARGET POINTS, one per ember, plus the per-ember randomness the
// vertex shader needs.
//
// Everything here is generated ONCE per session and uploaded to static GL
// buffers. Nothing is simulated on the CPU and nothing is re-uploaded per frame:
// an ember's whole trajectory is a pure function of (start, target, seed, time)
// evaluated in the vertex shader, so the swarm needs no state at all.
//
// Sampling is uniform over the glyph's AREA, not along its outline. Outline
// sampling is the obvious shortcut and it looks wrong — the mark reads as a wire
// frame rather than a solid body of light, and the counters of the M fill in
// with stray embers because an outline gives no inside/outside information.

import { MONO_D } from '@/components/emblem/monogram';

// Rasterisation resolution for the glyph mask. 512 gives ~30k interior pixels,
// comfortably more than enough distinct positions that repeated sampling is
// invisible once sub-pixel jitter is added.
const MASK_PX = 512;

// The square of EMBLEM space (the original 1024x1024 artboard) the mask covers.
// The glyph spans x 346-671, y 380-660, so this leaves margin on every side.
export const FIELD_VIEW = { x: 296, y: 306, size: 428 };

// Upper bound on the swarm. The buffers are allocated once at this size and a
// smaller PREFIX is drawn on weaker devices, so changing the live count never
// costs an upload.
export const MAX_EMBERS = 90000;

let cached = null;

// Cheap deterministic PRNG. Seeded so the swarm is identical run to run, which
// makes visual regressions reproducible instead of a different shape each click.
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build the three static attribute arrays. Returns null if the browser cannot
// rasterise the path, which callers treat as "use the static fallback".
export function buildEmberField() {
  if (cached) return cached;
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = MASK_PX;
  canvas.height = MASK_PX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Emblem space -> mask pixels. The monogram is an even-odd path (its counters
  // are subtracted, not stacked), so it must be filled with the same rule the
  // SVG uses or the enclosed areas fill solid and the mark loses its counters —
  // which here would mean embers landing inside holes that should stay dark.
  const k = MASK_PX / FIELD_VIEW.size;
  ctx.setTransform(k, 0, 0, k, -FIELD_VIEW.x * k, -FIELD_VIEW.y * k);
  ctx.fillStyle = '#fff';
  ctx.fill(new Path2D(MONO_D), 'evenodd');

  const pixels = ctx.getImageData(0, 0, MASK_PX, MASK_PX).data;

  // Collect every interior pixel once, then sample from that list. Rejection
  // sampling straight into the glyph would spin on the ~88% of the square that
  // is empty; this pays one linear pass and then draws in O(1).
  const inside = [];
  for (let i = 0; i < MASK_PX * MASK_PX; i++) {
    if (pixels[i * 4 + 3] > 127) inside.push(i);
  }
  if (inside.length === 0) return null;

  const rnd = makeRandom(0x9e3779b9);

  const targets = new Float32Array(MAX_EMBERS * 2); // emblem space
  const starts = new Float32Array(MAX_EMBERS * 2); // viewport-normalised 0..1
  const seeds = new Float32Array(MAX_EMBERS * 3); // per-ember randomness

  for (let i = 0; i < MAX_EMBERS; i++) {
    const cell = inside[(rnd() * inside.length) | 0];
    const mx = cell % MASK_PX;
    const my = (cell / MASK_PX) | 0;

    // Sub-pixel jitter, so 90k embers drawn from ~30k cells never visibly
    // collapse onto a lattice.
    targets[i * 2] = FIELD_VIEW.x + (mx + rnd()) / k;
    targets[i * 2 + 1] = FIELD_VIEW.y + (my + rnd()) / k;

    // Start spread over the whole viewport: the swarm reads as the PAGE coming
    // apart, not as a jet emitted from one point.
    starts[i * 2] = rnd();
    starts[i * 2 + 1] = rnd();

    seeds[i * 3] = rnd();
    seeds[i * 3 + 1] = rnd();
    seeds[i * 3 + 2] = rnd();
  }

  cached = { targets, starts, seeds, count: MAX_EMBERS };
  return cached;
}

// Build during idle time so the first navigation finds the buffers ready.
// Returns a cancel function; safe to call more than once.
export function warmEmberField() {
  if (cached || typeof window === 'undefined') return () => {};
  const supportsIdle = typeof window.requestIdleCallback === 'function';
  const schedule = supportsIdle
    ? (cb) => window.requestIdleCallback(cb, { timeout: 4000 })
    : (cb) => setTimeout(cb, 900);
  const handle = schedule(() => {
    try {
      buildEmberField();
    } catch {
      /* a failed build just means the overlay uses its static fallback */
    }
  });
  return () => {
    if (supportsIdle) window.cancelIdleCallback(handle);
    else clearTimeout(handle);
  };
}
