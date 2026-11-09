import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tweenValue } from '@/lib/motion/tweenValue';

// The intro loader's two tweens (issue #200), which replaced framer's
// imperative `animate()` so the engine left every route's first load. The
// loader's `setTimeout` beats assume the counter lands on 100 exactly when
// BUILD_DURATION_MS has elapsed, so that is the contract pinned here.
//
// The clock is the one the tween reads at invocation (`performance.now()`) and
// the one rAF hands its callbacks, stubbed as ONE clock: a tween that timed
// itself from its first frame finished late whenever that frame was late.

let frames;
let now;
beforeEach(() => {
  frames = new Map();
  now = 0;
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    id += 1;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle) => frames.delete(handle));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Advance the clock and run the frames queued so far. */
function tick(ms) {
  now += ms;
  const queued = [...frames.values()];
  frames.clear();
  for (const cb of queued) cb(now);
}

const valueAt = (initial) => {
  let current = initial;
  return { get: () => current, set: (v) => (current = v) };
};

describe('tweenValue', () => {
  it('starts from the current value and lands exactly on the target at its duration', () => {
    const v = valueAt(0);
    tweenValue(v, 100, { duration: 1 });
    tick(0);
    expect(v.get()).toBe(0);
    tick(500);
    expect(v.get()).toBe(50);
    tick(500);
    expect(v.get()).toBe(100);
    expect(frames.size).toBe(0);
  });

  it('counts from the call, not from a late first frame', () => {
    // The loader's setTimeout beats start in the same call. A first frame
    // held back 400 ms by a busy main thread must not push the landing to
    // 1.4 s: by the 1 s beat the value is on its target.
    const v = valueAt(0);
    tweenValue(v, 100, { duration: 1 });
    tick(400);
    expect(v.get()).toBe(40);
    tick(600);
    expect(v.get()).toBe(100);
    expect(frames.size).toBe(0);
  });

  it('lands on the target at once when the first frame comes after the duration', () => {
    const v = valueAt(0);
    tweenValue(v, 100, { duration: 1 });
    tick(1200);
    expect(v.get()).toBe(100);
    expect(frames.size).toBe(0);
  });

  it('never runs backwards when a frame timestamp predates the call', () => {
    // rAF stamps a frame with its START, which can be earlier than the
    // performance.now() the tween read mid-frame.
    now = 50;
    const v = valueAt(10);
    tweenValue(v, 100, { duration: 1 });
    now = 40;
    const queued = [...frames.values()];
    frames.clear();
    for (const cb of queued) cb(now);
    expect(v.get()).toBe(10);
  });

  it('follows the easing curve', () => {
    const v = valueAt(0);
    tweenValue(v, 100, { duration: 1, ease: (t) => t * t });
    tick(0);
    tick(500);
    expect(v.get()).toBe(25);
  });

  it('lands on the target even when a frame overshoots the duration', () => {
    const v = valueAt(20);
    tweenValue(v, 150, { duration: 0.9 });
    tick(0);
    tick(5000);
    expect(v.get()).toBe(150);
  });

  it('jumps straight to the target for a zero duration', () => {
    const v = valueAt(3);
    tweenValue(v, 9, { duration: 0 });
    tick(16);
    expect(v.get()).toBe(9);
  });

  it('stop() freezes the value where it is', () => {
    const v = valueAt(0);
    const controls = tweenValue(v, 100, { duration: 1 });
    tick(0);
    tick(250);
    controls.stop();
    tick(750);
    expect(v.get()).toBe(25);
    expect(frames.size).toBe(0);
  });
});
