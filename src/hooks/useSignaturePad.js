'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_SIGNATURE_POINTS,
  SIGNATURE_VIEWBOX,
  rescalePoint,
  rescaleStrokes,
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
// Serialisation is the part with rules: toPathString() emits the stroke
// CENTRELINES as `M x y Q cx cy x y …` in the shared 100×40 signature space —
// via signature.js's strokesToPath, the SAME module that validates the
// grammar, so what the pad ships and what the server accepts can never drift.
// A single SVG path has ONE stroke width, so the velocity-width ink is a
// property of the drawing feel and the live canvas — the stored glyph renders
// the centreline with round caps, the ember glow and the draw-on animation
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
      // Midpoint smoothing needs the sample BEFORE the last one too: the new
      // segment runs mid(a,b) → mid(b,p), curving through b.
      const b = stroke[stroke.length - 1];
      const a = stroke.length >= 2 ? stroke[stroke.length - 2] : b;
      stroke.push(p);
      countRef.current += 1;
      drawSegment(canvas, a, b, p, live.width);

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
      // A down-up with no movement is a deliberate dot — keep it; the
      // serialiser turns it into a zero-length round-cap segment.
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

// Paint one smoothed segment live: mid(a,b) → mid(b,p), curving through b —
// b is the last recorded sample, a the one before it (a === b on the first
// move of a stroke, which degrades gracefully to a short straight lead-in).
function drawSegment(canvas, a, b, p, width) {
  const ctx = canvas.getContext('2d');
  strokeStyle(ctx, width);
  const from = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const to = { x: (b.x + p.x) / 2, y: (b.y + p.y) / 2 };
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(b.x, b.y, to.x, to.y);
  ctx.stroke();
}

// Full repaint (after resize): replay every stroke with a constant mid width —
// the per-segment velocity widths aren't retained, and a rare resize repaint
// reading slightly evener than the live ink is an honest trade.
function redraw(canvas, strokes) {
  const ctx = canvas.getContext('2d');
  strokeStyle(ctx, (WIDTH_MAX + WIDTH_MIN) / 2);
  for (const stroke of strokes) {
    if (stroke.length < 2) {
      if (stroke.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = INK;
        ctx.fill();
      }
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length - 1; i += 1) {
      const mid = {
        x: (stroke[i].x + stroke[i + 1].x) / 2,
        y: (stroke[i].y + stroke[i + 1].y) / 2,
      };
      ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, mid.x, mid.y);
    }
    ctx.stroke();
  }
}
