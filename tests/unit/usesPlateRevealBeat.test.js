// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Plate from '@/components/uses/Plate';
import { useStagedReveal } from '@/components/uses/useStagedReveal';

// The plate's reveal STAMP (`revealedAtRef`) and the cascade it drives.
//
// The stamp used to be written during render, which made the component impure:
// React may abandon a render, and a render-phase write survives it, so the
// timestamp could outlive a reveal that never committed. It is now written in a
// LAYOUT effect — the one commit-safe slot that still precedes every child's
// passive effect, which is what the cascade depends on.
//
// An abandoned render cannot be provoked deterministically from a test, so this
// suite pins the property that the move actually risks — the ORDERING — plus
// the purity itself, which is checkable directly: a child that reads the ref
// during its own render must see nothing there yet.
//
//   · Children on screen when the plate reveals share one beat and cascade
//     (`base + index * step`).
//   · A child arriving later reads a stale stamp, scores it as a lone arrival
//     and plays with no index delay.
//
// Those two branches are the whole point of the stamp; if the write moved to a
// slot the children read too early or too late, one of them breaks.

const observers = new Set();

// A controllable IntersectionObserver: every observed element is reported as
// on screen only when the test says so, which is what lets a child "arrive"
// after the plate has already revealed.
class TestIO {
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    observers.add(this);
  }
  observe(target) {
    this.targets.add(target);
    if (target.dataset?.inview === 'true') this.fire(target, true);
  }
  unobserve(target) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    observers.delete(this);
  }
  fire(target, isIntersecting) {
    this.callback([{ target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }], this);
  }
}

const arrive = (el) =>
  act(() => {
    observers.forEach((o) => {
      if (o.targets.has(el)) o.fire(el, true);
    });
  });

// A row that records the delay useStagedReveal handed it, and — separately —
// what the shared ref held during each of its RENDERS. The second is the purity
// probe, and it has to sample every render rather than just the first: a row's
// first render happens before the plate reveals, when the ref is legitimately
// null under either implementation. The render that distinguishes them is the
// one where `revealed` first reads true — a render-phase stamp is already
// visible to children by then, a commit-phase one is not.
function Row({ revealed, reduceMotion, revealedAtRef, index, seen, renders, inView }) {
  const { ref, on, delay } = useStagedReveal({
    revealed,
    reduceMotion,
    revealedAtRef,
    index,
    step: 0.1,
    base: 0.2,
  });
  if (index === 0) renders.push({ revealed, at: revealedAtRef.current });
  if (on) seen.set(index, delay);
  return createElement('div', { ref, 'data-testid': `row-${index}`, 'data-inview': String(inView) });
}

describe('Plate reveal stamp — commit-safe, and the cascade it drives', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', TestIO);
    // Stubbed, not assigned: a bare `window.matchMedia = …` is not undone by
    // vi.unstubAllGlobals, so it would outlive this file's afterEach and make
    // any later test that wants a different query result order-dependent.
    // jsdom ships no matchMedia of its own, so unstubbing restores `undefined`
    // — which every caller here already guards for.
    vi.stubGlobal('matchMedia', (query) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }));
    // The intro loader has already lifted, so the plate reveals as soon as it
    // is seen rather than waiting out the 6s insurance timeout.
    window.__loaderDone = true;
  });

  afterEach(() => {
    cleanup();
    observers.clear();
    vi.unstubAllGlobals();
    delete window.__loaderDone;
  });

  const mount = ({ seen, renders, rows }) =>
    render(
      createElement(
        Plate,
        { slug: 'test', ordinal: '01', title: 'Test plate' },
        ({ revealed, reduceMotion, revealedAtRef }) =>
          rows.map((inView, index) =>
            createElement(Row, {
              key: index,
              index,
              inView,
              revealed,
              reduceMotion,
              revealedAtRef,
              seen,
              renders,
            }),
          ),
      ),
    );

  it('never exposes the stamp during a render — it is written in the commit phase', async () => {
    const seen = new Map();
    const renders = [];
    const { container } = mount({ seen, renders, rows: [true, true] });
    arrive(container.querySelector('.uses-plate'));

    await waitFor(() => expect(seen.size).toBe(2));
    // The render where the plate first reads as revealed is the one an
    // abandoned render would leak from. A child rendering in it must still see
    // an unwritten ref; a render-phase latch puts a number here instead.
    const firstRevealed = renders.find((r) => r.revealed);
    expect(firstRevealed).toBeDefined();
    expect(firstRevealed.at).toBeNull();
  });

  it('rows on screen at the reveal share the beat and cascade by index', async () => {
    const seen = new Map();
    const renders = [];
    const { container } = mount({ seen, renders, rows: [true, true, true] });
    arrive(container.querySelector('.uses-plate'));

    await waitFor(() => expect(seen.size).toBe(3));
    // base 0.2 + index * step 0.1 — the stamp was there when the rows read it.
    expect(seen.get(0)).toBeCloseTo(0.2, 5);
    expect(seen.get(1)).toBeCloseTo(0.3, 5);
    expect(seen.get(2)).toBeCloseTo(0.4, 5);
  });

  it('a row arriving after the beat has passed plays alone, with no index delay', async () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    try {
      const seen = new Map();
      const renders = [];
      const { container } = mount({ seen, renders, rows: [true, false] });
      arrive(container.querySelector('.uses-plate'));
      await vi.waitFor(() => expect(seen.has(0)).toBe(true));

      // Past SAME_BEAT_MS (200ms), then the second row scrolls into view.
      act(() => vi.advanceTimersByTime(400));
      arrive(container.querySelector('[data-testid="row-1"]'));

      await vi.waitFor(() => expect(seen.has(1)).toBe(true));
      expect(seen.get(0)).toBeCloseTo(0.2, 5);
      expect(seen.get(1)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
