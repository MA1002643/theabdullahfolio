"use client";

import { useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Viewport-driven "play this animation once per entry cycle" trigger.
 *
 * Wraps framer-motion's `useInView` and returns a monotonically-
 * increasing `playToken` that increments exactly once per *true* entry
 * — not on every IntersectionObserver flicker. Consumers depend on
 * `playToken` in their effect deps instead of raw `isInView`, which
 * solves the issue #16/17 bug class where rapid in/out scroll
 * oscillations restart a count-up several times in a row, or where the
 * counter resets to 0 when the user is still actively viewing the card
 * but just nudged it past the threshold.
 *
 * Semantics:
 *   - First entry after mount → playToken: 0 → 1, consumer animates.
 *   - Continuous visibility (incl. brief flickers absorbed by
 *     `leaveDelayMs`) → playToken stable, consumer effect does not re-
 *     fire purely because of the flicker.
 *   - Sustained FULL exit (≥ `leaveDelayMs` with NO part of the element
 *     visible) re-arms the trigger; the next entry increments playToken
 *     again. A dip below `amount` while still partially visible does NOT
 *     re-arm — see the asymmetric-threshold note on the observers below.
 *
 * Returns `{ isInView, playToken, settledInView }`:
 *   - `isInView` mirrors the underlying observer (use it for things
 *     that should reflect raw visibility, e.g. lazy mounting or
 *     pausing autoplay).
 *   - `playToken` is the latched, hysteresis-debounced trigger value.
 *     A consumer that depends on `[playToken, target]` will animate
 *     when either a real entry happens or the data changes.
 *   - `settledInView` is a debounced boolean that flips TRUE on a true
 *     entry and FALSE only after a *sustained* exit (the same
 *     `leaveDelayMs` hysteresis that re-arms `playToken`). Unlike
 *     `playToken > 0` — which latches true forever — this reverts, so a
 *     reversible entrance (fade/slide in, then out off-screen, then in
 *     again) can REPLAY on every viewport re-entry while still absorbing
 *     IntersectionObserver flicker. Drive whileInView-style entrances off
 *     this; drive count-ups/arcs (which key off the trigger value) off
 *     `playToken`.
 *
 * @param {React.RefObject<HTMLElement>} ref - element to observe
 * @param {object} [options]
 * @param {number} [options.amount=0.3]      - intersection ratio (passed to useInView)
 * @param {string} [options.margin="0px"]    - rootMargin (passed to useInView)
 * @param {number} [options.leaveDelayMs=300]- hysteresis on exit; element must
 *                                             stay out at least this long before
 *                                             the next entry counts as a new cycle
 */
export function useViewportCountTrigger(ref, options = {}) {
  const {
    amount = 0.3,
    margin = "0px",
    leaveDelayMs = 300,
  } = options;

  // ASYMMETRIC thresholds break a self-sustaining flicker loop. The replay-on-
  // view cards observe the SAME element they animate; a reversible entrance with
  // a `translateY` can dip the element back under `amount` while it's parked
  // partially visible, which (with a single threshold) would flip the trigger
  // off → reset the entrance → move the element back over `amount` → fire again,
  // looping forever (the "content loads on and off when half-visible" glitch).
  //   - `isInView`   (>= `amount`, e.g. 30%) → ENTERS / fires the trigger.
  //   - `anyVisible` (any pixel)             → gates the RESET: we only re-arm /
  //     reverse the entrance once the element is essentially GONE, not merely
  //     below `amount`. The entrance's own small transform can never push a
  //     parked card fully off-screen, so it can no longer reset itself.
  // Replay on a genuine scroll-away still works: a full exit clears `anyVisible`,
  // which (after the debounce) re-arms and reverses for the next true entry.
  const isInView = useInView(ref, { once: false, amount, margin });
  const anyVisible = useInView(ref, { once: false, amount: "some", margin });

  // `playToken` (monotonic trigger count) and `settledInView` (debounced,
  // reversible visibility) are the only state — all other "is it time to
  // trigger?" book-keeping lives in refs so it doesn't itself cause
  // re-renders. `playToken` increments exactly once per real entry cycle;
  // `settledInView` toggles true on entry and false on sustained exit.
  const [playToken, setPlayToken] = useState(0);
  const [settledInView, setSettledInView] = useState(false);

  // `armedRef` flips false the moment we fire a trigger and only
  // returns to true after the leave-delay timer elapses with the
  // element continuously out of view. This is the "consume once per
  // entry" latch.
  const armedRef = useRef(true);

  // Holds the pending re-arm timeout so a quick flicker back into view
  // can cancel it before it fires. Survives across effect re-runs
  // because effect cleanup doesn't clear it — only an actual re-entry
  // (the effect body) does. Cleared on unmount via the second effect.
  const leaveTimerRef = useRef(null);

  useEffect(() => {
    if (isInView) {
      // True entry (or recovery from a flicker). Cancel any pending
      // re-arm because we're back before the debounce expired —
      // continuous visibility shouldn't restart the cycle.
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      // Show the (reversible) entrance immediately on any true visibility —
      // idempotent, so a flicker that never reset it is a no-op re-render.
      setSettledInView(true);
      if (armedRef.current) {
        armedRef.current = false;
        setPlayToken((t) => t + 1);
      }
    } else if (anyVisible) {
      // Below the trigger `amount` but still partially on screen — HOLD. Cancel
      // any pending reset and do NOT schedule one. This is the loop-breaker: the
      // entrance's own transform can dip the element under `amount`, but as long
      // as any part is visible we keep the entrance latched so it COMPLETES
      // instead of restarting. (We deliberately don't re-fire the trigger here.)
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
    } else if (!leaveTimerRef.current) {
      // Fully out of view — the genuine sustained-exit candidate. Don't
      // immediately re-arm — wait the debounce so brief intersection-observer
      // wobble (especially on mobile momentum scroll past element edges) is
      // absorbed; only a real, complete exit re-arms the replay.
      leaveTimerRef.current = setTimeout(() => {
        armedRef.current = true;
        // Reset the reversible entrance so the NEXT true entry replays it.
        // Only fires after a sustained FULL exit, so partial-visibility wobble
        // can't reset it.
        setSettledInView(false);
        leaveTimerRef.current = null;
      }, leaveDelayMs);
    }
  }, [isInView, anyVisible, leaveDelayMs]);

  // Cleanup only on unmount. Note this is intentionally a separate
  // effect with an empty dep array: the cleanup in the trigger effect
  // above would otherwise fire on every isInView change, killing the
  // hysteresis timer before it can do its job.
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
    };
  }, []);

  return { isInView, playToken, settledInView };
}
