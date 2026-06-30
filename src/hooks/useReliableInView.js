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
 * Returns `{ inView, settledInView }`:
 *   - `inView` is the RAW, instantaneous `ratio >= amount` reading. Use it for
 *     count-ups, banners, and timer gating that want to react to true visibility
 *     (the count-ups debounce internally via useViewportCountUp, so the raw
 *     signal is correct for them).
 *   - `settledInView` is a debounced, ASYMMETRIC-hysteresis boolean — the
 *     geometry-measured twin of useViewportCountTrigger's `settledInView`, for
 *     the cards that can't use that IntersectionObserver-based hook (they sit
 *     behind the intro loader at scroll 0, where an observer reads zero area).
 *     It flips TRUE at `ratio >= amount` and FALSE only after a *sustained FULL
 *     exit* (no pixels visible) for `leaveDelayMs`. Drive whileInView-style
 *     ENTRANCE variants off this: a reversible entrance whose own `translateY`
 *     dips the card back under `amount` while it's parked partially on screen
 *     can no longer reset itself, so the "content loads on and off when only
 *     ~10% is visible" flicker loop is broken. It still replays on a genuine
 *     scroll-away-and-back, because a real full exit re-arms it.
 *
 * @param {React.RefObject<HTMLElement>} ref
 * @param {object} [opts]
 * @param {number} [opts.amount=0.3] - visible-height fraction threshold
 * @param {number} [opts.settleFrames=45] - rAF ticks (~0.75s) to watch the entrance
 * @param {number} [opts.leaveDelayMs=300] - hysteresis on exit for `settledInView`;
 *   the element must stay fully out at least this long before the entrance re-arms
 * @returns {{ inView: boolean, settledInView: boolean }}
 */
export function useReliableInView(
  ref,
  { amount = 0.3, settleFrames = 45, leaveDelayMs = 300 } = {},
) {
  const [inView, setInView] = useState(false);
  const [settledInView, setSettledInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return undefined;

    let rafId = 0;
    let frames = 0;
    // Pending re-arm timer for the asymmetric `settledInView` hysteresis. A
    // closure var (not a ref) because this effect's deps are stable, so it
    // persists for the component's life; cleared in the cleanup below. A quick
    // flicker back over `amount` — or any pixel staying on screen — cancels it
    // before it can reverse the entrance.
    let leaveTimer = 0;

    const check = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      // Visible vertical extent of the element within the viewport.
      const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      const ratio = r.height > 0 ? visible / r.height : 0;
      const isIn = ratio >= amount;
      // Any part of the element on screen at all — the loop-breaker. The
      // entrance's own transform can dip the card under `amount`, but it can't
      // push a parked card fully off-screen, so while `anyVisible` holds we keep
      // `settledInView` latched instead of resetting it.
      const anyVisible = r.height > 0 && visible > 0;

      // Functional update so React bails when the value is unchanged — no
      // re-render churn from the rAF burst once the state has settled.
      setInView((prev) => (prev === isIn ? prev : isIn));

      // ── Asymmetric hysteresis for `settledInView` (mirrors useViewportCountTrigger) ──
      if (isIn) {
        // True entry (or recovery from a sub-threshold dip). Cancel any pending
        // reset and show the entrance immediately; idempotent so a flicker that
        // never reset it is a no-op re-render.
        if (leaveTimer) {
          clearTimeout(leaveTimer);
          leaveTimer = 0;
        }
        setSettledInView((prev) => (prev ? prev : true));
      } else if (anyVisible) {
        // Below `amount` but still partially visible — HOLD. Cancel any pending
        // reset and schedule none, so the entrance COMPLETES rather than
        // restarting. This is what stops the half-visible flicker loop.
        if (leaveTimer) {
          clearTimeout(leaveTimer);
          leaveTimer = 0;
        }
      } else if (!leaveTimer) {
        // Fully out of view — the genuine sustained-exit candidate. Wait the
        // debounce before re-arming so momentum-scroll wobble past the edges is
        // absorbed; only a real, complete exit reverses the entrance.
        leaveTimer = window.setTimeout(() => {
          setSettledInView((prev) => (prev ? false : prev));
          leaveTimer = 0;
        }, leaveDelayMs);
      }
    };

    check();

    const onScrollResize = () => check();
    window.addEventListener("scroll", onScrollResize, { passive: true });
    window.addEventListener("resize", onScrollResize);

    // Watch the entrance scale-up (a transform the observers can't see) for a
    // short burst, then stop — scroll/resize keep it accurate from there.
    const tick = () => {
      check();
      if (frames < settleFrames) {
        frames++;
        rafId = window.requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };
    // (Re)start the rAF burst. Runs on mount and again whenever the intro loader
    // lifts. The cards that use this hook sit behind the full-screen loader (see
    // LoaderWrapper): their wrapper is held at scale 0 — a zero-area box — until
    // the reveal, then grows to full size only AFTER the mount-time burst has
    // ended. That first burst therefore concludes "not in view" and, with no
    // scroll/resize to re-check, the count-up would sit at 0 forever. Re-watching
    // on `loaderdone` catches the post-reveal scale-up. Guarded so overlapping
    // calls can't spawn parallel rAF loops.
    const startBurst = () => {
      frames = 0;
      if (!rafId) rafId = window.requestAnimationFrame(tick);
    };
    startBurst();
    window.addEventListener("loaderdone", startBurst);

    return () => {
      window.removeEventListener("scroll", onScrollResize);
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("loaderdone", startBurst);
      if (rafId) window.cancelAnimationFrame(rafId);
      if (leaveTimer) window.clearTimeout(leaveTimer);
    };
  }, [ref, amount, settleFrames, leaveDelayMs]);

  return { inView, settledInView };
}
