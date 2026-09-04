// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CommandPalette from '@/components/commandPalette/CommandPalette';

// The palette's combobox has a name of its own (code review). The dialog is
// labelled "Command palette", but a dialog's label names the dialog, not an
// input nested inside it; and the placeholder is a hint that disappears on
// the first keystroke, never a persistent label. RTL's `name` option runs the
// accessible-name computation, so these read what a screen reader would.

const ACTIONS = [
  { id: 'one', label: 'First thing', section: 'Things', perform: () => {} },
  { id: 'two', label: 'Second thing', section: 'Things', perform: () => {} },
];

const hotkey = () =>
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }),
  );

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('CommandPalette — the search input is named', () => {
  it('the combobox is "Search commands", independent of the dialog and the placeholder', () => {
    const utils = render(createElement(CommandPalette, { actions: ACTIONS }));
    act(() => hotkey());

    const input = utils.getByRole('combobox', { name: 'Search commands' });
    expect(input.getAttribute('aria-label')).toBe('Search commands');

    // The dialog keeps its own name — the two are separate controls.
    expect(utils.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
    // The placeholder is still there as a hint, but it is not the name.
    expect(input.placeholder).toBeTruthy();
    expect(input.placeholder).not.toBe('Search commands');
    expect(utils.queryByRole('combobox', { name: input.placeholder })).toBe(null);
    // And the listbox the combobox controls is named too.
    expect(utils.getByRole('listbox', { name: 'Commands' })).toBeTruthy();
  });
});
