// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReactionBar from '@/components/guestbook/ReactionBar';

// The ember burst against a canvas that cannot draw. `getContext('2d')` is
// nullable — a browser with canvas disabled by policy, a headless or
// resource-starved renderer, a lost context — and the burst is fired
// synchronously ahead of the reaction request. It used to dereference the
// context unguarded, so a null context threw and the click never reached
// `onReact`: a decorative effect breaking the button's actual job. The burst
// now no-ops, and these tests drive the real component through a click with
// the context stubbed null, asserting the request still goes out.
//
// AnimatePresence is replaced by a pass-through for the same reason as in the
// refine test: the rolling count's exit choreography is not under test, and
// the real one would keep ghost spans mounted under jsdom.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AnimatePresence: ({ children }) => children ?? null };
});

const MESSAGE = {
  id: 'msg-1',
  reactions: { fire: 2, rocket: 0, heart: 1 },
  viewerReaction: null,
};

function renderBar(props) {
  return render(
    createElement(ReactionBar, {
      message: MESSAGE,
      canReact: true,
      onReact: vi.fn(async () => {}),
      ...props,
    }),
  );
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  // Force the motion branch: useReducedMotion must read "no preference", or
  // the burst is skipped before the canvas is ever touched.
  window.matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
  window.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ReactionBar — a canvas with no 2D context never blocks the reaction', () => {
  it('sends the reaction when getContext returns null', async () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    const onReact = vi.fn(async () => {});
    renderBar({ onReact });

    const fire = screen.getByRole('button', { name: /^Fire/ });
    await act(async () => {
      fireEvent.click(fire);
    });
    await flush();

    // The burst was attempted — the guard, not reduced motion, is what
    // stopped it — and the click still did its job.
    expect(getContext).toHaveBeenCalledWith('2d');
    expect(onReact).toHaveBeenCalledTimes(1);
    expect(onReact).toHaveBeenCalledWith('msg-1', 'fire', false);
    // The pending lock released after the request resolved.
    expect(fire.disabled).toBe(false);
  });

  it('a following click still works — nothing was left half-armed', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const onReact = vi.fn(async () => {});
    renderBar({ onReact });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Fire/ }));
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Heart/ }));
    });
    await flush();

    expect(onReact).toHaveBeenNthCalledWith(1, 'msg-1', 'fire', false);
    expect(onReact).toHaveBeenNthCalledWith(2, 'msg-1', 'heart', false);
  });

  it('with a working context the burst still draws (the guard is not a kill switch)', async () => {
    const ctx = {
      scale: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      globalAlpha: 1,
      fillStyle: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    // Hold the frame loop: one scheduled frame proves the burst was armed,
    // and nothing runs after the test ends.
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const onReact = vi.fn(async () => {});
    renderBar({ onReact });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Rocket/ }));
    });
    await flush();

    expect(ctx.scale).toHaveBeenCalledTimes(1);
    expect(raf).toHaveBeenCalledTimes(1);
    expect(onReact).toHaveBeenCalledWith('msg-1', 'rocket', false);
  });
});
