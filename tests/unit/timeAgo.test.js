import { describe, expect, it } from 'vitest';
import { timeAgo } from '@/lib/guestbook/timeAgo';

// `now` is injected everywhere so these never race the wall clock.
const NOW = new Date('2026-08-23T12:00:00.000Z').getTime();
const at = (ms) => new Date(NOW - ms).toISOString();

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('timeAgo', () => {
  it('reads "just now" under a minute', () => {
    expect(timeAgo(at(0), NOW)).toBe('just now');
    expect(timeAgo(at(59 * SEC), NOW)).toBe('just now');
  });

  it('reads minutes under an hour', () => {
    expect(timeAgo(at(MIN), NOW)).toBe('1m ago');
    expect(timeAgo(at(59 * MIN), NOW)).toBe('59m ago');
  });

  it('reads hours under a day', () => {
    expect(timeAgo(at(HOUR), NOW)).toBe('1h ago');
    expect(timeAgo(at(23 * HOUR), NOW)).toBe('23h ago');
  });

  it('reads days under a month', () => {
    expect(timeAgo(at(DAY), NOW)).toBe('1d ago');
    expect(timeAgo(at(29 * DAY), NOW)).toBe('29d ago');
  });

  it('falls back to an absolute date after ~a month', () => {
    // 40 days before NOW = 14 Jul 2026 — en-GB short form.
    expect(timeAgo(at(40 * DAY), NOW)).toBe('14 Jul 2026');
  });

  it('renders the absolute date in UTC, whatever timezone the runtime is in', () => {
    // 23:30 UTC on 14 Jul: still the 14th in UTC, already the 15th at
    // UTC+14 (Kiritimati), the 14th at UTC−11 (Pago Pago). The server
    // renders in UTC and the visitor wherever they are, so a zone-dependent
    // date would hydrate to a different string than it served.
    const late = '2026-07-14T23:30:00.000Z';
    const saved = process.env.TZ;
    try {
      for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC']) {
        process.env.TZ = tz;
        expect(timeAgo(late, NOW), tz).toBe('14 Jul 2026');
      }
      // Control: the flip really moved the runtime's clock — a local-zone
      // rendering would have disagreed between these two.
      process.env.TZ = 'Pacific/Kiritimati';
      expect(new Date(late).getDate()).toBe(15);
      process.env.TZ = 'Pacific/Pago_Pago';
      expect(new Date(late).getDate()).toBe(14);
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });

  it('clamps clock skew (a future timestamp) to "just now"', () => {
    expect(timeAgo(new Date(NOW + 30 * SEC).toISOString(), NOW)).toBe(
      'just now',
    );
  });

  it('returns an empty string for garbage input', () => {
    expect(timeAgo('not-a-date', NOW)).toBe('');
    expect(timeAgo(undefined, NOW)).toBe('');
  });
});
