'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import { PLATE_EASE } from './Plate';

// Per-ELEMENT reveal gate for the /uses plates (owner correction 2026-09-06).
//
// The first cut gated every row, station and card on the PLATE's own
// `useInView`: one observer per plate, every child staggering 40ms from the
// same instant. On a plate taller than a viewport — the Stack ledger is
// forty-odd cards — that meant everything below the fold had already
// finished animating by the time the reader scrolled to it, and the page
// read as "no scroll effect at all". Each element now owns its own gate: it
// animates when IT arrives (its top clears the bottom 10% of the viewport),
// once, and only after the plate itself has revealed (which carries the
// intro-loader discipline — nothing is spent behind the loader).
//
// Two staggers, chosen by WHEN the element arrives:
//   · Same beat as the plate — the element was already on screen when the
//     plate revealed (page load, or a plate whose first rows are visible the
//     moment its header is). These cascade: `base + index * step`, so a
//     nameplate engraves row by row and a card row deals left to right.
//   · Later, on its own — the reader scrolled to it. No index delay (a card
//     that waits 0.4s after arriving reads as lag), just the column offset:
//     `columnStagger` seconds spread across the parent's width, so cards
//     sharing a grid row still land left→right rather than as one slab.
//
// Reduced motion (OS or the ⌘K toggle): `on` is true from the first render
// and `delay` is 0 — callers render every layer at rest with a 0s transition.
export const REVEAL_MARGIN = '0px 0px -10% 0px';
const SAME_BEAT_MS = 200;

export function useStagedReveal({
  revealed,
  reduceMotion,
  revealedAtRef,
  index = 0,
  step = 0.08,
  base = 0,
  columnStagger = 0,
  amount = 'some',
  margin = REVEAL_MARGIN,
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount, margin });
  const gate = reduceMotion || (inView && revealed);
  const [delay, setDelay] = useState(null);

  useEffect(() => {
    if (!gate || delay != null) return;
    if (reduceMotion) {
      setDelay(0);
      return;
    }
    const at = revealedAtRef?.current;
    const sameBeat = typeof at === 'number' && performance.now() - at < SAME_BEAT_MS;
    let d = sameBeat ? base + index * step : 0;
    const el = ref.current;
    const parent = el?.parentElement;
    if (columnStagger > 0 && el && parent) {
      const box = el.getBoundingClientRect();
      const row = parent.getBoundingClientRect();
      if (row.width > 0) d += ((box.left - row.left) / row.width) * columnStagger;
    }
    setDelay(d);
  }, [gate, delay, reduceMotion, revealedAtRef, index, step, base, columnStagger]);

  return {
    ref,
    // Under reduced motion the element is at rest from the first render; with
    // motion it plays once its delay has been resolved (one effect tick).
    on: reduceMotion || (gate && delay != null),
    delay: delay ?? 0,
  };
}

// The transition every /uses layer uses: the plate ease, a per-layer offset
// on top of the element's resolved delay, and 0s under reduced motion.
export const staged = (reduceMotion, delay, offset = 0, duration = 0.5, ease = PLATE_EASE) =>
  reduceMotion ? { duration: 0 } : { duration, ease, delay: delay + offset };

// Opacity + 8px rise, the page's baseline row gesture, as motion props.
export const riseProps = (on, reduceMotion, transition, distance = 8) => ({
  initial: reduceMotion ? false : { opacity: 0, y: distance },
  animate: on ? { opacity: 1, y: 0 } : { opacity: 0, y: reduceMotion ? 0 : distance },
  transition,
});
