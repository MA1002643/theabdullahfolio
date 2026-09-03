'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_SIGNATURE_POINTS,
  SIGNATURE_VIEWBOX,
  rescalePoint,
  rescaleStrokes,
  strokeSegments,
  strokesToPath,
} from '@/lib/guestbook/signature';

// Canvas ink engine for the guestbook signature (issue #40 Phase 3). Pointer
// events (mouse / touch / pen — one code path) are captured into strokes and
// painted live with quadratic midpoint smoothing, the classic ink trick: each
// segment curves THROUGH the midpoint of consecutive samples, so jittery
// input renders as a continuous flowing line. Stroke width follows pointer
// velocity — fast flicks thin out, slow curls thicken — eased with a lerp so
// the width breathes instead of stuttering.
//
// ONE GEOMETRY. The segments a stroke is made of come from signature.js's
// strokeSegments — the same function strokesToPath serialises — and every
// painter here consumes them: the live painter paints the one segment each
// new sample completes (plus the straight tail on pointer-up, because
// midpoint smoothing leaves the ink half a sample short of the pen until the
// stroke ends), and the resize repaint replays the whole list. The pad used
// to carry its own copies of the construction, and both had drifted from the
// serialiser by exactly that tail: the signature on screen while drawing was
// shorter than the one that got posted, and a repaint after a resize dropped
// it too.
//
// Serialisation is the part with rules: toPathString() emits the stroke
// CENTRELINES as `M x y Q cx cy x y … L x y` in the shared 100×40 signature
// space — via strokesToPath, the SAME module that validates the grammar, so
// what the pad ships and what the server accepts can never drift. A single
// SVG path has ONE stroke width, so the velocity-width ink is a property of
// the drawing feel and the live canvas — the stored glyph renders the
// centreline with round caps, the ember glow and the draw-on animation
// carrying the life.
//
// Data budget: points closer than MIN_DIST px are never recorded, and a
// drawing stops accepting points at MAX_POINTS — which is signature.js's
// MAX_SIGNATURE_POINTS, derived from the server's byte and command caps at the
// worst case a point can cost (a dot at the far corner, 26 bytes), so the
// client cannot draw something the server would reject.

const MIN_DIST = 3; // css px between recorded samples
const MAX_POINTS = MAX_SIGNATURE_POINTS; // total across strokes — see budget note
const WIDTH_MAX = 3.2; // css px, slow ink
const WIDTH_MIN = 1.1; // css px, fast ink
const VELOCITY_K = 0.9; // px/ms → width falloff
const WIDTH_EASE = 0.35; // lerp factor toward target width
const INK = '#eab53e'; // ember-neon — matches the rendered glyph

export function useSignaturePad({ onChange } = {}) {
  const canvasRef = useRef(null);
  const observerRef = useRef(null);
  const strokesRef = useRef([]); // Array<Array<{x, y}>> in css px
  const liveRef = useRef(null); // { last, width, time } while a stroke is down
  const countRef = useRef(0);
  const sizeRef = useRef(null); // { w, h } css px of the last REAL fit
  const [hasInk, setHasInk] = useState(false);

  // Size the bitmap to the element's CSS box × DPR (capped — this is a small
  // pad, 2× is already crisp) so ink is sharp on retina without megapixel
  // canvases. A resize re-rasterises the pad, so existing strokes — recorded
  // in css px of the box they were drawn in — are first RESCALED into the new
  // box (see rescaleStrokes: same fraction of the pad, hence the same
  // serialised signature) and then replayed; without that step a shrink
  // clipped ink and a grow left it huddled top-left, and toPathString shipped
  // a different glyph from the one the visitor saw. sizeRef survives the
  // canvas detaching (panel closed) and re-attaching at a new size, so the
  // scale is always from the last box the ink was actually laid out in.
  //
  // CALLBACK ref, not a mount effect (the "ink lands away from the cursor"
  // bug): the pad's canvas mounts LATE — SignatureField renders it only when
  // its panel is toggled open — so a `useEffect(…, [])` reading
  // `canvasRef.current` at mount finds null, never sizes the bitmap, and
  // never attaches the ResizeObserver. The canvas then keeps the HTML
  // default 300×150 bitmap, which CSS stretches to the pad's real box —
  // every stroke painted at correct local coords DISPLAYS magnified ~2×
  // away from the pointer. React calls this callback the moment the node
  // actually attaches (and with null on detach), so the fit is tied to the
  // canvas's real lifecycle instead of the component's.
  const attachCanvas = useCallback((node) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    canvasRef.current = node;
    if (!node) return;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { clientWidth, clientHeight } = node;
      // A hidden pad reports 0×0 — not a size to scale from or to; keep the
      // last real one so the next real fit scales from where the ink truly is.
      if (clientWidth > 0 && clientHeight > 0) {
        const to = { w: clientWidth, h: clientHeight };
        const from = sizeRef.current;
        if (from && (from.w !== to.w || from.h !== to.h)) {
          strokesRef.current = rescaleStrokes(strokesRef.current, from, to);
          if (liveRef.current) {
            liveRef.current.last = rescalePoint(liveRef.current.last, from, to);
          }
        }
        sizeRef.current = to;
      }
      node.width = Math.max(1, Math.round(clientWidth * dpr));
      node.height = Math.max(1, Math.round(clientHeight * dpr));
      const ctx = node.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw(node, strokesRef.current);
    };
    fit();
    observerRef.current = new ResizeObserver(fit);
    observerRef.current.observe(node);
  }, []);

  // Detach the observer if the whole component unmounts while the canvas is
  // still attached (React only null-calls the ref on the canvas's own
  // unmount, which covers the toggle-closed path).
  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    },
    [],
  );

  const notify = useCallback(() => {
    onChange?.(strokesRef.current.length > 0);
  }, [onChange]);

  const pointerDown = useCallback((e) => {
    if (countRef.current >= MAX_POINTS) return;
    const canvas = canvasRef.current;
    canvas.setPointerCapture(e.pointerId);
    const p = localPoint(canvas, e);
    strokesRef.current.push([p]);
    countRef.current += 1;
    liveRef.current = { last: p, width: WIDTH_MAX * 0.7, time: e.timeStamp };
    setHasInk(true);
  }, []);

  const pointerMove = useCallback(
    (e) => {
      const live = liveRef.current;
      if (!live || countRef.current >= MAX_POINTS) return;
      const canvas = canvasRef.current;
      const p = localPoint(canvas, e);
      const dx = p.x - live.last.x;
      const dy = p.y - live.last.y;
      const dist = Math.hypot(dx, dy);
      if (dist < MIN_DIST) return;

      const dt = Math.max(1, e.timeStamp - live.time);
      const speed = dist / dt; // css px per ms
      const target = Math.max(
        WIDTH_MIN,
        WIDTH_MAX / (1 + speed * VELOCITY_K),
      );
      live.width += (target - live.width) * WIDTH_EASE;

      const stroke = strokesRef.current[strokesRef.current.length - 1];
      stroke.push(p);
      countRef.current += 1;
      // Paint what this sample completes, in the serialiser's own geometry.
      // The second sample only gives a straight provisional lead (the
      // serialiser's whole answer for a two-sample stroke); from the third on,
      // each sample closes the curve THROUGH the previous sample to their
      // midpoint — the second-to-last segment, the last being the provisional
      // tail that pointer-up paints once the stroke is really over. The third
      // sample's curve starts at the first sample, back over the lead, which
      // it hugs for its first half: the stub left past the bend is under a
      // sample apart, inside the round cap.
      const segments = strokeSegments(stroke);
      drawSegment(
        canvas,
        stroke.length === 2 ? segments[0] : segments[segments.length - 2],
        live.width,
      );

      live.last = p;
      live.time = e.timeStamp;
      notify();
    },
    [notify],
  );

  const pointerUp = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (canvas?.hasPointerCapture?.(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      const live = liveRef.current;
      if (live && canvas) {
        // Complete the stroke: the ink ends at the last MIDPOINT, half a
        // sample short of where the pen lifted, and the serialiser's tail
        // covers exactly that gap. Only once a curve exists — a two-sample
        // stroke's straight lead already IS its tail, and a down-up with no
        // movement is a deliberate dot, kept as a single sample that the
        // serialiser turns into a zero-length round-cap segment.
        const stroke = strokesRef.current[strokesRef.current.length - 1];
        if (stroke && stroke.length >= 3) {
          const segments = strokeSegments(stroke);
          const tail = segments[segments.length - 1];
          if (tail.type === 'L') drawSegment(canvas, tail, live.width);
        }
      }
      liveRef.current = null;
      notify();
    },
    [notify],
  );

  const clear = useCallback(() => {
    strokesRef.current = [];
    countRef.current = 0;
    liveRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    setHasInk(false);
    notify();
  }, [notify]);

  // Serialise to the shared signature grammar (see strokesToPath — the scale
  // maps this pad's css box onto the 100×40 space). Returns null when empty.
  const toPathString = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return strokesToPath(
      strokesRef.current,
      SIGNATURE_VIEWBOX.width / canvas.clientWidth,
      SIGNATURE_VIEWBOX.height / canvas.clientHeight,
    );
  }, []);

  return {
    // The callback ref consumers pass as `ref={pad.canvasRef}` — sizing and
    // observation ride the canvas's own attach/detach (see attachCanvas).
    canvasRef: attachCanvas,
    hasInk,
    clear,
    toPathString,
    handlers: {
      onPointerDown: pointerDown,
      onPointerMove: pointerMove,
      onPointerUp: pointerUp,
      onPointerCancel: pointerUp,
    },
  };
}

function localPoint(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function strokeStyle(ctx, width) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255, 109, 5, 0.55)';
  ctx.shadowBlur = 4;
}

// Trace one strokeSegments segment onto an open path.
function traceSegment(ctx, seg) {
  if (seg.type === 'Q') {
    ctx.quadraticCurveTo(seg.ctrl.x, seg.ctrl.y, seg.to.x, seg.to.y);
  } else {
    ctx.lineTo(seg.to.x, seg.to.y);
  }
}

// Paint one segment live, in isolation, at the current velocity width.
function drawSegment(canvas, seg, width) {
  const ctx = canvas.getContext('2d');
  strokeStyle(ctx, width);
  ctx.beginPath();
  ctx.moveTo(seg.from.x, seg.from.y);
  traceSegment(ctx, seg);
  ctx.stroke();
}

// Full repaint (after resize): replay every stroke — the serialiser's exact
// segments, tail included — with a constant mid width; the per-segment
// velocity widths aren't retained, and a rare resize repaint reading slightly
// evener than the live ink is an honest trade. A single-sample dot is drawn
// as a disc outright rather than trusting every engine to cap a zero-length
// line.
function redraw(canvas, strokes) {
  const ctx = canvas.getContext('2d');
  strokeStyle(ctx, (WIDTH_MAX + WIDTH_MIN) / 2);
  for (const stroke of strokes) {
    if (!stroke.length) continue;
    if (stroke.length === 1) {
      ctx.beginPath();
      ctx.arc(stroke[0].x, stroke[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (const seg of strokeSegments(stroke)) traceSegment(ctx, seg);
    ctx.stroke();
  }
}
