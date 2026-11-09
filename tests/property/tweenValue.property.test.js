import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tweenValue } from '@/lib/motion/tweenValue';

// tweenValue (issue #200) drives the intro loader's counter and radial wipe.
// For any start, target, duration and frame cadence, with a curve that stays
// in [0, 1]: every value it writes lies between start and target, and the last
// one is the target exactly. A counter that read 101 %, or a wipe radius that
// stopped at 149.99, would be visible.

let frames;
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

const EASES = [(t) => t, (t) => 1 - Math.pow(1 - t, 3), (t) => t * t * (3 - 2 * t)];

describe('tweenValue properties', () => {
  it('stays between its endpoints and lands on the target', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        fc.double({ min: 0, max: 5, noNaN: true }),
        fc.array(fc.double({ min: 0, max: 400, noNaN: true }), { minLength: 1, maxLength: 60 }),
        fc.integer({ min: 0, max: EASES.length - 1 }),
        (from, to, duration, gaps, easeIndex) => {
          frames = [];
          let current = from;
          const written = [];
          const value = { get: () => current, set: (v) => written.push((current = v)) };
          tweenValue(value, to, { duration, ease: EASES[easeIndex] });

          let now = 1000;
          // Every scheduled gap, then one long one so the tween always finishes.
          for (const gap of [...gaps, duration * 1000 + 1]) {
            const queued = frames;
            frames = [];
            now += gap;
            for (const cb of queued) cb(now);
          }

          const lo = Math.min(from, to) - 1e-9 * Math.abs(to - from);
          const hi = Math.max(from, to) + 1e-9 * Math.abs(to - from);
          for (const v of written) expect(v >= lo && v <= hi).toBe(true);
          expect(written.at(-1)).toBe(to);
        },
      ),
    );
  });
});
