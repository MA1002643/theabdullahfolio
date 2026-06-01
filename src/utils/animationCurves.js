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
