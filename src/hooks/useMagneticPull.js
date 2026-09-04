"use client";

import { useEffect, useState } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { onMediaChange } from "@/lib/mediaQuery";

// Pointer-reactive "magnetic" pull for a CTA — the element leans a few px toward
// the cursor while it's over (or just near) the button and springs back home on
// leave. The restrained, physical sibling of useCardTilt: same input-capability
// gate, same spring-follows-a-raw-source-value pattern, same { enabled, style,
// handlers } shape — so the two read as one family of pointer hooks.
//
// Returns inert (no style, no handlers) on anything that isn't a true
// hover/pointer-fine device, or when the user prefers reduced motion — so a
// touch tap never lurches the button sideways and vestibular users get a still,
// stationary CTA. Continuous input-driven translation is exactly the kind of
// motion reduced-motion asks us to suppress.
//
// Measurement is read from `e.currentTarget` in the handlers (the magnetic
// element is the one the handlers are bound to), so the hook owns no ref — it
// composes cleanly over a button that already forwards other refs.

// Max travel, in px. Deliberately small: a premium magnet is a *lean*, not a
// drag. 8px is felt but never reads as the button "coming loose".
const MAX_PULL_PX = 8;
// Slightly under-damped so the button eases toward the cursor and settles with
// the faintest physical "catch" rather than snapping — premium, never wobbly.
const PULL_SPRING = { stiffness: 150, damping: 15, mass: 0.5 };

export function useMagneticPull({ maxPull = MAX_PULL_PX } = {}) {
  const prefersReducedMotion = useReducedMotion();
  const [hasHover, setHasHover] = useState(false);

  // Resolve input capability on the client only (matchMedia is browser-only).
  // Starts false so SSR + first paint render the inert button, then arms once
  // we know the device hovers — no layout shift, the magnet just switches on.
  useEffect(() => {
    const mql = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setHasHover(mql.matches);
    update();
    return onMediaChange(mql, update);
  }, []);

  const enabled = hasHover && !prefersReducedMotion;

  // Hooks run unconditionally; `enabled` only decides whether the values are
  // ever driven off rest and whether style/handlers are wired.
  const xRaw = useMotionValue(0);
  const yRaw = useMotionValue(0);
  const x = useSpring(xRaw, PULL_SPRING);
  const y = useSpring(yRaw, PULL_SPRING);

  // Spring the button home — exposed so a caller can release the magnet on a
  // state change (e.g. when the CTA flips to its busy state) even if no
  // pointerleave fires, since disabled buttons stop emitting pointer events.
  const release = () => {
    xRaw.set(0);
    yRaw.set(0);
  };

  const handlers = enabled
    ? {
        onPointerMove: (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          // Cursor offset from the button's centre, normalised to [-0.5, 0.5],
          // so the pull reaches ±maxPull at the edges and eases to 0 at centre.
          const px = (e.clientX - rect.left) / rect.width - 0.5;
          const py = (e.clientY - rect.top) / rect.height - 0.5;
          xRaw.set(px * 2 * maxPull);
          yRaw.set(py * 2 * maxPull);
        },
        onPointerLeave: release,
      }
    : undefined;

  // Motion values, so the translate updates per frame without React re-renders.
  // Merge into the button's own style (it keeps its colour / text-shadow).
  const style = enabled ? { x, y } : undefined;

  return { enabled, style, handlers, release };
}
