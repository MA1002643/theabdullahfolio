'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';

// SliceLabel — the button's "sliced" hover label, re-built so the cutting line
// and the text run on ONE timeline instead of two independent CSS transitions
// (the old `transform 300ms` halves vs `width 700ms` line, which desynced on
// hover-out: the text snapped whole while the line still lagged).
//
// A single `progress` motion value (0 at rest → 1 hovered, animated with the
// SAME duration/ease both ways) drives the sweeping line AND every letter. The
// rest line straddles the button's right edge (a little inside, extending out,
// like the original); on hover its leading edge sweeps left into the word,
// and each letter is cloned into a top/bottom half that part by the blade's
// progress ACROSS that exact letter — 0 until the leading edge reaches the
// letter's right edge, 1 once it clears its left edge. So a letter parts as the
// blade crosses it and reassembles as the blade clears it, in both directions.
// One clock, nothing to desync.

const MAX_LIFT = 4; // px each half travels (top up, bottom down) — matches old ±4
const EDGE_END = -0.1; // blade leading edge at full hover: just past the text's left edge
// The rest stub reproduces the original line (`right: -30px; width: 44px`): its
// leading edge sits REST_INSET_PX inside the button's right edge, and its far
// end extends OUT_PX beyond it (14 inside + 30 out = the old 44px).
const OUT_PX = 30;
const REST_INSET_PX = 14;
const SWEEP_DURATION = 0.5; // seconds — identical in and out; the symmetry that fixes the desync
const SWEEP_EASE = [0.4, 0, 0.2, 1];
// Before measurement, a band fully ahead of progress so split stays 0 (no flash).
const UNMEASURED = { start: 2, end: 3 };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// One character, cloned into a top and bottom half that part vertically. `band`
// is the progress window over which the blade crosses this letter; the part
// amount is progress' position within it, so the cut tracks the line exactly.
function SliceLetter({ char, band, progress }) {
  const span = Math.max(band.end - band.start, 1e-4);
  const split = useTransform(progress, (p) =>
    clamp01((p - band.start) / span),
  );
  const topY = useTransform(split, (s) => -MAX_LIFT * s);
  const botY = useTransform(split, (s) => MAX_LIFT * s);
  // A whitespace-only inline-block collapses to zero width, jamming the words
  // together ("SENDMESSAGE!"), so render spaces as a non-breaking space which
  // keeps its width.
  const glyph = char === ' ' ? '\u00A0' : char;

  return (
    <span
      data-letter
      style={{ position: 'relative', display: 'inline-block', lineHeight: 1 }}
    >
      {/* upper half (in flow — defines the letter box) */}
      <motion.span
        style={{ display: 'block', y: topY, clipPath: 'inset(0 0 50% 0)' }}
      >
        {glyph}
      </motion.span>
      {/* lower half (overlaps the upper exactly) */}
      <motion.span
        style={{
          position: 'absolute',
          inset: 0,
          y: botY,
          clipPath: 'inset(50% 0 0 0)',
        }}
      >
        {glyph}
      </motion.span>
    </span>
  );
}

export default function SliceLabel({ text, hovered }) {
  const reduced = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const containerRef = useRef(null);
  const chars = useMemo(() => [...text], [text]);
  // Geometry derived from measurement: where the blade rests (edgeRest, at the
  // button's right edge), its full travel (span), the distance from the text to
  // the button edge (padPx, for the rest stub's right anchor), and each letter's
  // cut window. Sensible defaults keep the first paint sane pre-measure.
  const [geom, setGeom] = useState(() => ({
    edgeRest: 1.07,
    span: 1.17,
    padPx: 24,
    bands: chars.map(() => UNMEASURED),
  }));
  const progress = useMotionValue(0);

  // Arm only on precise-pointer, non-reduced-motion devices — the same gate the
  // old `@media (any-hover: hover) and (any-pointer: fine)` used. Touch and
  // reduced-motion get plain text: no halves, no sweeping line.
  useEffect(() => {
    if (reduced) {
      setEnabled(false);
      return undefined;
    }
    const mql = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
    const update = () => setEnabled(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [reduced]);

  // Measure in the BUTTON's frame so the blade can rest outside the pill and
  // sweep in through the padding. padPx = distance from the text's right edge to
  // the button's right edge; the leading edge rests there (edgeRest = 1 + padN),
  // so at rest no letter is cut and the stub sits just outside the button. A
  // letter at normalised x is reached when edge(p) = x → p = (edgeRest − x)/span;
  // the cut runs from the letter's right edge (start) to its left edge (end).
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.offsetWidth || 1;
      const btn = el.closest('button');
      const contRight = el.getBoundingClientRect().right;
      // padPx is a relative distance, so it stays correct even while the button
      // carries a magnetic translate (both rects shift together).
      const padPx = btn
        ? Math.max(btn.getBoundingClientRect().right - contRight, 0)
        : 0;
      // Leading edge rests REST_INSET_PX inside the button's right edge (so the
      // stub overlaps a little onto the pill, like the original). It still sits
      // to the right of every glyph, so no letter is cut at rest.
      const edgeRest = 1 + (padPx - REST_INSET_PX) / w;
      const span = edgeRest - EDGE_END; // travels to just past the text's left edge
      const letters = el.querySelectorAll('[data-letter]');
      const bands = Array.from(letters, (n) => {
        const lx = n.offsetLeft / w;
        const rx = (n.offsetLeft + n.offsetWidth) / w;
        return { start: (edgeRest - rx) / span, end: (edgeRest - lx) / span };
      });
      if (bands.length) setGeom({ edgeRest, span, padPx, bands });
    };
    measure();
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => ro?.disconnect();
  }, [enabled, chars]);

  // The whole effect is this one line: a single tween of `progress`, symmetric
  // in and out, that the line and every letter read from. Reverse is the same
  // timeline played backward, so they invert together — the desync, gone.
  useEffect(() => {
    const controls = animate(progress, hovered ? 1 : 0, {
      duration: SWEEP_DURATION,
      ease: SWEEP_EASE,
    });
    return () => controls.stop();
  }, [hovered, progress]);

  // Line leading (left) edge tracks edge(p) = edgeRest − p·span; the right end is
  // anchored OUT_PX beyond the button so the rest stub straddles the pill edge.
  const lineLeft = useTransform(
    progress,
    (p) => `${(geom.edgeRest - p * geom.span) * 100}%`,
  );

  if (!enabled) {
    // Plain label — also the button's footprint anchor. aria-hidden because the
    // <button> already owns the accessible name ("Send message").
    return <span aria-hidden="true">{text}</span>;
  }

  return (
    <span
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'inline-block',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {chars.map((c, i) => (
        <SliceLetter
          key={i}
          char={c}
          band={geom.bands[i] ?? UNMEASURED}
          progress={progress}
        />
      ))}
      <motion.span
        data-blade
        style={{
          position: 'absolute',
          top: '50%',
          left: lineLeft,
          right: `${-(geom.padPx + OUT_PX)}px`,
          height: '1px',
          y: '-50%',
          // The line is a constant rgb(255,109,5) in every state — the same
          // colour as the "SEND MESSAGE!" text. No glow, no shadow: just the
          // solid 1px blade that sweeps in to cut the word and back out.
          background: 'rgb(255, 109, 5)',
          pointerEvents: 'none',
        }}
      />
    </span>
  );
}
