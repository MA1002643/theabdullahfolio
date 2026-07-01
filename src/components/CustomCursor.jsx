'use client';

import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { onMediaChange } from '@/lib/mediaQuery';

// ── Custom cursor ───────────────────────────────────────────────────────────
// Site-wide pointer: a crisp ember dot pinned to the real cursor + an outline
// ring that trails it with spring physics. Over interactive targets the ring
// swells and leans toward the element's centre (a magnetic "stick"); over plain
// background it relaxes to a calm dot + ring. On press both nudge inward.
//
// It only activates on a FINE pointer with motion allowed — touch devices and
// `prefers-reduced-motion` users keep the native cursor untouched (the
// `custom-cursor-active` class that hides the OS cursor is added only when on).
//
// Position is driven entirely through motion values, so moving the mouse never
// triggers a React re-render; only the discrete hover/press flags use state.

// Elements that should make the ring swell + stick.
const INTERACTIVE =
  'a, button, input, textarea, select, label, summary, [role="button"], [data-cursor="grow"]';

const DOT = 7; // px
const RING = 34; // px
const MAGNET = 0.28; // how strongly the ring leans toward a target's centre
const MAGNET_MAX = 36; // px cap, so large elements don't yank the ring to their middle

const clamp = (v, m) => (v < -m ? -m : v > m ? m : v);

export default function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [pressed, setPressed] = useState(false);
  // True once a real pointer position has arrived. The dot/ring start parked
  // off-screen (-100), so hiding the OS cursor the instant we activate would
  // leave a brief window with NO visible cursor at all. Gate the cursor-hiding
  // on this so the swap only happens once the custom dot has somewhere to be.
  const [located, setLocated] = useState(false);

  // Dot tracks the raw pointer (no lag); the ring springs toward its own target,
  // which is the pointer — or a point leaned toward a hovered element's centre.
  const dotX = useMotionValue(-100);
  const dotY = useMotionValue(-100);
  const ringTX = useMotionValue(-100);
  const ringTY = useMotionValue(-100);
  const ringSpring = { stiffness: 260, damping: 28, mass: 0.6 };
  const ringX = useSpring(ringTX, ringSpring);
  const ringY = useSpring(ringTY, ringSpring);

  // Activate only for fine pointers with motion allowed; re-evaluate on change
  // (e.g. plugging in a mouse, or toggling the reduced-motion OS setting).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const fine = window.matchMedia('(pointer: fine)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const evaluate = () => setEnabled(fine.matches && !reduce.matches);
    evaluate();
    const unsubscribeFine = onMediaChange(fine, evaluate);
    const unsubscribeReduce = onMediaChange(reduce, evaluate);
    return () => {
      unsubscribeFine();
      unsubscribeReduce();
    };
  }, []);

  // Hide the OS cursor across the whole document while the custom one is live —
  // but only once we actually know where the pointer is, so there's never a
  // flash of "no cursor" between activation and the first pointer event.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('custom-cursor-active', enabled && located);
    return () => root.classList.remove('custom-cursor-active');
  }, [enabled, located]);

  // Pointer tracking + hover/press/magnetic logic.
  useEffect(() => {
    if (!enabled) return undefined;
    let current = null; // the interactive element currently under the pointer

    const onMove = (e) => {
      const x = e.clientX;
      const y = e.clientY;
      dotX.set(x);
      dotY.set(y);
      // First real position — now it's safe to hide the OS cursor (no flash).
      // Cheap to call every move: React bails when the value is unchanged.
      setLocated(true);

      const el =
        e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
      if (el) {
        if (current !== el) {
          current = el;
          setHovering(true);
        }
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        ringTX.set(x + clamp((cx - x) * MAGNET, MAGNET_MAX));
        ringTY.set(y + clamp((cy - y) * MAGNET, MAGNET_MAX));
      } else {
        if (current) {
          current = null;
          setHovering(false);
        }
        ringTX.set(x);
        ringTY.set(y);
      }
    };
    const onDown = () => setPressed(true);
    const onUp = () => setPressed(false);
    // Park the cursor off-screen when the pointer leaves the window.
    const onLeave = () => {
      dotX.set(-100);
      dotY.set(-100);
      ringTX.set(-100);
      ringTY.set(-100);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, [enabled, dotX, dotY, ringTX, ringTY]);

  if (!enabled) return null;

  return (
    <div aria-hidden="true" className="custom-cursor-root">
      <motion.div
        className="custom-cursor-ring"
        style={{
          x: ringX,
          y: ringY,
          width: RING,
          height: RING,
          marginLeft: -RING / 2,
          marginTop: -RING / 2,
        }}
        animate={{
          scale: pressed ? 0.82 : hovering ? 1.25 : 1,
          opacity: hovering ? 0.95 : 0.55,
        }}
        transition={{ type: 'spring', stiffness: 350, damping: 26, mass: 0.5 }}
      />
      <motion.div
        className="custom-cursor-dot"
        style={{
          x: dotX,
          y: dotY,
          width: DOT,
          height: DOT,
          marginLeft: -DOT / 2,
          marginTop: -DOT / 2,
        }}
        animate={{
          scale: pressed ? 0.6 : hovering ? 0.78 : 1,
          opacity: hovering ? 0.8 : 1,
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </div>
  );
}
