// A fixed-duration tween of one motion value, on requestAnimationFrame
// (issue #200).
//
// framer-motion's imperative `animate()` does this too, but importing it pulls
// the whole animation engine into the importing chunk (JSAnimation, the WAAPI
// transforms, keyframe resolvers and, because `animate()` also accepts
// elements, the DOM renderer). The intro loader sits in the root layout, so
// its two tweens alone held about 16 kB in every route's first load. All they
// ever needed was "move this number from here to there over N seconds along
// this curve", which is this function.
//
// Same contract as the part of `animate()` the loader used: starts from the
// value's current reading, lands exactly on `to` once `duration` has elapsed
// since the CALL, and returns `{ stop }`, which freezes the value where it is.

/**
 * @param {{ get(): number, set(v: number): void }} value a framer MotionValue (or anything shaped like one).
 * @param {number} to
 * @param {{ duration: number, ease?: (t: number) => number }} options duration in SECONDS, as framer takes it.
 * @returns {{ stop(): void }}
 */
export function tweenValue(value, to, { duration, ease = (t) => t }) {
  const from = value.get();
  const ms = Math.max(0, duration * 1000);
  // The clock starts NOW, at invocation, not on the first frame. The intro
  // loader starts its `setTimeout` beats in the same call, and those count
  // from invocation too: a tween timed from its first frame finishes late by
  // however long that frame took to come (a busy main thread during
  // hydration), so the counter could still read below 100 % when the build
  // beat fired, and the wipe could be stopped short of its target. A frame
  // timestamp can be slightly EARLIER than this reading (it marks the start
  // of the frame the call landed in), hence the clamp at 0.
  const start = performance.now();
  let frame = 0;
  let stopped = false;

  const step = (now) => {
    if (stopped) return;
    const t = ms === 0 ? 1 : Math.min(1, Math.max(0, (now - start) / ms));
    value.set(t === 1 ? to : from + (to - from) * ease(t));
    if (t < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
    },
  };
}
