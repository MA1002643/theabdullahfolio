// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WallPagination, {
  MAX_TICK_INTERVALS,
  tickStyle,
  tickTiles,
} from '@/components/guestbook/WallPagination';

// The page rail's size in the wall's size. It used to render one tick span
// per page — a decorative node count that grew linearly with a long-lived
// wall and re-rendered on every flip (code review), while the wall itself
// mounts eight cards. The graduations are now a repeated CSS tile, so the
// rail is a constant handful of nodes at any page count, and past a pitch
// floor the scale thins to every k-th page rather than smearing. These
// tests pin the node count across counts and re-renders, the tiling
// arithmetic, the lit-ticks clip at the ends, and that the rail's real
// job — prev/next, the live line, click-to-jump — is untouched.
//
// AnimatePresence is a pass-through here, as in the other component tests:
// the odometer's exit choreography would leave a ghost digit mounted under
// jsdom, and it is not what is under test.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AnimatePresence: ({ children }) => children ?? null };
});

function renderRail(props) {
  const onPage = vi.fn();
  const view = render(
    createElement(WallPagination, { page: 0, dir: 1, onPage, ...props }),
  );
  return { onPage, ...view };
}

// The rail is the aria-hidden strip between the two buttons.
const rail = () => screen.getByRole('navigation').children[1];

beforeEach(() => {
  window.matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
  window.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WallPagination — the rail is constant-size in the wall', () => {
  it('renders the same handful of nodes at 2 pages, 19, 500 and 5,000', () => {
    const counts = [2, 19, 500, 5000].map((pageCount) => {
      const view = renderRail({ pageCount });
      const n = rail().children.length;
      const tagged = rail().querySelectorAll('*').length;
      view.unmount();
      return [n, tagged];
    });
    // Every count renders exactly the same tree, and it is small.
    expect(new Set(counts.map(String)).size).toBe(1);
    expect(counts[0][1]).toBeLessThanOrEqual(8);
  });

  it('flipping pages and growing the count change styles, never the tree', () => {
    const { rerender, onPage } = renderRail({ pageCount: 40 });
    const before = rail().querySelectorAll('*').length;
    rerender(createElement(WallPagination, { page: 17, pageCount: 40, dir: 1, onPage }));
    expect(rail().querySelectorAll('*').length).toBe(before);
    rerender(createElement(WallPagination, { page: 17, pageCount: 1200, dir: 1, onPage }));
    expect(rail().querySelectorAll('*').length).toBe(before);
  });

  it('tiles one tick per page gap while that fits, then thins evenly', () => {
    expect(tickTiles(2)).toBe(1);
    expect(tickTiles(19)).toBe(18);
    expect(tickTiles(MAX_TICK_INTERVALS + 1)).toBe(MAX_TICK_INTERVALS);
    // One page over the cap halves the scale rather than crowding it.
    expect(tickTiles(MAX_TICK_INTERVALS + 2)).toBe((MAX_TICK_INTERVALS + 1) / 2);
    // …and however large the wall, the pitch never drops below the floor.
    for (const pageCount of [100, 500, 5000, 100000]) {
      const tiles = tickTiles(pageCount);
      expect(tiles).toBeLessThanOrEqual(MAX_TICK_INTERVALS);
      expect(tiles).toBeGreaterThan(MAX_TICK_INTERVALS / 2);
    }
    // A single page never divides by zero (the component returns null
    // before it matters, but the helper is pure and exported).
    expect(tickTiles(1)).toBe(1);
  });

  it('the graduations are a repeated background tile, sized from the tile count', () => {
    renderRail({ pageCount: 19 });
    const [dim, lit] = [rail().children[2], rail().children[3]];
    for (const layer of [dim, lit]) {
      expect(layer.style.backgroundImage).toContain('linear-gradient');
      expect(layer.style.backgroundRepeat).toBe('repeat-x');
    }
    // jsdom's CSS engine drops calc() for background-size (a browser does
    // not — verified in Chromium), so the tile width is pinned at the
    // source: one pitch per page gap, a pixel short so the last tick lands
    // inside the box.
    expect(tickStyle(19).backgroundSize).toBe('calc((100% - 1px) / 18) 100%');
    expect(tickStyle(500).backgroundSize).toBe(
      `calc((100% - 1px) / ${tickTiles(500)}) 100%`,
    );
  });

  it('the lit layer is clipped to the filament: page one lights its own tick, the last page lights all', () => {
    const { rerender, onPage } = renderRail({ pageCount: 19 });
    const lit = () => rail().children[3].style.clipPath;
    // At 0% the clip still admits the first tick's own pixel.
    expect(lit()).toContain('calc(100% - 1px)');
    rerender(createElement(WallPagination, { page: 18, pageCount: 19, dir: 1, onPage }));
    // At 100% the right inset would go negative; it is floored at 0.
    expect(lit()).toContain('max(0px, calc(0% - 1px))');
  });

  it('the controls that matter are untouched: prev/next, the live line, click-to-jump', () => {
    const { onPage, rerender } = renderRail({ pageCount: 19 });
    expect(screen.getByRole('button', { name: 'Previous page' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Next page' }).disabled).toBe(false);
    expect(screen.getByText('Page 1 of 19')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPage).toHaveBeenLastCalledWith(1);

    rerender(createElement(WallPagination, { page: 18, pageCount: 19, dir: 1, onPage }));
    expect(screen.getByRole('button', { name: 'Next page' }).disabled).toBe(true);
    expect(screen.getByText('Page 19 of 19')).toBeTruthy();

    // Clicking the rail's midpoint jumps to the nearest page.
    vi.spyOn(rail(), 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 280,
      top: 0,
      height: 32,
      right: 280,
      bottom: 32,
    });
    fireEvent.click(rail(), { clientX: 140 });
    expect(onPage).toHaveBeenLastCalledWith(9);
  });

  it('a single page renders no control at all', () => {
    const { container } = renderRail({ pageCount: 1 });
    expect(container.firstChild).toBe(null);
  });
});
