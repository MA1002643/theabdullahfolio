// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiSound } from '@/hooks/useUiSound';

// The UI blips are decoration: the hook's contract is that a blocked or
// failed AudioContext never surfaces. `AudioContext.resume()` is the one call
// in that path that fails ASYNCHRONOUSLY — a promise rejection (autoplay
// policy: NotAllowedError) sails past the synchronous try/catch and, left
// unhandled, is an unhandled promise rejection in the console. This suite
// fakes a suspended context whose resume() rejects and listens for exactly
// that.

vi.mock('@/hooks/useGuestbookPrefs', () => ({
  useGuestbookPrefs: () => ({ sound: true }),
}));

const started = [];
let resumeCalls = 0;

function fakeContext() {
  return {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    // A plain function, NOT vi.fn: a vi.fn attaches its own handlers to any
    // promise it returns (to record settled results), which would make the
    // rejection count as handled and hide the very bug under test.
    resume() {
      resumeCalls += 1;
      return Promise.reject(new Error('NotAllowedError'));
    },
    createOscillator: () => ({
      type: '',
      frequency: { value: 0 },
      connect() {},
      start: (at) => started.push(at),
      stop() {},
    }),
    createGain: () => ({
      gain: {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {},
    }),
  };
}

let ctx;
let unhandled;
const onUnhandled = (reason) => unhandled.push(reason);

beforeEach(() => {
  started.length = 0;
  resumeCalls = 0;
  unhandled = [];
  ctx = fakeContext();
  // The hook constructs the context lazily, on the first enabled play call,
  // and caches it at module level — so this stub is the one it keeps.
  vi.stubGlobal('AudioContext', function AudioContext() {
    return ctx;
  });
  process.on('unhandledRejection', onUnhandled);
});

afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
  cleanup();
  vi.unstubAllGlobals();
});

// Node reports an unhandled rejection only after the microtask queue drains,
// on a later tick — give it one.
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('useUiSound — a rejected AudioContext.resume() never surfaces', () => {
  it('swallows the rejection and still schedules the cue', async () => {
    const { result } = renderHook(() => useUiSound());
    await act(async () => {
      result.current('send');
    });
    await settle();

    expect(resumeCalls).toBe(1);
    expect(unhandled).toEqual([]);
    // Scheduling does not wait on resume: Web Audio starts queued nodes the
    // moment the context runs, and a context that never does plays nothing —
    // silently, which is the contract.
    expect(started).toHaveLength(2);
  });
});
