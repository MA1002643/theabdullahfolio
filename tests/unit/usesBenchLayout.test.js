// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BenchPlate from '@/components/uses/BenchPlate';
import { usesData } from '@/app/data';

// The /uses Bench plate's layout contract (owner correction, 2026-09-05):
// the six stations run THREE ACROSS from `md` (tablets, laptops, desktops),
// the extensions row spans all three beneath them, and the editor frame sits
// under the whole set at full width; below `md` it is one column, stations
// then frame. jsdom lays nothing out, so the contract is pinned through the
// classes Tailwind compiles (the same way the atlas lane test pins its
// centring) plus the one CSS rule that keeps the hairlines honest in a grid.
// Also pinned: the station links underline in the page title's ember, not
// the foreground white — `text-decoration-color` defaults to the anchor's
// own colour, which is why it needed saying.

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
  // A hover-capable fine pointer, no OS reduced-motion preference (the tilt
  // hook and the shared useReducedMotion both read matchMedia).
  vi.stubGlobal('matchMedia', (query) => ({
    matches: query.includes('hover'),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function renderBench() {
  render(
    createElement(BenchPlate, {
      bench: usesData.bench,
      extensions: usesData.extensions,
      frame: usesData.editorFrame,
    }),
  );
}

const stations = () => document.querySelector('.uses-bench__stations');
const frame = () => document.querySelector('figure.uses-editor');

describe('BenchPlate — stations three across from md, the frame beneath them', () => {
  it('the station list is a 3-column grid from md and a plain list below it', () => {
    renderBench();
    const list = stations();
    expect(list).not.toBeNull();
    expect(list.tagName).toBe('UL');
    expect(list.className).toMatch(/\bmd:grid\b/);
    expect(list.className).toMatch(/\bmd:grid-cols-3\b/);
    // No unprefixed `grid` on the list: below md it is a block list.
    expect(list.className).not.toMatch(/(^|\s)grid(\s|$)/);
    // Grid items must be allowed to shrink or a long station name would set
    // the column's minimum (the phone-overflow lesson).
    const rows = [...list.querySelectorAll(':scope > .uses-row')];
    expect(rows).toHaveLength(usesData.bench.length);
    rows.forEach((row) => expect(row.className).toMatch(/\bmin-w-0\b/));
  });

  it('the extensions row spans all three columns beneath the stations', () => {
    renderBench();
    const list = stations();
    const ext = screen.getByText('Extensions I reach for').closest('li');
    expect(ext.parentElement).toBe(list);
    expect(ext).toBe(list.lastElementChild);
    expect(ext.className).toMatch(/\bmd:col-span-3\b/);
    // It is not a ruled row: the hairline sits between stations only.
    expect(ext.className).not.toMatch(/\buses-row\b/);
  });

  it('the editor frame sits outside the list, after it, in a single-column wrapper', () => {
    renderBench();
    const list = stations();
    const fig = frame();
    expect(fig).not.toBeNull();
    expect(list.contains(fig)).toBe(false);
    // eslint-disable-next-line no-bitwise
    expect(list.compareDocumentPosition(fig) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Same grid wrapper, and it is ONE column at every width — the old 5 / 7
    // split (`md:grid-cols-12`) is gone.
    const wrapper = list.parentElement;
    expect(wrapper).toBe(fig.parentElement.parentElement);
    expect(wrapper.className).toMatch(/grid-cols-\[minmax\(0,1fr\)\]/);
    expect(wrapper.className).not.toMatch(/md:grid-cols-12/);
    expect(fig.parentElement.className).not.toMatch(/col-span/);
  });

  it('station links underline in the page title ember, not the foreground', () => {
    renderBench();
    const link = screen.getByRole('link', { name: 'Visual Studio Code (opens in a new tab)' });
    expect(link.className).toMatch(/\bhover:underline\b/);
    expect(link.className).toMatch(/(^|\s)decoration-\[#ff6d05\](\s|$)/);
    // Every linked station, not just the first.
    const links = [...stations().querySelectorAll('a[target="_blank"]')];
    expect(links.length).toBeGreaterThan(0);
    links.forEach((a) => expect(a.className).toMatch(/(^|\s)decoration-\[#ff6d05\](\s|$)/));
  });

  it('every station after the first draws its own hairline element', () => {
    // The rule is an element (so it can draw in on the station's own
    // viewport gate), rendered by every row but the first; the extensions
    // row is not a ruled row and carries none.
    renderBench();
    const rows = [...stations().querySelectorAll(':scope > .uses-row')];
    expect(rows[0].querySelector('.uses-row__rule')).toBeNull();
    rows.slice(1).forEach((row) => expect(row.querySelector('.uses-row__rule')).not.toBeNull());
    const ext = screen.getByText('Extensions I reach for').closest('li');
    expect(ext.querySelector('.uses-row__rule')).toBeNull();
  });

  it('globals.css clears the hairline on the first grid row under the md query', () => {
    // Each row draws its own rule; in a 3-across grid that would rule the
    // first row's 2nd and 3rd cells. The correction must be scoped to the
    // bench list and to the same breakpoint the grid switches on.
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    const block = css.match(
      /@media \(min-width: 768px\) \{\s*\.uses-bench__stations > \.uses-row:nth-child\(-n \+ 3\) > \.uses-row__rule \{\s*display: none;\s*\}\s*\}/,
    );
    expect(block).not.toBeNull();
    // …and the hairline element it corrects is still a 1px ember rule
    // drawn from its left edge.
    const rule = css.match(/\.uses-row__rule \{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/height: 1px/);
    expect(rule[1]).toMatch(/transform-origin: left center/);
  });
});
