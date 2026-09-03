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
