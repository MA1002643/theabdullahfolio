"use client";

import { useEffect, useState } from "react";

/**
 * Whether the full-screen intro loader (see `components/loaderWrapper`) has
 * finished and revealed the real page.
 *
 * Why this exists: LoaderWrapper mounts the page *behind* a z-9999 overlay from
 * the very first render and only wipes it away after a ~3.3s count + pulse +
 * wipe sequence. Any entrance animation an above-the-fold element runs on mount
 * (or on a `whileInView` that's already satisfied at scroll 0) therefore plays
 * AND finishes while still covered — by the time the user can see the element it
 * is already at its final state, so it reads as "no animation at all". Elements
 * that must reveal themselves *as the user actually sees them* gate their
 * entrance on this flag instead of on mount/viewport.
 *
 * LoaderWrapper signals completion two ways, both handled here:
 *  • `window.__loaderDone` is set `true` once it's done — covers the case where
 *    the loader had already lifted before this hook mounted (e.g. a client-side
 *    navigation to the page after the loader played, or the repeat-visit skip).
 *  • a `loaderdone` window event is dispatched on completion — covers the normal
 *    case where this hook mounts behind the loader and waits for the reveal.
 *
 * A safety timeout flips the flag `true` regardless, so a dropped or missed
 * signal can never strand a gated element invisible.
 *
 * @returns {boolean} revealed
 */
export function useLoaderRevealed() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    // Loader already finished before we mounted — reveal immediately.
    if (window.__loaderDone) {
      setRevealed(true);
      return undefined;
    }
    const onDone = () => setRevealed(true);
    window.addEventListener("loaderdone", onDone);
    // Insurance only: comfortably past the loader's worst-case ~3.3s sequence,
    // so a missed signal still reveals the element rather than leaving it blank.
    const fallback = window.setTimeout(onDone, 6000);
    return () => {
      window.removeEventListener("loaderdone", onDone);
      window.clearTimeout(fallback);
    };
  }, []);

  return revealed;
}
