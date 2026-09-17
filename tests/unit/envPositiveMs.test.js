import { describe, expect, it } from 'vitest';

import { envPositiveMs } from '@/app/api/_utils/env';

// ── One definition of "a millisecond a timer will accept" ───────────────────
// Thirteen knobs across eight routes read a delay from the environment through
// this helper, and it was collected precisely because each route used to carry
// its own copy — "one route updated, the rest forgotten", as its header puts it.
// It had no tests, which is how the gap below survived the consolidation.
//
// The original contract was finite AND positive, for reasons that are still
// right: a negative slips past `Number(env) || fallback` and aborts everything
// instantly, and `Infinity` disables the bound. But finite and positive is not
// yet USABLE, and the two remaining shapes arrive exactly the way a negative
// does — someone typing a number into an env var:
//
//   • A DECIMAL. `AbortSignal.timeout(1000.5)` throws `ERR_OUT_OF_RANGE` on
//     Node 24 ("must be an integer"), which package.json's engines allow. Two
//     routes build a deadline that way, and /api/daily-warmup builds its one
//     INSIDE the handler — so a stray `.5` is not a bad timeout, it is the cron
//     throwing with no body and no per-step results, which is the exact failure
//     the run budget exists to prevent.
//
//   • Too LARGE. Past 2^31-1 the two timer APIs disagree about how to fail:
//     `AbortSignal.timeout` throws above 2^32-1, while `setTimeout` warns and
//     fires after 1ms — so an oversized GitHub timeout does not relax the
//     bound, it makes every call abort almost at once. The quieter of the two,
//     and the reason this is clamped rather than rejected.
//
// These cases assert the RESULT is usable rather than restating the arithmetic,
// so a different clamp that still yields a usable delay keeps them green.

const MAX_TIMER_MS = 2147483647;

/** What every consumer ultimately needs to be true of the value. */
const isUsableDelay = (ms) =>
  Number.isInteger(ms) && ms >= 1 && ms <= MAX_TIMER_MS;

describe('envPositiveMs — the original contract', () => {
  it('takes a sensible value as given', () => {
    expect(envPositiveMs('8000', 1000)).toBe(8000);
    expect(envPositiveMs(15000, 1000)).toBe(15000);
  });

  it('falls back for anything that is not a finite positive number', () => {
    // Each of these would break a timer in its own way, which is why the
    // fallback is not just for "missing".
    for (const bad of [undefined, null, '', 'abc', 0, -1, '-500', NaN]) {
      expect(envPositiveMs(bad, 9000), `input: ${String(bad)}`).toBe(9000);
    }
  });

  it('refuses Infinity, which would disable the bound entirely', () => {
    expect(envPositiveMs(Infinity, 9000)).toBe(9000);
    expect(envPositiveMs('Infinity', 9000)).toBe(9000);
  });
});

describe('envPositiveMs — usable by a real timer', () => {
  it('rounds a decimal to a whole millisecond', () => {
    // The defect: `AbortSignal.timeout` rejects a fractional delay outright, so
    // this is not a precision question — an unrounded value is an exception at
    // the point of use.
    expect(envPositiveMs('1000.5', 9000)).toBe(1001);
    expect(envPositiveMs(10000.4, 9000)).toBe(10000);
    expect(envPositiveMs(45000.75, 9000)).toBe(45001);
  });

  it('never rounds a small value down to zero', () => {
    // Matters more than it looks. A sub-half-millisecond value would round to
    // 0, and a 0ms deadline aborts everything instantly — reintroducing through
    // the normalisation the very failure the `> 0` check exists to prevent.
    expect(envPositiveMs(0.4, 9000)).toBe(1);
    expect(envPositiveMs('0.001', 9000)).toBe(1);
  });

  it('clamps a value past what the timer APIs accept', () => {
    // Finite and positive, and just as unusable as the Infinity above it:
    // `AbortSignal.timeout` throws past 2^32-1, and `setTimeout` fires after
    // 1ms past 2^31-1 rather than waiting.
    expect(envPositiveMs(1e10, 9000)).toBe(MAX_TIMER_MS);
    expect(envPositiveMs(Number.MAX_SAFE_INTEGER, 9000)).toBe(MAX_TIMER_MS);
  });

  it('normalises the FALLBACK too, not just the env value', () => {
    // The fallback is a literal at each call site today, but it is the value
    // every deployment that leaves the knob unset actually runs with — so an
    // unusable one would ship silently, and only to the deployments that did
    // nothing wrong.
    expect(envPositiveMs(undefined, 1000.5)).toBe(1001);
    expect(envPositiveMs('nonsense', 0.2)).toBe(1);
    expect(envPositiveMs(-1, 1e10)).toBe(MAX_TIMER_MS);
  });

  it('answers something a timer accepts for every input above', () => {
    // The property the individual cases are instances of, asserted over the
    // whole set — including the fallback path, since that is what most
    // deployments run.
    const inputs = [
      undefined, null, '', 'abc', 0, -1, NaN, Infinity, 0.4, 1000.5,
      '1000.5', 8000, '8000', 1e10, Number.MAX_SAFE_INTEGER,
    ];
    for (const input of inputs) {
      const ms = envPositiveMs(input, 9000);
      expect(isUsableDelay(ms), `input ${String(input)} gave ${ms}`).toBe(true);
      // The claim that makes this file worth having: the value can actually be
      // handed to the API two routes build their deadline with.
      expect(() => AbortSignal.timeout(ms)).not.toThrow();
    }
  });
});
