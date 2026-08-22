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

// Elements that are vertical SCRUB surfaces (the homepage laptop, which
// drives the orbital nav when the pointer glides up/down over it — issue
// #105). Over one, the ring grows a pair of breathing ↑ ↓ chevrons: the
// cursor itself teaches the gesture, which matters because this component
// hides the OS cursor — a CSS `cursor: ns-resize` on the element would never
// be seen. Interactive targets win: a nav button passing over the laptop
// shows the ordinary grow, not the scrub hint.
const SCRUB = '[data-cursor="scrub"]';

const DOT = 7; // px
const RING = 34; // px
const MAGNET = 0.28; // how strongly the ring leans toward a target's centre
const MAGNET_MAX = 36; // px cap, so large elements don't yank the ring to their middle

const clamp = (v, m) => (v < -m ? -m : v > m ? m : v);

export default function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
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
        setScrubbing(false);
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
        // Not interactive — maybe a scrub surface. Cheap to set every move:
        // React bails when the boolean is unchanged.
        setScrubbing(
          e.target instanceof Element ? !!e.target.closest(SCRUB) : false,
        );
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
          scale: pressed ? 0.82 : hovering ? 1.25 : scrubbing ? 1.12 : 1,
          opacity: hovering ? 0.95 : scrubbing ? 0.9 : 0.55,
        }}
        transition={{ type: 'spring', stiffness: 350, damping: 26, mass: 0.5 }}
      />
      {/* Scrub hint — a pair of chevrons breathing apart above and below the
          ring while the pointer rests on a vertical scrub surface (the
          homepage laptop): "this surface reads up-and-down movement". Rides
          the ring's own sprung position so it feels like part of the cursor,
          not an overlay chasing it. Rendered permanently and faded, rather
          than mounted on demand, so the first hover never pays a mount. No
          reduced-motion branch is needed: this whole component disables
          itself under `prefers-reduced-motion` (see `enabled`). */}
      <motion.div
        className="custom-cursor-scrub"
        style={{ x: ringX, y: ringY }}
        animate={{ opacity: scrubbing && !pressed ? 1 : 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <motion.svg
          width="22"
          height="56"
          viewBox="0 0 22 56"
          style={{ position: 'absolute', left: -11, top: -28 }}
          animate={
            scrubbing ? { y: [0, -2.5, 0, 2.5, 0] } : { y: 0 }
          }
          transition={
            scrubbing
              ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.2 }
          }
        >
          <path
            d="M 4 10 L 11 3 L 18 10"
            fill="none"
            stroke="#ffbb55"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 4 46 L 11 53 L 18 46"
            fill="none"
            stroke="#ffbb55"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </motion.div>
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
