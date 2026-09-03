// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommandPalette from '@/components/commandPalette/CommandPalette';

// The shared ⌘K palette keeps focus on its input and drives the listbox with
// aria-activedescendant — which scrolls nothing by itself. With more actions
// than the 19rem list shows, arrowing used to walk the selection below the
// fold while Enter still ran it. The component now scrolls the active row to
// the nearest edge on every keyboard-driven selection change. jsdom has no
// layout, so the assertion is on the scrollIntoView call itself: which
// element, and with what alignment.

const ACTIONS = Array.from({ length: 30 }, (_, i) => ({
  id: `act-${i}`,
  label: `Action ${i}`,
  section: i < 15 ? 'First' : 'Second',
  perform: () => {},
}));

const hotkey = () =>
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );

let scrollSpy;

beforeEach(() => {
  // jsdom does not implement scrollIntoView at all — install one to observe.
  scrollSpy = vi.fn();
  Element.prototype.scrollIntoView = scrollSpy;
});

afterEach(() => {
  // Unmount explicitly: without vitest globals RTL registers no auto-cleanup,
  // and a palette left mounted would keep its window hotkey listener alive
  // into the next test.
  cleanup();
  delete Element.prototype.scrollIntoView;
  document.body.innerHTML = '';
});

// The row that carries an option: its <li> wrapper (so a section header
// directly above the option scrolls into view with it).
const rowOf = (id) => document.getElementById(`palette-opt-${id}`).closest('li');

function openPalette() {
  const utils = render(createElement(CommandPalette, { actions: ACTIONS }));
  act(() => hotkey());
  const input = utils.getByRole('combobox');
  return { ...utils, input };
}

describe('CommandPalette — the active option follows the keyboard into view', () => {
  it('arrowing down scrolls each newly-selected row to the nearest edge', () => {
    const { input } = openPalette();
    scrollSpy.mockClear();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('palette-opt-act-1');
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.mock.contexts[0]).toBe(rowOf('act-1'));
    expect(scrollSpy).toHaveBeenLastCalledWith({ block: 'nearest' });

    // Deep into the list — well past what 19rem could show.
    for (let i = 0; i < 20; i++) fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('palette-opt-act-21');
    expect(scrollSpy).toHaveBeenCalledTimes(21);
    expect(scrollSpy.mock.contexts.at(-1)).toBe(rowOf('act-21'));
  });

  it('arrowing up from the top wraps to the last row, and that row is scrolled to', () => {
    const { input } = openPalette();
    scrollSpy.mockClear();

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe('palette-opt-act-29');
    expect(scrollSpy.mock.contexts.at(-1)).toBe(rowOf('act-29'));
  });

  it('a filter that moves the selection to a different row follows it', () => {
    const { input } = openPalette();
    for (let i = 0; i < 5; i++) fireEvent.keyDown(input, { key: 'ArrowDown' });
    scrollSpy.mockClear();

    // "Action 2" matches 2, 20–29: index 5 is now act-24, a different row.
    fireEvent.change(input, { target: { value: 'Action 2' } });
    expect(input.getAttribute('aria-activedescendant')).toBe('palette-opt-act-24');
    expect(scrollSpy.mock.contexts.at(-1)).toBe(rowOf('act-24'));
  });

  it('a pointer hover selects without scrolling — the cursor is already on the row', () => {
    const { input } = openPalette();
    scrollSpy.mockClear();

    fireEvent.mouseMove(document.getElementById('palette-opt-act-7'));
    expect(input.getAttribute('aria-activedescendant')).toBe('palette-opt-act-7');
    expect(scrollSpy).not.toHaveBeenCalled();

    // …and the very next arrow key scrolls again as normal.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.mock.contexts[0]).toBe(rowOf('act-8'));
  });
});
