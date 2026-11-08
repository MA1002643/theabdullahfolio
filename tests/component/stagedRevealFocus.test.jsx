import { act, render, screen, waitFor } from '@testing-library/react';
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
});
