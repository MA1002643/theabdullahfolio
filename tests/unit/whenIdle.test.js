import { afterEach, describe, expect, it, vi } from 'vitest';

import { whenIdle } from '@/lib/whenIdle';

// The idle scheduler behind every deferred chunk (issue #55): the /about
// dialogs' idle prefetch and the Ember Passage runtime download.
//
// Its cancel function carries real weight. The passage provider's
// reduced-motion hook reports `false` until hydration ends, so a reduced-motion
// visitor's first effect schedules the runtime download, and the re-render that
// follows must cancel it before idle arrives; otherwise that visitor downloads
// a runtime they will never see. So these cases pin both schedulers: the
// timeout handed to `requestIdleCallback`, cancellation before the callback
// runs, and the `setTimeout` fallback for browsers without idle callbacks.
//
// This project runs in Node, so `window` is stubbed per case with exactly the
// schedulers under test, and nothing else.

/**
 * A stand-in for the browser's idle queue that honours cancellation: `flush()`
 * runs whatever is still scheduled, as the browser would when it goes idle (or
 * the deadline passes).
 */
function fakeIdleQueue() {
  const pending = new Map();
  let nextId = 1;
  const requestIdleCallback = vi.fn((fn) => {
    const id = nextId++;
    pending.set(id, fn);
    return id;
  });
  const cancelIdleCallback = vi.fn((id) => {
    pending.delete(id);
  });
  const flush = () => {
    const due = [...pending.values()];
    pending.clear();
    for (const fn of due) fn({ didTimeout: false, timeRemaining: () => 50 });
  };
  return { requestIdleCallback, cancelIdleCallback, flush, pending };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('whenIdle with native idle callbacks', () => {
  it('schedules through requestIdleCallback with the default 3000ms deadline, and runs once idle', () => {
    const queue = fakeIdleQueue();
    const setTimeoutSpy = vi.fn();
    vi.stubGlobal('window', { ...queue, setTimeout: setTimeoutSpy, clearTimeout: vi.fn() });
    const callback = vi.fn();

    whenIdle(callback);

    expect(queue.requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(queue.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 });
    // Nothing runs until the browser is idle, and the fallback is never used.
    expect(callback).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    queue.flush();
    expect(callback).toHaveBeenCalledTimes(1);
    // The idle deadline object is not leaked to the callback.
    expect(callback).toHaveBeenCalledWith();
  });

  it('passes a caller-supplied deadline through as the timeout option', () => {
    const queue = fakeIdleQueue();
    vi.stubGlobal('window', queue);
    whenIdle(() => {}, 750);
    expect(queue.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 750 });
  });

  it('cancels a callback that has not run yet: it never runs when idle arrives', () => {
    const queue = fakeIdleQueue();
    vi.stubGlobal('window', queue);
    const callback = vi.fn();

    const cancel = whenIdle(callback);
    const [id] = queue.requestIdleCallback.mock.results.map((r) => r.value);
    cancel();

    expect(queue.cancelIdleCallback).toHaveBeenCalledTimes(1);
    expect(queue.cancelIdleCallback).toHaveBeenCalledWith(id);
    expect(queue.pending.size).toBe(0);
    queue.flush();
    expect(callback).not.toHaveBeenCalled();
  });

  it('cancels only its own callback, so one cleanup cannot drop another prefetch', () => {
    const queue = fakeIdleQueue();
    vi.stubGlobal('window', queue);
    const passage = vi.fn();
    const dialog = vi.fn();

    const cancelPassage = whenIdle(passage);
    whenIdle(dialog);
    cancelPassage();
    queue.flush();

    expect(passage).not.toHaveBeenCalled();
    expect(dialog).toHaveBeenCalledTimes(1);
  });

  // The provider's sequence: the first effect runs with reduced motion still
  // reported `false`, schedules the download, and is cleaned up by the
  // re-render once the real preference is known, before the browser is idle.
  it('a cleanup between scheduling and idle prevents the deferred download', () => {
    const queue = fakeIdleQueue();
    vi.stubGlobal('window', queue);
    const load = vi.fn(() => Promise.resolve());

    const cleanup = whenIdle(() => {
      load();
    });
    cleanup();
    queue.flush();

    expect(load).not.toHaveBeenCalled();
  });
});

describe('whenIdle without requestIdleCallback (the setTimeout fallback)', () => {
  const stubTimerWindow = () => {
    vi.useFakeTimers();
    const win = {
      setTimeout: vi.fn((fn, ms) => setTimeout(fn, ms)),
      clearTimeout: vi.fn((id) => clearTimeout(id)),
    };
    vi.stubGlobal('window', win);
    return win;
  };

  it('falls back to a 200ms timeout, whatever deadline was asked for', () => {
    const win = stubTimerWindow();
    const callback = vi.fn();

    whenIdle(callback, 5000);

    expect(win.setTimeout).toHaveBeenCalledTimes(1);
    expect(win.setTimeout).toHaveBeenCalledWith(callback, 200);
    vi.advanceTimersByTime(199);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending timeout through clearTimeout, so it never fires', () => {
    const win = stubTimerWindow();
    const callback = vi.fn();

    const cancel = whenIdle(callback);
    const id = win.setTimeout.mock.results[0].value;
    cancel();

    expect(win.clearTimeout).toHaveBeenCalledWith(id);
    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('is not chosen when requestIdleCallback exists but is not a function', () => {
    // Guards the feature test itself: only a callable scheduler counts.
    const win = stubTimerWindow();
    win.requestIdleCallback = undefined;
    const callback = vi.fn();
    whenIdle(callback);
    expect(win.setTimeout).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('whenIdle on the server', () => {
  it('schedules nothing and returns a no-op cancel when there is no window', () => {
    // The unit project's own environment: no `window` at all.
    expect(typeof window).toBe('undefined');
    const callback = vi.fn();
    const cancel = whenIdle(callback);
    expect(typeof cancel).toBe('function');
    expect(() => cancel()).not.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });
});
