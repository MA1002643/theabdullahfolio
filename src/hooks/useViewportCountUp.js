"use client";

import { useEffect, useRef } from "react";

import { animate } from "framer-motion";

// Shared count-up controller for the about page's imperative counters
// (PercentCount, CountUp, the nested Counter, and the Skills & Technologies
// total). Animates `nodeRef`'s text from `from` → `to` on a true viewport entry,
// and resets to `from` on exit so the next entry replays — but with HYSTERESIS
// on the exit. The `inView` signals these counters read are RAW observers that
// briefly flicker false during scroll and the parent ItemLayout's scale
// transition; resetting immediately would snap the digit to 0 while the card is
// still effectively on-screen. So:
//   - Exit is debounced — only a sustained exit (>= COUNT_RESET_DELAY_MS)
//     resets to `from` and re-arms; a quick re-entry cancels the pending reset.
//   - A running animation is NOT stopped on a flicker (the effect returns no
//     cleanup), so it finishes on its own, and a quick re-entry does NOT
//     restart it — no snap to 0 either way.
//   - A genuine re-entry after a sustained exit (re-armed) replays the count-up,
//     and a changed `to` re-animates even while still in view.
// Reduced motion writes the final value immediately, with no tween.
//
// `format` (issue #82) decides how each painted frame reads. Omitted, it is the
// legacy `${Math.round(v)}` — Western digits, no grouping — so every existing
// caller is unchanged. Pass either a function `(rounded) => string` or an
// object `{ locale, options }` to paint through `Intl.NumberFormat` (the
// locale's own digits: Arabic-Indic for `ar`, extended for `fa`). The value
// is rounded BEFORE formatting either way, so a fractional tween never shows
// decimals. Read through a ref, so a new function identity each render neither
// restarts the tween nor re-arms the latch.
export const COUNT_RESET_DELAY_MS = 300;

const legacyFormat = (n) => `${n}`;

/** Normalise the `format` option into a `(rounded:number) => string`. */
export function countUpFormatter(format) {
  if (typeof format === "function") return format;
  if (format && typeof format === "object") {
    const fmt = new Intl.NumberFormat(format.locale, format.options);
    return (n) => fmt.format(n);
  }
  return legacyFormat;
}

export function useViewportCountUp(
  nodeRef,
  { from = 0, to, inView, prefersReducedMotion, enabled = true, format },
) {
  const armedRef = useRef(true);
  // Latest formatter, read at paint time — see the `format` note above.
  const formatRef = useRef(countUpFormatter(format));
  const formatKey =
    format && typeof format === "object" ? JSON.stringify(format) : typeof format;
  useEffect(() => {
    formatRef.current = countUpFormatter(format);
    // `formatKey` stands in for an object option's VALUE, so an inline
    // `{ locale, options }` literal doesn't rebuild the Intl formatter every
    // render; a function option is picked up by identity on the next render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatKey, typeof format === "function" ? format : null]);
  const lastToRef = useRef(null);
  const resetTimerRef = useRef(null);
  const controlsRef = useRef(null);

  useEffect(() => {
    const node = nodeRef.current;
    const fmt = (v) => formatRef.current(Math.round(v));

    // Disabled (e.g. PercentCount's `unavailable`) or no node yet — tear down
    // any in-flight work AND re-arm the latch so a later re-enable (or the node
    // remounting) starts a fresh count-up. Without resetting `armedRef`/
    // `lastToRef`, a counter that was previously enabled + in view (armedRef
    // false, lastToRef === to) would, after a disable → re-enable with the same
    // `to`, fail the inView branch's animate guard and leave the remounted node
    // stuck at its JSX initial "0".
    if (!enabled || !node) {
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      armedRef.current = true;
      lastToRef.current = null;
      return undefined;
    }

    if (prefersReducedMotion) {
      // Cancel any in-flight tween AND any pending out-of-view reset — a reset
      // queued while motion was enabled would otherwise still fire after the OS
      // flips to reduced motion and overwrite the final value back to `from`.
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      node.textContent = fmt(to);
      // Mark the value as already "shown" at `to` so re-enabling motion while
      // still in view (same target) doesn't trigger a redundant re-animation/snap.
      armedRef.current = false;
      lastToRef.current = to;
      return undefined;
    }

    if (inView) {
      // Entry or flicker-recovery — cancel any pending out-of-view reset.
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      // Animate only on a genuine (re)entry (re-armed after a sustained exit)
      // or a changed target — never on a brief flicker back into view, which
      // would restart the sweep and snap to 0. An in-flight tween keeps running.
      if (armedRef.current || lastToRef.current !== to) {
        armedRef.current = false;
        lastToRef.current = to;
        if (controlsRef.current) controlsRef.current.stop();
        controlsRef.current = animate(from, to, {
          duration: 2,
          onUpdate(v) {
            node.textContent = fmt(v);
          },
        });
      }
      return undefined;
    }

    // Out of view — schedule a DEBOUNCED reset. Don't reset (or stop the tween)
    // now: a brief observer flicker re-enters before this fires (the inView
    // branch above clears it), so only a sustained exit resets and re-arms.
    if (!resetTimerRef.current) {
      resetTimerRef.current = setTimeout(() => {
        if (controlsRef.current) {
          controlsRef.current.stop();
          controlsRef.current = null;
        }
        node.textContent = fmt(from);
        armedRef.current = true; // re-arm so the next true entry replays
        resetTimerRef.current = null;
      }, COUNT_RESET_DELAY_MS);
    }
    return undefined;
  }, [from, to, inView, prefersReducedMotion, enabled, nodeRef]);

  // Stop the tween and clear any pending reset on unmount — and RE-ARM the
  // latch. On a real unmount the refs die with the instance, so the re-arm
  // is free; but under dev StrictMode this cleanup runs as the SIMULATED
  // unmount between the double-mount's two effect passes. Without the
  // re-arm, a counter that mounts while already in view (the years card's
  // data-gated Counter: `inView` is true the moment data arrives) starts
  // its tween on pass one, has it stopped HERE at ~frame zero, and then
  // pass two reads `armedRef=false, lastToRef===to` — "already played" —
  // and declines to restart: the digit sits frozen at 0 until a full
  // scroll-away re-arms it. Re-arming makes the second pass replay.
  useEffect(
    () => () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      armedRef.current = true;
      lastToRef.current = null;
    },
    [],
  );
}
