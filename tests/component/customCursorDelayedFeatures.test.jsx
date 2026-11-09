import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The custom cursor and a late features chunk (issue #200).
//
// The dot and ring are `m.*` elements, so until framer's LazyMotion features
// land they have no renderer and a pointer move writes nothing to the DOM. The
// OS cursor used to be hidden on the first move regardless, leaving a frozen
// custom cursor and no native one for the length of the download. A position
// now counts only once the features have committed.

const features = vi.hoisted(() => {
  let resolve;
  const state = { promise: null };
  state.reset = () => {
    state.promise = new Promise((r) => {
      resolve = r;
    });
  };
  state.resolve = () => resolve({});
  state.reset();
  return state;
});

vi.mock('@/lib/motion/loadFeatures', () => ({
  loadMotionFeatures: () => features.promise,
  loadLayoutFeatures: () => features.promise,
}));

const { default: CustomCursor } = await import('@/components/CustomCursor');

const hidden = () => document.documentElement.classList.contains('custom-cursor-active');
const move = (x = 120, y = 80) => fireEvent.pointerMove(window, { clientX: x, clientY: y });

let originalMatchMedia;
beforeEach(() => {
  features.reset();
  originalMatchMedia = window.matchMedia;
  // A fine pointer with motion allowed: the cursor activates.
  window.matchMedia = (query) => ({
    matches: query === '(pointer: fine)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('CustomCursor with delayed motion features', () => {
  it('keeps the native cursor while the features are still downloading', () => {
    render(<CustomCursor />);
    move();
    move(140, 90);
    expect(hidden()).toBe(false);
  });

  it('does not hide the native cursor on arrival alone: it waits for a position the renderer can draw', async () => {
    render(<CustomCursor />);
    move();
    await act(async () => {
      features.resolve();
      await features.promise;
    });
    expect(hidden()).toBe(false);

    act(() => move(160, 100));
    expect(hidden()).toBe(true);
  });

  it('never hides the native cursor if the features never arrive', async () => {
    render(<CustomCursor />);
    for (let i = 0; i < 5; i += 1) act(() => move(100 + i, 100));
    await act(async () => {});
    expect(hidden()).toBe(false);
  });
});
