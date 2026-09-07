// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimelineAtlas, { ZOOM_STEPS } from '@/components/journey/TimelineAtlas';
import { journeyData } from '@/app/data';

// The atlas grid is a fixed-metric instrument (90px/month), which on a phone
// is a very long pan. The owner's direction (2026-09-05): the GRID — and only
// the grid — can be zoomed, it opens at exactly the laptop's size on every
// screen (zoom 1, never persisted), and the zoom is a uniform CSS `zoom` on
// the grid's width wrapper so px/month, type and paddings scale together and
// the caption-fit packing guarantees hold at every level. These tests pin
// that contract through the observable surface: the `data-zoom` attribute
// on the wrapper, the −/readout/+ cluster, and the fact that the head
// (chips, title) lives OUTSIDE the zoomed subtree.

const career = journeyData.find((d) => d.type === 'career');

beforeEach(() => {
  // framer's useInView needs an IntersectionObserver; jsdom has none.
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
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function renderAtlas() {
  render(
    createElement(TimelineAtlas, {
      activeYear: career.year,
      filter: 'all',
      onFilter: () => {},
      revealed: true,
      reduceMotion: true,
    }),
  );
}

const zoomRoot = () => document.querySelector('[data-zoom]');
const zoomOut = () => screen.getByRole('button', { name: 'Zoom the grid out' });
const zoomIn = () => screen.getByRole('button', { name: 'Zoom the grid in' });
const readout = () => screen.getByRole('button', { name: /^Grid zoom \d+%/ });

describe('TimelineAtlas — grid-only zoom', () => {
  it('the step table is ascending, brackets 1, and 1 is the default', () => {
    expect(ZOOM_STEPS).toContain(1);
    expect([...ZOOM_STEPS].sort((a, b) => a - b)).toEqual(ZOOM_STEPS);
    expect(ZOOM_STEPS[0]).toBeLessThan(1);
    expect(ZOOM_STEPS[ZOOM_STEPS.length - 1]).toBeGreaterThan(1);
  });

  it('opens at 100% on every screen: zoom 1, the readout resting as a readout', () => {
    renderAtlas();
    expect(zoomRoot().getAttribute('data-zoom')).toBe('1');
    expect(readout().textContent).toBe('100%');
    // The readout doubles as reset and rests disabled at 100%.
    expect(readout()).toHaveProperty('disabled', true);
    expect(zoomOut()).toHaveProperty('disabled', false);
    expect(zoomIn()).toHaveProperty('disabled', false);
    expect(screen.getByRole('status').textContent).toBe('Grid zoom 100%');
  });

  it('zooms the grid only — the head and its chips sit outside the zoomed wrapper', () => {
    renderAtlas();
    fireEvent.click(zoomOut());
    const idx = ZOOM_STEPS.indexOf(1) - 1;
    expect(zoomRoot().getAttribute('data-zoom')).toBe(String(ZOOM_STEPS[idx]));
    expect(readout().textContent).toBe(`${Math.round(ZOOM_STEPS[idx] * 100)}%`);

    // Nothing outside the grid is inside the zoom root.
    const chip = screen.getByRole('button', { name: 'Career', pressed: false });
    expect(chip.closest('[data-zoom]')).toBeNull();
    expect(screen.getByText('Overlap view').closest('[data-zoom]')).toBeNull();
    expect(zoomOut().closest('[data-zoom]')).toBeNull();
    // …while the bars are.
    const bar = screen.getAllByRole('button', { name: /^Jump to/ })[0];
    expect(bar.closest('[data-zoom]')).toBe(zoomRoot());
  });

  it('walks the step table to both ends, disabling the button at each bound', () => {
    renderAtlas();
    for (let i = 0; i < ZOOM_STEPS.length; i += 1) fireEvent.click(zoomOut());
    expect(zoomRoot().getAttribute('data-zoom')).toBe(String(ZOOM_STEPS[0]));
    expect(zoomOut()).toHaveProperty('disabled', true);
    expect(zoomIn()).toHaveProperty('disabled', false);

    for (let i = 0; i < ZOOM_STEPS.length * 2; i += 1)
      fireEvent.click(zoomIn());
    const last = ZOOM_STEPS[ZOOM_STEPS.length - 1];
    expect(zoomRoot().getAttribute('data-zoom')).toBe(String(last));
    expect(zoomIn()).toHaveProperty('disabled', true);
    expect(zoomOut()).toHaveProperty('disabled', false);
    expect(screen.getByRole('status').textContent).toBe(
      `Grid zoom ${Math.round(last * 100)}%`,
    );
  });

  it('the readout resets to 100% from either side', () => {
    renderAtlas();
    fireEvent.click(zoomIn());
    expect(readout()).toHaveProperty('disabled', false);
    fireEvent.click(readout());
    expect(zoomRoot().getAttribute('data-zoom')).toBe('1');
    expect(readout()).toHaveProperty('disabled', true);

    fireEvent.click(zoomOut());
    fireEvent.click(zoomOut());
    fireEvent.click(readout());
    expect(zoomRoot().getAttribute('data-zoom')).toBe('1');
  });

  it('a zoom change re-anchors the pan on the viewport centre, from the offset BEFORE the commit', () => {
    renderAtlas();
    const scroller = document.querySelector('.ja-scroller');
    // jsdom lays nothing out — stand in a 400px viewport panned to 1000px.
    Object.defineProperty(scroller, 'clientWidth', {
      configurable: true,
      value: 400,
    });
    // Simulate the browser: the moment the grid shrinks (data-zoom leaves
    // 1) the OLD offset is clamped into the new, shorter range — here to
    // 500 — until something writes a new one. Reading scrollLeft after the
    // commit therefore sees 500, not 1000; the re-anchor must have taken
    // its snapshot before. (Measured in Chromium: 9549 read back as 7568.)
    let stored = 1000;
    let writtenSinceZoom = false;
    Object.defineProperty(scroller, 'scrollLeft', {
      configurable: true,
      get() {
        const shrunk = zoomRoot().getAttribute('data-zoom') !== '1';
        return shrunk && !writtenSinceZoom ? Math.min(stored, 500) : stored;
      },
      set(v) {
        stored = v;
        writtenSinceZoom = true;
      },
    });
    fireEvent.click(zoomOut());
    const z = ZOOM_STEPS[ZOOM_STEPS.indexOf(1) - 1];
    // centre 1200 scales to 1200·z; the new offset puts it back mid-view.
    // Scaling the clamped 500 instead would give 700·z − 200.
    expect(stored).toBeCloseTo(1200 * z - 200, 5);
  });
});

describe('TimelineAtlas — lane labels are centred across their column', () => {
  it('each lane panel centres its label horizontally and keeps its top placement', () => {
    renderAtlas();
    const panels = document.querySelectorAll('.ja-lane.sticky');
    expect(panels.length).toBeGreaterThan(0);
    panels.forEach((panel) => {
      // Across the column: both lines on the centreline.
      expect(panel.className).toMatch(/\bflex-col\b/);
      expect(panel.className).toMatch(/\bitems-center\b/);
      expect(panel.className).toMatch(/\btext-center\b/);
      // Horizontal ONLY (owner correction — a vertical centring was tried
      // first): the top placement under a start-aligned row is unchanged.
      expect(panel.className).not.toMatch(/\bjustify-center\b/);
      expect(panel.className).toMatch(/\bpt-1\.5\b/);
      expect(panel.parentElement.className).toMatch(/\bitems-start\b/);
    });
  });
});
