"use client";

import { useEffect, useState } from "react";
import { useMotionValue, useReducedMotion, useSpring } from "framer-motion";

// Pointer-reactive parallax for the intro emblem seal — the third sibling of
// useCardTilt and useMagneticPull. Same input-capability gate, same
// reduced-motion gate, same spring-follows-a-raw-source-value pattern, so the
// three read as one family of pointer hooks.
//
// One pointermove drives two coupled outputs to fake depth on a flat SVG:
//   • the whole seal tilts a few degrees toward the cursor (rotateX/rotateY)
//   • the central flame monogram *leans further* than the seal does — a larger
//     in-plane translate — so it appears to float above the rings (parallax).
//
// Returns inert (no styles, no handlers) on anything that isn't a true
// hover/pointer-fine device, or when the user prefers reduced motion: a touch
// tap never lurches the emblem, and vestibular users get a still seal. A
// continuous input-driven tilt is exactly the motion reduced-motion suppresses.

const MAX_TILT_DEG = 6; // seal tilt at the edges
const MAX_FLAME_PX = 9; // flame lean at the edges — > tilt, to read as depth

// Slightly under-damped, matching the premium "catch" of useMagneticPull: eases
// toward the cursor and settles without snapping or wobble.
const SEAL_SPRING = { stiffness: 140, damping: 16, mass: 0.5 };
const FLAME_SPRING = { stiffness: 170, damping: 18, mass: 0.4 };

export function useEmblemPointer() {
  const prefersReducedMotion = useReducedMotion();
  const [hasHover, setHasHover] = useState(false);

  // Resolve input capability on the client only (matchMedia is browser-only).
  // Starts false so SSR + first paint render the flat seal, then arms once we
  // know the device hovers — no layout shift, the parallax just switches on.
  useEffect(() => {
    const mql = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setHasHover(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const enabled = hasHover && !prefersReducedMotion;

  // Hooks run unconditionally; `enabled` only decides whether the values are
  // ever driven off rest and whether styles/handlers are wired.
  const rotateXRaw = useMotionValue(0);
  const rotateYRaw = useMotionValue(0);
  const rotateX = useSpring(rotateXRaw, SEAL_SPRING);
  const rotateY = useSpring(rotateYRaw, SEAL_SPRING);

  const flameXRaw = useMotionValue(0);
  const flameYRaw = useMotionValue(0);
  const flameX = useSpring(flameXRaw, FLAME_SPRING);
  const flameY = useSpring(flameYRaw, FLAME_SPRING);

  const release = () => {
    rotateXRaw.set(0);
    rotateYRaw.set(0);
    flameXRaw.set(0);
    flameYRaw.set(0);
  };

  const handlers = enabled
    ? {
        onPointerMove: (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          const px = (e.clientX - rect.left) / rect.width - 0.5; // [-0.5, 0.5]
          const py = (e.clientY - rect.top) / rect.height - 0.5;
          // Tilt: cursor right → rotate around Y toward it; cursor up → tilt up.
          rotateYRaw.set(px * 2 * MAX_TILT_DEG);
          rotateXRaw.set(-py * 2 * MAX_TILT_DEG);
          // Flame leans the same direction, a touch farther, for parallax depth.
          flameXRaw.set(px * 2 * MAX_FLAME_PX);
          flameYRaw.set(py * 2 * MAX_FLAME_PX);
        },
        onPointerLeave: release,
      }
    : undefined;

  // `transformPerspective` gives the tilt real depth instead of a flat skew.
  const sealStyle = enabled
    ? { rotateX, rotateY, transformPerspective: 1100 }
    : undefined;
  const flameStyle = enabled ? { x: flameX, y: flameY } : undefined;

  return { enabled, sealStyle, flameStyle, handlers, release };
}
