// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCommandPalette } from '@/hooks/useCommandPalette';

// The shared ⌘K palette's state engine. jsdom per-file (the suite default is
// node): the hook subscribes a window keydown listener and restores focus, so
// it needs a DOM and a renderer.
//
// What these pin down: every way OUT of the palette ends in the same state —
// closed, query empty, selection at the top, focus back where it was. The
// hotkey used to be the exception (it only flipped `open`).

const ACTIONS = [
  { id: 'home', label: 'Go home', section: 'Navigate', perform: () => {} },
  { id: 'journey', label: 'Journey', section: 'Navigate', perform: () => {} },
  { id: 'msg', label: 'Leave a message', section: 'Guestbook', perform: () => {} },
];

const hotkey = () =>
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );

// Stand-ins for "the element that had focus" and "the palette's input" (the
// component focuses its input on open; the hook never sees the component).
const mountFocusables = () => {
  const before = document.createElement('button');
  const input = document.createElement('input');
  document.body.append(before, input);
  return { before, input };
};

afterEach(() => {
  // Unmount explicitly: without vitest globals RTL registers no auto-cleanup,
  // so every renderHook above would otherwise stay mounted — each one a live
  // window keydown listener that the next test's ⌘K also toggles, and whose
  // close() re-targets focus. Unmount first, then clear the focusables.
  cleanup();
  document.body.innerHTML = '';
});

describe('useCommandPalette — every exit lands in the same state', () => {
  it('⌘K while open closes through close(): query + selection reset, focus restored', () => {
    const { before, input } = mountFocusables();
    before.focus();
    expect(document.activeElement).toBe(before);

    const { result } = renderHook(() => useCommandPalette(ACTIONS));
    act(() => hotkey());
    expect(result.current.open).toBe(true);

    input.focus();
    // A query that keeps SEVERAL results (every label has an "e"), so the
    // selection clamp cannot mask a missing reset.
    act(() => {
      result.current.setQuery('e');
      result.current.setActiveIndex(2);
    });
    expect(result.current.filtered).toHaveLength(3);
    expect(result.current.activeIndex).toBe(2);

    act(() => hotkey());
    expect(result.current.open).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.activeIndex).toBe(0);
    expect(document.activeElement).toBe(before);
  });

  it('Esc produces the identical end state', () => {
    const { before, input } = mountFocusables();
    before.focus();

    const { result } = renderHook(() => useCommandPalette(ACTIONS));
    act(() => hotkey());
    input.focus();
    act(() => {
      result.current.setQuery('e');
      result.current.setActiveIndex(1);
    });

    act(() =>
      result.current.onInputKeyDown({
        key: 'Escape',
        preventDefault: () => {},
      }),
    );
    expect(result.current.open).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.activeIndex).toBe(0);
    expect(document.activeElement).toBe(before);
  });

  it('the next ⌘K opens clean and re-records the focus-restore target', () => {
    const { before, input } = mountFocusables();
    before.focus();

    const { result } = renderHook(() => useCommandPalette(ACTIONS));
    act(() => hotkey());
    input.focus();
    act(() => result.current.setQuery('jour'));
    act(() => hotkey()); // close (focus → before)

    // A different element has focus by the time the palette is reopened.
    input.focus();
    act(() => hotkey());
    expect(result.current.open).toBe(true);
    expect(result.current.query).toBe('');
    expect(result.current.activeIndex).toBe(0);

    act(() => hotkey());
    expect(document.activeElement).toBe(input);
  });
});

// Under the intro loader the page is `inert`, so the component's focus() on
// its input is a no-op: opening there showed the dialog with nothing focused,
// and Esc and the arrows (handled on the input) did nothing. A ⌘K pressed
// while covered waits for `loaderuncovered`, which LoaderWrapper fires once
// `inert` is gone (code review).
describe('useCommandPalette — the intro loader', () => {
  const uncover = () => {
    window.__loaderCovered = false;
    window.dispatchEvent(new Event('loaderuncovered'));
  };

  afterEach(() => {
    delete window.__loaderCovered;
    vi.restoreAllMocks();
  });

  it('defers a ⌘K pressed under the loader until the page is uncovered', () => {
    window.__loaderCovered = true;
    const { result } = renderHook(() => useCommandPalette(ACTIONS));
    act(() => hotkey());
    expect(result.current.open).toBe(false);

    // `loaderdone` (the reveal STARTING) is too early: still inert.
    act(() => window.dispatchEvent(new Event('loaderdone')));
    expect(result.current.open).toBe(false);

    act(() => uncover());
    expect(result.current.open).toBe(true);
  });

  it('a second ⌘K while waiting cancels the deferred open', () => {
    window.__loaderCovered = true;
    const { result } = renderHook(() => useCommandPalette(ACTIONS));
    act(() => hotkey());
    act(() => hotkey());
    act(() => uncover());
    expect(result.current.open).toBe(false);

    // …and the next ⌘K, uncovered, opens at once.
    act(() => hotkey());
    expect(result.current.open).toBe(true);
  });

  it('an unmount drops the deferred open', () => {
    window.__loaderCovered = true;
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useCommandPalette(ACTIONS));
    act(() => hotkey());
    const [, waiting] = add.mock.calls.find(([type]) => type === 'loaderuncovered');
    unmount();
    expect(remove).toHaveBeenCalledWith('loaderuncovered', waiting);
  });
});
