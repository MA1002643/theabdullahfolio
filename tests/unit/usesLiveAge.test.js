// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LiveAge, { nextAgeDelay, splitAge } from '@/components/uses/LiveAge';

// The Stack plate's "verified 3m 25s ago" readout (owner correction,
// 2026-09-05): it must count up second by second, its digits must wear the
// page title's ember while the words keep the line's grey, and the cadence
// must follow the format's grain (ProjectProgressPopup's adaptive ticker) so
// nothing re-renders faster than the visible text can change.

const T0 = Date.parse('2026-09-05T22:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const iso = (secondsAgo) => new Date(T0 - secondsAgo * 1000).toISOString();
const readout = () => document.querySelector('.uses-age');
const digits = () =>
  [...readout().querySelectorAll('span')]
    .filter((s) => /^\d+$/.test(s.textContent))
    .map((s) => ({ text: s.textContent, className: s.className }));

describe('LiveAge — the verified age counts up, digits in ember', () => {
  it('renders the age in formatAge grammar with every digit run in the ember', () => {
    render(createElement(LiveAge, { fetchedAt: iso(205) }));
    expect(readout().textContent).toBe('verified 3m 25s ago');
    expect(digits()).toEqual([
      { text: '3', className: 'font-semibold text-[#ff6d05]' },
      { text: '25', className: 'font-semibold text-[#ff6d05]' },
    ]);
    // The words are NOT coloured: they inherit the provenance line's grey.
    const words = [...readout().querySelectorAll('span')].filter(
      (s) => !/^\d+$/.test(s.textContent),
    );
    expect(words.length).toBeGreaterThan(0);
    words.forEach((w) => expect(w.className).not.toMatch(/ff6d05/));
  });

  it('ticks every second while the format shows seconds', () => {
    render(createElement(LiveAge, { fetchedAt: iso(205) }));
    expect(readout().textContent).toBe('verified 3m 25s ago');
    act(() => vi.advanceTimersByTime(1000));
    expect(readout().textContent).toBe('verified 3m 26s ago');
    act(() => vi.advanceTimersByTime(1000));
    expect(readout().textContent).toBe('verified 3m 27s ago');
    // The seconds field is two-digit, so the readout never changes width.
    act(() => vi.advanceTimersByTime(33 * 1000));
    expect(readout().textContent).toBe('verified 4m 00s ago');
  });

  it('slows to the grain the format exposes past an hour and past a day', () => {
    expect(nextAgeDelay(iso(59 * 60), T0)).toBe(1000);
    expect(nextAgeDelay(iso(2 * 3600), T0)).toBe(30 * 1000);
    expect(nextAgeDelay(iso(3 * 86400), T0)).toBe(30 * 60 * 1000);
    // …and a future timestamp (clock skew) is treated as fresh.
    expect(nextAgeDelay(iso(-30), T0)).toBe(1000);
  });

  it('holds still in a hidden tab and re-syncs when the tab returns', () => {
    render(createElement(LiveAge, { fetchedAt: iso(10) }));
    expect(readout().textContent).toBe('verified 10s ago');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => vi.advanceTimersByTime(5000));
    expect(readout().textContent).toBe('verified 10s ago');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(readout().textContent).toBe('verified 15s ago');
  });

  it('renders nothing without a timestamp and cleans its timer up on unmount', () => {
    const { unmount } = render(createElement(LiveAge, { fetchedAt: null }));
    expect(readout()).toBeNull();
    unmount();
    const view = render(createElement(LiveAge, { fetchedAt: iso(5) }));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('splitAge keeps digit runs and text in order with no empty parts', () => {
    expect(splitAge('3m 25s ago')).toEqual(['3', 'm ', '25', 's ago']);
    expect(splitAge('7s ago')).toEqual(['7', 's ago']);
  });
});
