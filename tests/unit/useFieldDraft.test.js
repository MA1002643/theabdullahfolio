// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFieldDraft } from '@/hooks/useFieldDraft';
import { DRAFT_TTL_MS } from '@/lib/contact';

// The guestbook composer's draft layer. jsdom per-file (the suite default is
// node — everything else under test is pure server/shared code): this hook is
// React effects around localStorage, so it needs a DOM and a renderer.
//
// The tests drive the hook exactly the way MessageInput does: `writeField` is
// a mock (in the app it dispatches a native input event; here the "parent
// onChange" is simulated by rerendering with the new value), and time is
// faked so the 600ms debounce and the 7-day TTL are exact.

const KEY = 'test:draft:v1';
const read = () => JSON.parse(window.localStorage.getItem(KEY));

describe('useFieldDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const mount = (initialValue = '') => {
    const writeField = vi.fn();
    const utils = renderHook(
      ({ value }) => useFieldDraft({ storageKey: KEY, value, writeField }),
      { initialProps: { value: initialValue } },
    );
    return { writeField, ...utils };
  };

  it('restores a fresh draft into the field on mount', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ value: 'hello from yesterday', savedAt: Date.now() }),
    );
    const { writeField, result } = mount();
    expect(writeField).toHaveBeenCalledWith('hello from yesterday');
    expect(result.current.restored).toBe(true);
  });

  it('the mount pass must not delete the draft it is restoring', () => {
    // The autosave effect also runs at mount, where value is still '' — the
    // skip guard is what stops that pass from removing the stored draft.
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ value: 'precious words', savedAt: Date.now() }),
    );
    mount();
    expect(read()?.value).toBe('precious words');
  });

  it('drops a draft older than the TTL without touching the field', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ value: 'stale', savedAt: Date.now() - DRAFT_TTL_MS - 1 }),
    );
    const { writeField, result } = mount();
    expect(writeField).not.toHaveBeenCalled();
    expect(result.current.restored).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('autosaves typed content after the debounce, not before', () => {
    const { rerender } = mount();
    rerender({ value: 'half a mark' });
    act(() => vi.advanceTimersByTime(599));
    expect(window.localStorage.getItem(KEY)).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(read()?.value).toBe('half a mark');
  });

  it('only the settled value is written — earlier keystrokes cancel', () => {
    const { rerender } = mount();
    rerender({ value: 'hel' });
    act(() => vi.advanceTimersByTime(300));
    rerender({ value: 'hello wall' });
    act(() => vi.advanceTimersByTime(600));
    expect(read()?.value).toBe('hello wall');
  });

  it('emptying the field removes the draft immediately (the submit clear)', () => {
    const { rerender } = mount();
    rerender({ value: 'about to send' });
    act(() => vi.advanceTimersByTime(600));
    expect(read()?.value).toBe('about to send');
    rerender({ value: '' });
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('clearDraft empties the field, the storage, and the banner', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ value: 'restore me', savedAt: Date.now() }),
    );
    const { writeField, result } = mount();
    expect(result.current.restored).toBe(true);
    act(() => result.current.clearDraft());
    expect(writeField).toHaveBeenLastCalledWith('');
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(result.current.restored).toBe(false);
  });

  it('dismissRestored hides the banner but keeps the content saved', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ value: 'keep me', savedAt: Date.now() }),
    );
    const { result } = mount();
    act(() => result.current.dismissRestored());
    expect(result.current.restored).toBe(false);
    expect(read()?.value).toBe('keep me');
  });
});
