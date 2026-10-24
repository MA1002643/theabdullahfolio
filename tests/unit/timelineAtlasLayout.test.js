// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimelineAtlas, { packLanes } from '@/components/journey/TimelineAtlas';
import { journeyData } from '@/app/data';

// Two owner reports from 2026-10-18, both on the overlap atlas's newest role
// (Concierge Team Leader, started OCT 2026, the same month as the clock):
//
//   1. Its bar was an 8px sliver closed on the NOW line, and its caption was
//      printed OUTSIDE it with no border. An open bar too short for its caption
//      now takes the caption-width floor, widening LEFT with its right edge
//      still on the NOW line, so every caption sits inside a bordered bar.
//   2. It sat on a lower lane, because packing ran oldest-first. Packing now
//      runs newest-first, so the most recent role is on the top lane.

const NOW = new Date('2026-10-18T12:00:00Z');
const NOW_M = NOW.getUTCFullYear() * 12 + NOW.getUTCMonth();
const toMonths = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const barFor = (entry) =>
  screen.getByRole('button', {
    // The bar names itself with its caption, "org · role".
    name: new RegExp(`^Jump to ${escapeRe(`${entry.org} · ${entry.title.split(' · ')[0]}`)}`),
  });
const px = (value) => Number.parseFloat(value);

const careers = journeyData.filter((d) => d.type === 'career');
// The most recent role: the one that started last.
const newest = [...careers].sort(
  (a, b) => toMonths(b.start) - toMonths(a.start),
)[0];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function renderAtlas() {
  render(
    createElement(TimelineAtlas, {
      activeYear: newest.year,
      filter: 'all',
      onFilter: () => {},
      revealed: true,
      reduceMotion: true,
    }),
  );
}

describe('TimelineAtlas — the newest role', () => {
  it('sits on the top lane of its track', () => {
    renderAtlas();
    expect(px(barFor(newest).style.top)).toBe(0);
  });

  it('holds its caption inside a bordered bar that closes on the NOW line', () => {
    renderAtlas();
    const bar = barFor(newest);
    // No outside caption: the text is a plain child of the bordered button.
    expect(bar.querySelector('.absolute')).toBeNull();
    expect(bar.className).toContain('border');

    // Wide enough for its caption: a role weeks old is not a sliver.
    const width = px(bar.style.width);
    const caption = `${newest.org} · ${newest.title.split(' · ')[0]}`;
    expect(width).toBeGreaterThanOrEqual(caption.length * 7);

    // Right edge exactly on the NOW line, never past it.
    const label = [...document.querySelectorAll('.ja-lane')].find(
      (el) => el.textContent === 'Now',
    );
    expect(label).toBeTruthy();
    expect(px(bar.style.left) + width).toBe(px(label.parentElement.style.left));
  });
});

describe('packLanes — newest-first greedy', () => {
  const item = (id, s, e, capMonths = 1) => ({ id, s, e, fs: s, capMonths });

  it('puts the latest-ending item on lane 0 and breaks open-bar ties by latest start', () => {
    const items = [
      item('old', 0, 10),
      item('open-early', 5, null),
      item('open-late', 20, null),
    ];
    packLanes(items);
    const lane = Object.fromEntries(items.map((d) => [d.id, d.lane]));
    expect(lane['open-late']).toBe(0);
    expect(lane['open-early']).toBe(1);
  });

  it('never overlaps two footprints on one lane, and stacks same-month handovers', () => {
    const items = [
      item('a', 0, 9),
      item('b', 9, 20), // starts the month `a` ends: must not share a lane
      item('c', 30, 40),
      item('d', 2, 35, 3),
    ];
    const lanes = packLanes(items);
    expect(items.find((d) => d.id === 'a').lane).not.toBe(
      items.find((d) => d.id === 'b').lane,
    );
    for (let lane = 0; lane < lanes; lane += 1) {
      const row = items
        .filter((d) => d.lane === lane)
        .map((d) => [d.fs, Math.max(d.e ?? Infinity, d.s + d.capMonths - 1)])
        .sort((x, y) => x[0] - y[0]);
      for (let i = 1; i < row.length; i += 1) {
        expect(row[i][0]).toBeGreaterThan(row[i - 1][1]);
      }
    }
  });
});

// Guard the premise: if the newest role ever stops being recent, the sliver
// case above is no longer exercised by real data.
it('the data still contains an open role younger than its caption', () => {
  expect(newest.end).toBeNull();
  expect(NOW_M - toMonths(newest.start)).toBeLessThan(6);
});
