import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Navigation from '@/components/navigation';
import { renderWithIntl } from '../support/intl.jsx';

// The orbital navigation in reading direction (issue #82).
//
// In RTL the ring is drawn as the MIRROR of the LTR ring: every button's x is
// reflected, so the rotation sense, the order the buttons sit in and the side
// the reveal starts from all flip, while every size and depth stays put. The
// arrow keys stay PHYSICAL — ← carries the near arc left in both directions —
// which, in a mirrored ring, means the RTL ← does what the LTR → does.
//
// Both properties fall out of one invariant this suite pins: the RTL ring
// after ← is the x-reflection of the LTR ring after → (and vice versa). The
// reflection of a ring whose near arc moved RIGHT is one whose near arc moved
// LEFT, so a reflected pose under the OPPOSITE key is exactly "same physical
// direction on screen". The pairing is also why the same key is not mirrored:
// that would mean ← moves the RTL near arc to the right.
//
// Reduced motion is reported so arrow presses apply instantly (no rAF glide),
// and the reveal timers are run out so every button is visible.

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line jsx-a11y/anchor-has-content
  Link: ({ href, prefetch, ...props }) => <a href={href} {...props} />,
  usePathname: () => '/',
}));

let savedMatchMedia;
beforeEach(() => {
  savedMatchMedia = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  vi.useFakeTimers();
});
afterEach(() => {
  window.matchMedia = savedMatchMedia;
  vi.useRealTimers();
});

const translate = (el) => {
  const [, x, y] = el
    .closest('[style*="translate"]')
    .style.transform.match(/translate\((-?[\d.e+-]+)px, (-?[\d.e+-]+)px\)/);
  return { x: Number(x), y: Number(y) };
};

/** Every button's rendered position, keyed by its href, after `key` (if any). */
function positions(locale, key) {
  const view = renderWithIntl(
    <Navigation setHovered={() => {}} hovered={false} laptopRef={{ current: null }} />,
    { locale },
  );
  act(() => vi.runAllTimers());
  const links = screen.getAllByRole('link');
  if (key) fireEvent.keyDown(links[0], { key });
  const out = Object.fromEntries(
    screen.getAllByRole('link').map((a) => [a.getAttribute('href'), translate(a)]),
  );
  view.unmount();
  return out;
}

const close = (a, b) => Math.abs(a - b) < 1e-6;

describe('Navigation — reading direction', () => {
  it('names every ring button from the catalogue', () => {
    renderWithIntl(
      <Navigation setHovered={() => {}} hovered={false} laptopRef={{ current: null }} />,
    );
    act(() => vi.runAllTimers());
    for (const name of ['About', 'Projects', 'Qualifications', 'Contact', 'Journey', 'My Past', 'Guestbook', 'Uses']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it.each([
    ['at rest', undefined, undefined],
    ['RTL ← mirrors LTR →', 'ArrowLeft', 'ArrowRight'],
    ['RTL → mirrors LTR ←', 'ArrowRight', 'ArrowLeft'],
  ])('draws the RTL ring as the mirror of the LTR ring: %s', (_label, rtlKey, ltrKey) => {
    const ltr = positions('en', ltrKey);
    const rtl = positions('ar', rtlKey);
    for (const href of Object.keys(ltr)) {
      expect(close(rtl[href].x, -ltr[href].x), `${href} x`).toBe(true);
      expect(close(rtl[href].y, ltr[href].y), `${href} y`).toBe(true);
    }
  });

  it('actually turns the ring on an arrow press', () => {
    const rest = positions('en');
    const turned = positions('en', 'ArrowLeft');
    expect(turned['/about']).not.toEqual(rest['/about']);
  });
});
