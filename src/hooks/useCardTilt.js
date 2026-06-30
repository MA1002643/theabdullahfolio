"use client";

import { useEffect, useState } from "react";
import {
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";

// Pointer-reactive 3D tilt + ember glare for the about-page hero cards.
//
// Returns inert (no style, no handlers) on anything that isn't a true
// hover/pointer-fine device, or when the user prefers reduced motion — so
// touch taps never synthesise a janky lurch and vestibular users get a flat,
// still surface. Mirrors the input-capability gate the 404 page already uses
// (see not-found/NotFoundClient.jsx): a parallax/tilt is continuous animated
// motion driven by input, exactly the kind reduced-motion asks to suppress.
//
// Measurement is read from `e.currentTarget` in the handlers (the tilting
// element is the one the handlers are bound to), so the hook owns no ref —
// callers that already forward a ref (e.g. the years card's focus-restoration
// trigger) don't have to merge two.

const MAX_TILT_DEG = 5;
// Springs smooth the raw pointer targets so the card eases toward the cursor
// and settles back rather than snapping. Light + fairly stiff = responsive but
// never wobbly.
const TILT_SPRING = { stiffness: 150, damping: 18, mass: 0.4 };
const GLARE_SPRING = { stiffness: 120, damping: 22, mass: 0.4 };

export function useCardTilt({ maxTilt = MAX_TILT_DEG } = {}) {
  const prefersReducedMotion = useReducedMotion();
  const [hasHover, setHasHover] = useState(false);

  // Resolve the input capability on the client only (matchMedia is browser-
  // only). Starts false so SSR + first paint render the flat card, then flips
  // on once we know the device hovers — no layout shift, the tilt just arms.
  useEffect(() => {
    const mql = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setHasHover(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const enabled = hasHover && !prefersReducedMotion;

  // Hooks must run unconditionally; the `enabled` gate only decides whether the
  // values are ever driven away from rest and whether style/handlers are wired.
  const rotateXRaw = useMotionValue(0);
  const rotateYRaw = useMotionValue(0);
  const rotateX = useSpring(rotateXRaw, TILT_SPRING);
  const rotateY = useSpring(rotateYRaw, TILT_SPRING);

  // Glare position is a percentage point the radial highlight centers on (set
  // instantly so the highlight tracks the cursor exactly). Its opacity springs
  // in on enter / out on leave — driven the SAME way as the rotation: a raw
  // source value the spring follows. A standalone `useSpring(0)` whose `.set()`
  // is called directly does not animate reliably; tracking a source value does.
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const glareOpacityRaw = useMotionValue(0);
  const glareOpacity = useSpring(glareOpacityRaw, GLARE_SPRING);
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255, 109, 5, 0.16), transparent 60%)`;

  const handlers = enabled
    ? {
        onPointerMove: (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          const px = (e.clientX - rect.left) / rect.width; // 0 (left) → 1 (right)
          const py = (e.clientY - rect.top) / rect.height; // 0 (top)  → 1 (bottom)
          rotateXRaw.set((0.5 - py) * 2 * maxTilt);
          rotateYRaw.set((px - 0.5) * 2 * maxTilt);
          glareX.set(px * 100);
          glareY.set(py * 100);
          // Turn the glare on from here (not only onPointerEnter): pointermove
          // fires continuously while the cursor is over the card, so the glare
          // is reliably lit the moment movement begins — independent of whether
          // a discrete enter event arrives.
          glareOpacityRaw.set(1);
        },
        onPointerEnter: () => glareOpacityRaw.set(1),
        onPointerLeave: () => {
          // Spring everything home; the glare fades as it goes.
          rotateXRaw.set(0);
          rotateYRaw.set(0);
          glareOpacityRaw.set(0);
        },
      }
    : undefined;

  // `transformPerspective` gives the ±5° rotation real depth instead of a flat
  // skew. Only handed out when enabled so a flat card carries no transform.
  const style = enabled
    ? { rotateX, rotateY, transformPerspective: 900 }
    : undefined;

  // Background + opacity are motion values, so the glare updates per frame
  // without React re-renders. Consumed by an aria-hidden overlay div.
  const glareStyle = enabled
    ? { background: glareBackground, opacity: glareOpacity }
    : undefined;

  return { enabled, style, glareStyle, handlers };
}
