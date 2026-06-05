/**
 * Elite count-up easing — sprint, then settle.
 *
 * Spec-shaped curve: the number sprints from 0 to ~70% of its target across
 * the first quarter of the duration at near-constant velocity, then decelerates
 * for the remaining three quarters into the final digits. The visible
 * slowdown at the 70% mark draws the eye to the destination value and gives
 * the count-up a deliberate, "earned" landing — the opposite of a generic
 * smooth ease-out, which spends most of its time creeping invisibly past 99%.
 *
 * Phase A — sprint (t < 0.25)
 *   Linear ramp to 70% of target. Constant velocity, "full speed".
 *
 * Phase B — settle (t ≥ 0.25)
 *   Ease-out cubic from 70% to 100% across the remaining 75% of duration.
 *
 * The derivative steps down at the transition (from 2.8 to 1.2 per unit t),
 * which produces the visible deceleration that makes the settle feel
 * intentional — for stat counters this reads as polish, not jank.
 *
 * @param {number} t - progress; clamped internally to 0..1
 * @returns {number} eased progress in [0, 1]
 */
export function fastStartSlowFinish(t) {
  // Clamp to honor the documented contract. Framer Motion passes this as an
  // `ease` function and can call it with values like 1.0000001 at animation
  // boundaries (or briefly negative under anticipation transitions). Without
  // this, the sprint phase emits a negative result and the settle phase
  // exceeds 1, producing a one-frame jitter at the start and end.
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  if (x < 0.25) {
    return (x / 0.25) * 0.7;
  }
  const localT = (x - 0.25) / 0.75;
  return 0.7 + 0.3 * (1 - Math.pow(1 - localT, 3));
}

/**
 * Imperative count-up tween on `requestAnimationFrame`. Drives a numeric value
 * `from` → `to` over `duration` ms through `easing`, calling `onUpdate(value)`
 * each frame and `onComplete()` once at the end. The final frame is clamped to
 * exactly `to` so the displayed number always lands on the target (rounding a
 * frame at t≈0.999 could otherwise settle one short).
 *
 * Returns a `cancel()` function — call it from an effect cleanup so a re-trigger
 * (or unmount) stops the in-flight tween instead of leaking competing rAF loops
 * that fight over the same node.
 *
 * SSR / no-rAF safe: when `requestAnimationFrame` is unavailable it paints the
 * final value synchronously and returns a no-op canceller.
 *
 * @param {object}   opts
 * @param {number}   [opts.from=0]
 * @param {number}   opts.to
 * @param {number}   [opts.duration=2000] - ms
 * @param {(t:number)=>number} [opts.easing=fastStartSlowFinish]
 * @param {(value:number)=>void} [opts.onUpdate]
 * @param {() => void} [opts.onComplete]
 * @returns {() => void} cancel
 */
export function animateToTarget({
  from = 0,
  to,
  duration = 2000,
  easing = fastStartSlowFinish,
  onUpdate,
  onComplete,
} = {}) {
  if (
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    onUpdate?.(to);
    onComplete?.();
    return () => {};
  }

  // Nothing to tween: no distance to cover (`from === to`, e.g. a streak value
  // of 0) or no time to cover it in (`duration <= 0`). Paint the final value
  // once and finish synchronously instead of scheduling a full rAF loop that
  // would otherwise spend ~2s repainting the same number every frame.
  if (from === to || duration <= 0) {
    onUpdate?.(to);
    onComplete?.();
    return () => {};
  }

  let rafId = 0;
  let startTs = null;
  let cancelled = false;

  const tick = (ts) => {
    if (cancelled) return;
    if (startTs === null) startTs = ts;
    const t = duration <= 0 ? 1 : Math.min((ts - startTs) / duration, 1);
    onUpdate?.(from + (to - from) * easing(t));
    if (t < 1) {
      rafId = window.requestAnimationFrame(tick);
    } else {
      onUpdate?.(to); // clamp exactly on the target
      onComplete?.();
    }
  };

  rafId = window.requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    if (rafId) window.cancelAnimationFrame(rafId);
  };
}
