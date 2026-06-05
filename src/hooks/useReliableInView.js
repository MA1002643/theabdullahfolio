"use client";

import { useEffect, useState } from "react";

/**
 * A transform-safe "is this element in view?" hook.
 *
 * Why this exists: the about-page cards are wrapped in an `ItemLayout` that
 * animates `scale 0 → 1` on entry. framer-motion's `useInView` (and a raw
 * IntersectionObserver) attached anywhere inside that subtree reads the
 * element's area as ZERO at entry — `transform: scale(0)` collapses the box —
 * and an IntersectionObserver does NOT re-fire for a transform-only size
 * change (transforms don't trigger layout, which is what queues observer
 * notifications). So on the `/about` route, where the "Projects shipped" and
 * "Years in the craft" cards are already on screen at scroll 0 and never get a
 * later scroll to nudge the observer, `useInView` stayed stuck `false` and the
 * count-ups never ran — the digits sat at 0.
 *
 * This hook sidesteps that by measuring `getBoundingClientRect()` directly,
 * which always reflects the LIVE transformed bounds. It checks on scroll/resize
 * (passive) and, crucially, runs a short `requestAnimationFrame` burst right
 * after mount so it catches the scale-up settling — the exact window the
 * IntersectionObserver misses. The rAF burst self-terminates after the
 * entrance is done; scroll/resize listeners keep it live afterwards.
 *
 * `amount` is the fraction of the element's own height that must be visible to
 * count as in view (mirrors framer's `amount`). Because scale affects the
 * visible portion and the element height equally, the ratio is scale-invariant
 * — so it reports correctly even mid-entrance.
 *
 * @param {React.RefObject<HTMLElement>} ref
 * @param {object} [opts]
 * @param {number} [opts.amount=0.3] - visible-height fraction threshold
 * @param {number} [opts.settleFrames=45] - rAF ticks (~0.75s) to watch the entrance
 * @returns {boolean} inView
 */
export function useReliableInView(ref, { amount = 0.3, settleFrames = 45 } = {}) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return undefined;

    let rafId = 0;
    let frames = 0;

    const check = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      // Visible vertical extent of the element within the viewport.
      const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      const ratio = r.height > 0 ? visible / r.height : 0;
      // Functional update so React bails when the value is unchanged — no
      // re-render churn from the rAF burst once the state has settled.
      setInView((prev) => {
        const next = ratio >= amount;
        return prev === next ? prev : next;
      });
    };

    check();

    const onScrollResize = () => check();
    window.addEventListener("scroll", onScrollResize, { passive: true });
    window.addEventListener("resize", onScrollResize);

    // Watch the entrance scale-up (a transform the observers can't see) for a
    // short burst, then stop — scroll/resize keep it accurate from there.
    const tick = () => {
      check();
      if (frames++ < settleFrames) {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("scroll", onScrollResize);
      window.removeEventListener("resize", onScrollResize);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [ref, amount, settleFrames]);

  return inView;
}
