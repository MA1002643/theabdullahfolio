'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, visualElementStore } from 'framer-motion';
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
//
// Focus (CI, 2026-11-08): a Tab that lands inside an element that has not
// revealed yet must find it on screen. Tab scrolls the element in, its gate
// opens, and the stagger delay then holds a station's link lowered out of its
// mask (or a tile at opacity 0) for up to ~0.3s: a focus ring on nothing, which
// the keyboard suite caught as "obscured" (WCAG 2.4.11). So focus entering
// first sets `instant`: `on` at once, and callers pass it beside reduceMotion
// to `staged`, which lands every layer at rest with a 0s transition. Focus
// after the reveal changes nothing.
//
// "Before the reveal" means until the reveal has FINISHED, not until it was
// scheduled (review, 2026-11-08). Focus can land in three windows:
//   · pending, the gate shut or the delay not yet resolved: `instant` opens it
//     with a 0s transition, as above;
//   · running, the gate open and framer's tweens in their stagger delay or
//     mid-flight: a new `transition` prop alone would NOT reach them, because
//     framer re-animates only values whose target changed and the targets
//     have not. So the running tweens are settled explicitly
//     (`settleRunningLayers`): each one jumps to its end, and `instant` keeps
//     any later change at 0s;
//   · finished: nothing to do.
export const REVEAL_MARGIN = '0px 0px -10% 0px';

/**
 * Jump every framer tween running under `root` (the root included) to its end.
 * Returns whether any was running, i.e. whether the reveal had not finished.
 *
 * Goes through framer's own visual elements, so the motion values the layers
 * render from are the ones that land: nothing writes to `style` behind framer's
 * back, and nothing can overwrite the result on the next frame.
 *
 * Not `animation.complete()`: in framer 11 a tween completed during its delay
 * phase finishes on its FIRST keyframe (the delay branch of the tick wins), so
 * a station still waiting out its stagger would "complete" at 140% below its
 * mask. The tween is stopped and its value jumped to the final keyframe.
 */
export function settleRunningLayers(root) {
  if (!root) return false;
  let running = false;
  const nodes = [root, ...root.querySelectorAll('*')];
  for (const node of nodes) {
    const visual = visualElementStore.get(node);
    if (!visual) continue;
    visual.values.forEach((value) => {
      if (!value.isAnimating()) return;
      running = true;
      const animation = value.animation;
      const resolved = animation?.resolved;
      const target =
        resolved?.finalKeyframe ??
        resolved?.keyframes?.at(-1) ??
        animation?.options?.keyframes?.at(-1);
      if (target == null) {
        value.stop();
        return;
      }
      value.jump(target);
    });
  }
  return running;
}
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

  // Under reduced motion the element is at rest from the first render; with
  // motion it plays once its delay has been resolved (one effect tick).
  const played = reduceMotion || (gate && delay != null);
  const [instant, setInstant] = useState(false);
  const playedRef = useRef(played);
  useEffect(() => {
    playedRef.current = played;
  }, [played]);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion) return undefined;
    // `focusin` bubbles, so it also fires for the element itself when it is
    // the focusable one (an Instruments tile is the link).
    const onFocusIn = () => {
      // Pending: not yet played (the ref trails `played` by one effect, so a
      // reveal that has only just been scheduled also counts as pending).
      if (!playedRef.current) {
        setInstant(true);
        return;
      }
      // Running: settle every layer still in its delay or mid-tween.
      if (settleRunningLayers(el)) setInstant(true);
    };
    el.addEventListener('focusin', onFocusIn);
    return () => el.removeEventListener('focusin', onFocusIn);
  }, [reduceMotion]);

  return {
    ref,
    on: played || instant,
    delay: instant ? 0 : (delay ?? 0),
    instant,
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
