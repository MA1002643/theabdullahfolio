import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LanguageSelector, { anchorPanel } from '@/components/i18n/LanguageSelector';
import { renderWithIntl } from '../support/intl.jsx';

// The language selector's panel (issue #82).
//
// In the footer it opened inside a `<footer class="overflow-hidden">` and a
// transformed split-flap <span>: the overflow sliced the top off the upward
// panel, and the transform became the containing block of the phone's fixed
// bottom sheet, which collapsed into a sliver. The panel is now portalled to
// <body>; this pins that it escapes its ancestors, that the anchor maths keeps
// it inside the viewport, and that the combobox still closes and hands focus
// back like the other overlays.

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line jsx-a11y/anchor-has-content
  Link: ({ href, prefetch, ...props }) => <a href={href} {...props} />,
}));

// One shared spy, so a case can see which language was chosen.
const { switchTo } = vi.hoisted(() => ({ switchTo: vi.fn() }));
vi.mock('@/i18n/useLocaleSwitch', () => ({
  useLocaleSwitch: () => ({ switchTo, pending: false }),
}));

let savedMatchMedia;
beforeEach(() => {
  switchTo.mockClear();
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
});
afterEach(() => {
  window.matchMedia = savedMatchMedia;
});

function renderInFooter() {
  return renderWithIntl(
    <footer className="overflow-hidden">
      <span style={{ transform: 'translateY(0px)' }}>
        <LanguageSelector source="footer" placement="up" variant="inline" />
      </span>
    </footer>,
  );
}

describe('LanguageSelector panel', () => {
  it('portals the open panel to <body>, outside the clipping footer', async () => {
    const { container } = renderInFooter();
    const trigger = screen.getByRole('button', { name: /language/i });
    await act(async () => fireEvent.click(trigger));

    const list = screen.getByRole('listbox');
    expect(container.querySelector('footer').contains(list)).toBe(false);
    expect(list.closest('.locale-panel').parentElement).toBe(document.body);
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    renderInFooter();
    const trigger = screen.getByRole('button', { name: /language/i });
    await act(async () => fireEvent.click(trigger));
    await act(async () => fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' }));

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('closes on a press outside both the trigger and the panel', async () => {
    renderInFooter();
    const trigger = screen.getByRole('button', { name: /language/i });
    await act(async () => fireEvent.click(trigger));

    // Inside the portalled panel: stays open.
    await act(async () => fireEvent.pointerDown(screen.getByRole('listbox')));
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await act(async () => fireEvent.pointerDown(document.body));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('LanguageSelector opening focus', () => {
  // A tap that focused the search field raised the phone's keyboard over the
  // list (owner report, 2026-11-07). Touch and pen focus the listbox instead;
  // a mouse or the keyboard still lands in the field.
  async function openWith(pointerType) {
    renderInFooter();
    const trigger = screen.getByRole('button', { name: /language/i });
    if (pointerType) fireEvent.pointerDown(trigger, { pointerType });
    await act(async () => fireEvent.click(trigger));
    return trigger;
  }

  it('focuses the listbox, not the search field, after a touch tap', async () => {
    await openWith('touch');
    expect(screen.getByRole('listbox')).toHaveFocus();
    expect(screen.getByRole('combobox')).not.toHaveFocus();
  });

  it('focuses the listbox after a pen press', async () => {
    await openWith('pen');
    expect(screen.getByRole('listbox')).toHaveFocus();
  });

  it('focuses the search field after a mouse click', async () => {
    await openWith('mouse');
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('focuses the search field when opened from the keyboard after an earlier tap', async () => {
    const trigger = await openWith('touch');
    await act(async () => fireEvent.click(trigger)); // tap again: closes
    // Enter on a button raises a click with no pointerdown before it.
    await act(async () => fireEvent.click(trigger));
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('focuses the search field from the keyboard after a tap cancelled by scrolling', async () => {
    renderInFooter();
    const trigger = screen.getByRole('button', { name: /language/i });
    // A touch that becomes a scroll: pointerdown, then pointercancel, no click.
    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    fireEvent.pointerCancel(trigger, { pointerType: 'touch' });
    // Enter on the button: a click with no pointerdown before it.
    await act(async () => fireEvent.click(trigger));
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(screen.getByRole('listbox')).not.toHaveFocus();
  });

  it('closes on Escape from the tap-focused listbox and returns focus', async () => {
    const trigger = await openWith('touch');
    await act(async () => fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  // Touch with a hardware keyboard (review, 2026-11-08): the search field sits
  // just before the tap-focused listbox, so Shift+Tab must reach it with the
  // panel still open. Through the field's own handler, the Tab branch closed
  // the panel and focused the trigger before the browser could move focus.
  it.each(['touch', 'pen'])('moves from the %s-focused listbox to search on Shift+Tab, panel open', async (pointerType) => {
    const trigger = await openWith(pointerType);
    const list = screen.getByRole('listbox');
    expect(list).toHaveFocus();

    let notPrevented;
    await act(async () => {
      notPrevented = fireEvent.keyDown(list, { key: 'Tab', shiftKey: true });
    });

    // The default is taken over: focus is placed, not left to the browser.
    expect(notPrevented).toBe(false);
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  // Space on the tap-focused listbox (review, 2026-11-08): it fell through to
  // the search field's handler, which has no Space case, so ArrowDown then
  // Space neither chose the highlighted language nor stopped the list
  // scrolling. On a focused listbox Space selects, as Enter does.
  it.each(['touch', 'pen'])('chooses the highlighted language on Space from the %s-focused listbox', async (pointerType) => {
    const trigger = await openWith(pointerType);
    const list = screen.getByRole('listbox');
    await act(async () => fireEvent.keyDown(list, { key: 'ArrowDown' }));
    const highlighted = list.getAttribute('aria-activedescendant');
    expect(highlighted).toBeTruthy();
    // The option id ends in the locale code (`…-opt-<code>`).
    const expected = highlighted.split('-opt-').pop();

    let notPrevented;
    await act(async () => {
      notPrevented = fireEvent.keyDown(list, { key: ' ' });
    });

    // No page or list scroll: the default is taken over.
    expect(notPrevented).toBe(false);
    expect(switchTo).toHaveBeenCalledTimes(1);
    expect(switchTo.mock.calls[0][0]).toBe(expected);
    // Closed and focus handed back, exactly as Enter does.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('leaves Space to the search field, where it is typed, not a selection', async () => {
    await openWith('mouse');
    const field = screen.getByRole('combobox');
    expect(field).toHaveFocus();
    let notPrevented;
    await act(async () => {
      notPrevented = fireEvent.keyDown(field, { key: ' ' });
    });
    expect(notPrevented).toBe(true);
    expect(switchTo).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('still closes and returns focus to the trigger on a plain Tab from the listbox', async () => {
    const trigger = await openWith('touch');
    await act(async () => fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Tab' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('sets the search text at 16px at every width, so iOS does not zoom into it', async () => {
    await openWith('touch');
    const field = screen.getByRole('combobox');
    expect(field).toHaveClass('text-base');
    // No smaller size at any breakpoint either: a phone in landscape is past `sm`.
    expect(field.className).not.toMatch(/(^|\s)([a-z0-9-]+:)*text-(xs|sm)(\s|$)/);
  });
});

describe('anchorPanel', () => {
  const viewport = { width: 1440, height: 900 };
  const rect = { top: 510, bottom: 540, left: 1150, right: 1256 };

  it('opens upward above the trigger, end-aligned, height capped by the room above', () => {
    const style = anchorPanel(rect, { placement: 'up', rtl: false, viewport });
    expect(style.bottom).toBe(900 - 510 + 8);
    expect(style.right).toBe(1440 - 1256);
    expect(style.maxHeight).toBe(510 - 8 - 8);
    expect(style.top).toBeUndefined();
  });

  it('opens downward below the trigger, height capped by the room below', () => {
    const style = anchorPanel({ top: 20, bottom: 60, left: 40, right: 140 }, { placement: 'down', rtl: false, viewport });
    expect(style.top).toBe(68);
    expect(style.maxHeight).toBe(900 - 60 - 16);
  });

  it('anchors the start edge in right-to-left, never past the gutter', () => {
    const style = anchorPanel({ top: 510, bottom: 540, left: 2, right: 100 }, { placement: 'up', rtl: true, viewport });
    expect(style.left).toBe(8);
    expect(style.right).toBeUndefined();
  });

  it('never caps the height below a usable minimum', () => {
    const style = anchorPanel({ top: 30, bottom: 60, left: 0, right: 100 }, { placement: 'up', rtl: false, viewport });
    expect(style.maxHeight).toBe(160);
  });
});
