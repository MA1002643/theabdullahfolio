"use client";

import { useEffect, useState } from "react";

// Decide whether the current input is HOVER-capable with a fine pointer (a
// desktop mouse, or a tablet/iPad with a trackpad/Magic Keyboard) versus a
// coarse, touch-only surface (a phone, or an iPad with NO trackpad).
//
// The detection is purely a media query — `(hover: hover) and (pointer: fine)`
// — NOT user-agent sniffing, so it is correct AND reactive: when a Magic
// Keyboard / trackpad is attached to or removed from an iPad, the query result
// flips live and the listener re-renders consumers. That lets the skills grid
// switch between hover-to-morph and tap-to-morph on the fly, with no reload:
//   • can hover  → desktop mouse, or iPad WITH a trackpad → hover morphs the icon
//   • can't hover → phone, or iPad WITHOUT a trackpad      → tap morphs / tap reverts
//
// SSR + first paint default to `true` (hover). This never causes a hydration
// mismatch because `canHover` only gates event handlers and runtime behaviour,
// not the rendered markup — the resting flat icon is identical either way. The
// effect corrects the value on mount, before any interaction can happen.
const QUERY = "(hover: hover) and (pointer: fine)";

export function usePointerCapability() {
  const [canHover, setCanHover] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(QUERY);
    const update = () => setCanHover(mq.matches);
    update();
    // `change` is the modern API; Safari < 14 (older iPads) only has addListener.
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, []);

  return canHover;
}
