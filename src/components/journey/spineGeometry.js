// Serpentine spine geometry for /journey (issue #38, "snake line" revision).
// Pure math, no DOM: the component measures marker centres and hands them in;
// this module answers with the SVG path plus the lookups the instruments need.
//
// The curve is a chain of half-sine bows — one per gap between consecutive
// markers (plus a lead-in from the container top and a lead-out to the foot).
// Half-sines are the whole trick:
//
//   · displacement is zero at both ends of every segment, so the line passes
//     EXACTLY through every milestone marker — the markers/connectors keep
//     their straight-spine geometry contract by construction,
//   · with the bow side alternating per segment, the end slope of one segment
//     equals the start slope of the next (±Aπ/h at every node), so the joins
//     are tangent-continuous — a snake, not a string of scallops,
//   · the parity works out so each bow bends AWAY from the side the card
//     below it occupies (card i sits on the right for even i, and segment i
//     bows left for even i), keeping the line out of the cards' column.
//
// The path is emitted as a dense polyline (one point every ~6px of descent)
// rather than fitted béziers: at that density the render is indistinguishable
// from a true curve, and owning the sample table means arc positions and
// tangents come from plain array math — no getTotalLength()/getPointAtLength()
// DOM round-trips (the Stone Passage lesson: measured reality beats
// normalised pathLength), and no per-frame dash repaints — the reveal stays a
// composited clip-path wipe exactly like the straight spine it replaces.
const SAMPLE_STEP = 6; // px of descent per emitted point
const MIN_SAMPLES = 8; // floor for very short segments

/**
 * @param {number[]} markerYs marker centres, px from container top, ascending
 * @param {number} height container height in px
 * @param {number} amplitude max horizontal bow in px
 * @param {number} cx the spine axis' x inside the wrapper (= wrapper width / 2)
 * @returns {{ d: string, total: number, xAtY: (y: number) => number,
 *             tangentAtY: (y: number) => number } | null}
 *          `total` is the true arc length of the polyline (summed from the
 *          samples — the measured-reality flavour of path length, for the
 *          one-shot dash draw-in); tangentAtY is the CSS rotation (deg) that
 *          points an element's local "up" back along the path — the comet
 *          tail's trail angle.
 */
export function buildSpineGeometry(markerYs, height, amplitude, cx) {
  if (!height || height <= 0) return null;

  // Segment nodes: container top, every marker, container foot. Markers are
  // measured (never authored), so guard against duplicates/inversions from a
  // mid-relayout read.
  const nodes = [0];
  markerYs.forEach((y) => {
    const clamped = Math.min(Math.max(y, 0), height);
    if (clamped > nodes[nodes.length - 1] + 1) nodes.push(clamped);
  });
  if (height > nodes[nodes.length - 1] + 1) nodes.push(height);

  const xs = [];
  const ys = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const y0 = nodes[i];
    const y1 = nodes[i + 1];
    const span = y1 - y0;
    // Segment 0 is the lead-in above the first marker, so the marker-to-marker
    // segment below marker k is segment k+1; card k sits right for even k and
    // the bow must go left there → odd segment indices bow left.
    const side = i % 2 === 1 ? -1 : 1;
    // Short gaps get a proportionally shallower bow so the curve never turns
    // sharper than the long gaps establish.
    const bow = side * amplitude * Math.min(1, span / 160);
    const samples = Math.max(MIN_SAMPLES, Math.round(span / SAMPLE_STEP));
    // Drop each segment's first point (it duplicates the previous last).
    for (let s = i === 0 ? 0 : 1; s <= samples; s += 1) {
      const t = s / samples;
      xs.push(cx + bow * Math.sin(Math.PI * t));
      ys.push(y0 + span * t);
    }
  }

  const d = xs
    .map(
      (x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${ys[i].toFixed(2)}`,
    )
    .join(' ');

  let total = 0;
  for (let i = 1; i < xs.length; i += 1) {
    total += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }

  // ys ascends strictly (every segment marches downward), so position and
  // tangent lookups are a binary search + lerp over the sample table.
  const indexFor = (y) => {
    let lo = 0;
    let hi = ys.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ys[mid] <= y) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  const xAtY = (y) => {
    const yc = Math.min(Math.max(y, 0), height);
    const i = indexFor(yc);
    const j = Math.min(i + 1, ys.length - 1);
    const spanY = ys[j] - ys[i];
    const t = spanY > 0 ? (yc - ys[i]) / spanY : 0;
    return xs[i] + (xs[j] - xs[i]) * t;
  };

  const tangentAtY = (y) => {
    const yc = Math.min(Math.max(y, 0), height);
    const i = Math.min(indexFor(yc), ys.length - 2);
    const dx = xs[i + 1] - xs[i];
    const dy = ys[i + 1] - ys[i];
    // Rotation that maps local (0,-1) — a tail drawn straight up — onto the
    // backward path direction (-dx,-dy), i.e. the tail trails the curve.
    return (Math.atan2(-dx, dy) * 180) / Math.PI;
  };

  return { d, total, xAtY, tangentAtY };
}
