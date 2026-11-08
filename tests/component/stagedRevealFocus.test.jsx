import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig, motion } from 'framer-motion';
import { describe, expect, it, vi } from 'vitest';

import { staged, useStagedReveal } from '@/components/uses/useStagedReveal';

// A Tab that lands inside a /uses element before it has revealed (CI,
// 2026-11-08). The stagger delay held a Bench station's link lowered out of its
// mask while focused: a focus ring on nothing, which the keyboard suite caught
// as "obscured by span.uses-note" (WCAG 2.4.11), intermittently, whenever the
// box sat still through the delay. Focus entering first now reveals the
// element at once and lands every layer with a 0s transition.

function Probe({ revealed }) {
  const { ref, on, delay, instant } = useStagedReveal({
    revealed,
    reduceMotion: false,
    revealedAtRef: { current: null },
    index: 2,
    step: 0.1,
    base: 0.1,
    columnStagger: 0.16,
  });
  const transition = staged(instant, delay, 0.12, 0.6);
  return (
    <div ref={ref} data-testid="probe" data-on={String(on)} data-duration={String(transition.duration)}>
      <a href="#x">tool</a>
    </div>
  );
}

describe('useStagedReveal and keyboard focus', () => {
  it('reveals at once, with no transition, when focus arrives before the reveal', async () => {
    // The plate has not revealed: the gate stays shut on its own.
    render(<Probe revealed={false} />);
    const probe = screen.getByTestId('probe');
    expect(probe.dataset.on).toBe('false');

    await act(async () => screen.getByRole('link', { name: 'tool' }).focus());
    expect(probe.dataset.on).toBe('true');
    expect(probe.dataset.duration).toBe('0');
  });

  it('leaves an element that has already revealed to its own transition', async () => {
    // An observer that reports every target in view, so the gate opens.
    class InView {
      constructor(callback) {
        this.callback = callback;
      }
      observe(target) {
        queueMicrotask(() =>
          this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this),
        );
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', InView);
    try {
      render(<Probe revealed />);
      const probe = screen.getByTestId('probe');
      await waitFor(() => expect(probe.dataset.on).toBe('true'));
      expect(probe.dataset.duration).toBe('0.6');
      await act(async () => screen.getByRole('link', { name: 'tool' }).focus());
      expect(probe.dataset.duration).toBe('0.6');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // The window the first fix missed (review, 2026-11-08): `on` is already
  // true, so the reveal counted as "played", but the tween is still in its
  // stagger delay or mid-flight. A new transition prop alone does not reach a
  // running framer tween (its target has not changed), so the link stayed
  // lowered out of its mask while focused. The running layers must land.
  it('lands a reveal still in its stagger delay when focus arrives', async () => {
    await focusDuringReveal(async () => {
      // Two frames in: the 0.42s delay has not elapsed.
      await frames(2);
    });
  });

  it('lands a reveal that is mid-tween when focus arrives', async () => {
    await focusDuringReveal(async (layer) => {
      // Past the delay, not yet at rest: strictly between 140% and 0%.
      await waitFor(
        () => {
          const y = Number(/translateY\(([\d.]+)%\)/.exec(layer.style.transform)?.[1]);
          expect(y > 0 && y < 140).toBe(true);
        },
        { timeout: 3000, interval: 10 },
      );
    });
  });
});

async function focusDuringReveal(waitIntoReveal) {
  class InView {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target) {
      queueMicrotask(() =>
        this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this),
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', InView);
  // The component suite completes every tween on its first frame; this case
  // is about a tween that has NOT completed, so real timing is restored.
  MotionGlobalConfig.skipAnimations = false;
  try {
    // Revealed this beat, so the station cascades with its index delay.
    render(<MaskedStation revealedAtRef={{ current: performance.now() }} />);
    const probe = screen.getByTestId('station');
    const layer = screen.getByTestId('mask-layer');
    await waitFor(() => expect(probe.dataset.on).toBe('true'));
    await waitIntoReveal(layer);
    expect(isAtRest(layer)).toBe(false);

    await act(async () => screen.getByRole('link', { name: 'tool' }).focus());
    await act(() => frames(2));
    expect(isAtRest(layer)).toBe(true);
    expect(probe.dataset.duration).toBe('0');
  } finally {
    MotionGlobalConfig.skipAnimations = true;
    vi.unstubAllGlobals();
    cleanup();
  }
}

// A Bench station's mask layer, as BenchPlate renders it: the link rides in a
// span that rises from 140% below its clipping mask.
function MaskedStation({ revealedAtRef }) {
  const { ref, on, delay, instant } = useStagedReveal({
    revealed: true,
    reduceMotion: false,
    revealedAtRef,
    index: 2,
    step: 0.1,
    base: 0.1,
  });
  const transition = staged(instant, delay, 0.12, 0.6);
  return (
    <div ref={ref} data-testid="station" data-on={String(on)} data-duration={String(transition.duration)}>
      <motion.span
        data-testid="mask-layer"
        initial={{ y: '140%' }}
        animate={{ y: on ? '0%' : '140%' }}
        transition={transition}
      >
        <a href="#x">tool</a>
      </motion.span>
    </div>
  );
}

const frames = (n) =>
  new Promise((resolve) => {
    const step = (left) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(n);
  });

// framer writes `none` (or a zero translate) once the layer has landed.
const isAtRest = (el) => {
  const t = el.style.transform;
  return t === '' || t === 'none' || /translateY\(0(%|px)?\)/.test(t);
};
