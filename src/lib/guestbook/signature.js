// Ink-signature path grammar (issue #40 Phase 3). A signature is stored as ONE
// normalised SVG path string, and that string is untrusted user input that
// ends up in the DOM — so both sides of the wire run the same strict
// validator: the API route before storage, SignatureGlyph before render.
//
// Grammar (deliberately far narrower than SVG's):
//   • commands: uppercase M, L, Q, C, Z only
//   • numbers: each coordinate bounded by ITS OWN axis of the viewbox — x in
//     0–100, y in 0–40 (control points included) — at most 2 decimals, a
//     leading minus rejected by the range check (nothing legitimate is ever
//     negative). One cap for both axes let y run to 100 in a 40-tall space:
//     a hand-built path passed both gates and, through the glyph's
//     overflow-visible SVG, painted ink outside the signature's box.
//   • separators: spaces and/or commas
//   • must start with M, contain at least one drawing command (L/Q/C), and
//     stay under MAX_SIGNATURE_BYTES / MAX_SIGNATURE_COMMANDS
//
// Anything else — transforms, arcs, scientific notation, e/E, url(), quotes —
// fails the tokenizer and the whole signature is rejected outright.

export const SIGNATURE_VIEWBOX = { width: 100, height: 40 };
export const MAX_SIGNATURE_BYTES = 4096;
export const MAX_SIGNATURE_COMMANDS = 400;

// The pad's point budget, DERIVED from the caps above rather than chosen by
// feel: the most expensive thing one point can serialise to is a dot at the
// far corner — `M 100.0 40.0 L 100.0 40.0` plus its separator, 26 bytes and
// two commands — so 150 points is at most 3,900 bytes / 300 commands, under
// both caps with room to spare (a continuous stroke is cheaper: 24 bytes and
// one command per point). The first cut allowed 160, and its serialiser also
// clamped y to 100 instead of the viewbox's 40, so a stroke dragged off the
// bottom-right corner reached 4,135 bytes and the route refused a signature
// the pad had let the visitor draw. The unit tests pin this arithmetic
// against the real serialiser below.
export const MAX_SIGNATURE_POINTS = 150;

// How many coordinate numbers each command consumes. Every command's
// arguments are (x, y) pairs in order — M/L one pair, Q control + end, C two
// controls + end — so within a command the even-indexed arguments are x and
// the odd-indexed ones y, which is how each is bounded by its own axis below.
const ARITY = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

const NUMBER_RE = /^\d{1,3}(?:\.\d{1,2})?$/;

function isValidNumber(token, max) {
  if (!NUMBER_RE.test(token)) return false;
  const n = Number(token);
  return n >= 0 && n <= max;
}

const AXIS_MAX = [SIGNATURE_VIEWBOX.width, SIGNATURE_VIEWBOX.height];

// Boolean validator — shared verbatim by server (store gate) and client
// (render gate), so a payload that slips past one can never pass the other.
export function isValidSignaturePath(d) {
  if (typeof d !== 'string') return false;
  const trimmed = d.trim();
  if (!trimmed) return false;
  // Byte cap, not char cap — the grammar is ASCII-only anyway, but measure
  // honestly so a multi-byte smuggle can't dodge the limit.
  if (new TextEncoder().encode(trimmed).length > MAX_SIGNATURE_BYTES) {
    return false;
  }

  const tokens = trimmed.replace(/,/g, ' ').split(/\s+/);
  let i = 0;
  let commands = 0;
  let drawCommands = 0;

  if (tokens[0] !== 'M') return false;

  while (i < tokens.length) {
    const cmd = tokens[i];
    const arity = ARITY[cmd];
    if (arity === undefined) return false;
    i += 1;
    for (let n = 0; n < arity; n += 1, i += 1) {
      if (i >= tokens.length || !isValidNumber(tokens[i], AXIS_MAX[n % 2])) {
        return false;
      }
    }
    commands += 1;
    if (cmd === 'L' || cmd === 'Q' || cmd === 'C') drawCommands += 1;
    if (commands > MAX_SIGNATURE_COMMANDS) return false;
  }

  return drawCommands >= 1;
}

// THE stroke geometry — one description of a stroke's centreline, consumed
// by every renderer of it: strokesToPath below (what ships), and in
// useSignaturePad both the live painter (the segment each new sample
// completes) and the resize repaint (the whole stroke). They used to carry
// their own copies of this construction and had drifted: the live canvas and
// the repaint both stopped at the last midpoint, while the serialiser added
// the tail to the final sample, so the signature on screen while drawing was
// shorter than the one that got posted. There is now nothing to keep in
// step.
//
// Quadratic midpoint smoothing, the classic ink trick: from the first sample,
// each segment curves THROUGH a sample (the control point) to the midpoint
// between it and the next, so jittery input reads as one flowing line — and
// the ink therefore always trails the pen by half a sample, which is why the
// last segment is a straight tail from the final midpoint to the final sample
// itself. A single sample is a dot: a zero-length line, a disc under round
// caps. Every segment carries its own `from` so a renderer can paint one in
// isolation; a path serialiser simply ignores it (the current point is
// implicit).
//   → [{ type: 'Q', from, ctrl, to } | { type: 'L', from, to }]
export function strokeSegments(stroke) {
  const [first, ...rest] = stroke;
  const segments = [];
  let prev = first;
  for (let i = 0; i < rest.length - 1; i += 1) {
    const p = rest[i];
    const mid = {
      x: (p.x + rest[i + 1].x) / 2,
      y: (p.y + rest[i + 1].y) / 2,
    };
    segments.push({ type: 'Q', from: prev, ctrl: p, to: mid });
    prev = mid;
  }
  const tail = rest[rest.length - 1];
  if (tail && (tail.x !== prev.x || tail.y !== prev.y)) {
    segments.push({ type: 'L', from: prev, to: tail });
  }
  // A lone sample — or samples that never left the first point — is a dot.
  if (!segments.length) segments.push({ type: 'L', from: first, to: first });
  return segments;
}

// Serialise the pad's strokes (arrays of {x, y} in css px) into the grammar
// above, scaled into the 100×40 signature space by sx/sy. Stroke CENTRELINES
// only — `M x y Q cx cy x y … L x y`, the segments strokeSegments describes —
// one decimal, and each axis clamped to ITS OWN viewbox bound (pointer
// capture lets a stroke run off the pad, and a y of 100 in a 40-tall space is
// both outside the glyph and a byte wider). Pure, so the byte/command budget
// can be asserted against exactly what ships. Returns null when there is
// nothing to draw.
export function strokesToPath(strokes, sx = 1, sy = 1) {
  const fx = (v) => clamp(v * sx, 0, SIGNATURE_VIEWBOX.width).toFixed(1);
  const fy = (v) => clamp(v * sy, 0, SIGNATURE_VIEWBOX.height).toFixed(1);

  const parts = [];
  for (const stroke of strokes) {
    if (!stroke?.length) continue;
    parts.push(`M ${fx(stroke[0].x)} ${fy(stroke[0].y)}`);
    for (const seg of strokeSegments(stroke)) {
      parts.push(
        seg.type === 'Q'
          ? `Q ${fx(seg.ctrl.x)} ${fy(seg.ctrl.y)} ${fx(seg.to.x)} ${fy(seg.to.y)}`
          : `L ${fx(seg.to.x)} ${fy(seg.to.y)}`,
      );
    }
  }
  return parts.length ? parts.join(' ') : null;
}

// Re-express pad geometry when the pad's css box changes size (a viewport
// resize, a phone rotating, the on-screen keyboard reflowing the composer):
// strokes are recorded in css px of the box they were drawn in, so replaying
// them unchanged into a different box clips ink that the pad shrank away
// from, or leaves it huddled top-left when the pad grew — and strokesToPath,
// which normalises against the CURRENT box, would then ship a different
// signature from the one the visitor saw. Scaling each axis by its own ratio
// keeps every point at the same fraction of the pad, which is exactly what the
// normalised path encodes — so the serialisation is invariant across a resize
// (the unit tests pin that). A non-positive dimension (a hidden pad reports
// 0×0) is not a size: the input is returned untouched.
export function rescalePoint(p, from, to) {
  return { x: (p.x * to.w) / from.w, y: (p.y * to.h) / from.h };
}

export function rescaleStrokes(strokes, from, to) {
  if (
    !(from?.w > 0 && from?.h > 0 && to?.w > 0 && to?.h > 0) ||
    (from.w === to.w && from.h === to.h)
  ) {
    return strokes;
  }
  return strokes.map((stroke) => stroke.map((p) => rescalePoint(p, from, to)));
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Preset "marks" — the keyboard-operable alternative to drawing, and the only
// signature input on a device with no pointer at all (issue #40 Phase 3;
// SignatureField offers them as real buttons beneath the pad, restored on
// code review after a pass that had left the canvas as the sole path).
// Hand-authored in the 100×40 signature space; every path here must pass
// isValidSignaturePath, which the unit tests assert so a preset can never
// drift out of the grammar it is the fallback for.
export const PRESET_MARKS = [
  {
    id: 'flourish',
    label: 'Flourish',
    d: 'M 10 30 C 30 5 45 5 55 20 C 62 30 75 32 90 12',
  },
  {
    id: 'wave',
    label: 'Wave',
    d: 'M 10 25 Q 20 10 30 25 Q 40 40 50 25 Q 60 10 70 25 Q 80 40 90 25',
  },
  {
    id: 'spark',
    label: 'Spark',
    d: 'M 50 6 L 50 34 M 36 11 L 64 29 M 64 11 L 36 29',
  },
  {
    id: 'orbit',
    label: 'Orbit',
    d: 'M 50 10 C 74 10 90 14 90 20 C 90 28 72 34 50 34 C 26 34 10 28 10 20 C 10 13 28 10 50 10 Z',
  },
];
