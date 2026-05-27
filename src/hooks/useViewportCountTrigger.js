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
 *   - Sustained exit (≥ `leaveDelayMs` outside the viewport) re-arms
 *     the trigger; the next entry increments playToken again.
 *
 * Returns `{ isInView, playToken }`:
 *   - `isInView` mirrors the underlying observer (use it for things
 *     that should reflect raw visibility, e.g. lazy mounting or
 *     pausing autoplay).
 *   - `playToken` is the latched, hysteresis-debounced trigger value.
 *     A consumer that depends on `[playToken, target]` will animate
 *     when either a real entry happens or the data changes.
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

  const isInView = useInView(ref, { once: false, amount, margin });

  // `playToken` is the only piece of state — every other "is it time to
  // trigger?" piece of book-keeping lives in refs so it doesn't itself
  // cause re-renders. The state change happens exactly once per real
  // entry cycle, which is also the only time consumers want to react.
  const [playToken, setPlayToken] = useState(0);

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
      if (armedRef.current) {
        armedRef.current = false;
        setPlayToken((t) => t + 1);
      }
    } else if (!leaveTimerRef.current) {
      // Sustained-exit candidate. Don't immediately re-arm — wait the
      // debounce so brief intersection-observer wobble (especially on
      // mobile momentum scroll past element edges) is absorbed.
      leaveTimerRef.current = setTimeout(() => {
        armedRef.current = true;
        leaveTimerRef.current = null;
      }, leaveDelayMs);
    }
  }, [isInView, leaveDelayMs]);

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

  return { isInView, playToken };
}
