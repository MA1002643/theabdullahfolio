import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { arcSweep } from '@/components/about/arcSweep';

// The /about score arcs when the viewport trigger beats framer's features
// (issue #200).
//
// Both arcs (the rank arc on the GitHub stats card, the activity arc on the
// repo card) used to start `useAnimation` controls from an effect on
// `playToken`. Controls reach only an element whose visual element has
// subscribed, and on LazyMotion there is none until the features chunk
// lands, so a play that fired first was dropped and the arc stayed empty.
// They now take declarative props from `arcSweep` and remount per play.
//
// Against the REAL `m` and `LazyMotion` (the suite maps `m` to `motion`,
// tests/support/motionDouble.js). Animations are skipped in this suite, so
// "the sweep played" reads as "the offset landed on the fill".

const actual = await vi.importActual('framer-motion');
const { LazyMotion, m, domAnimation, useAnimation } = actual;

const CIRCUMFERENCE = 2 * Math.PI * 36;
const FINAL = CIRCUMFERENCE * 0.25;

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function DeclarativeArc({ playToken, prefersReducedMotion = false }) {
  const arc = arcSweep({ playToken, finalOffset: FINAL, circumference: CIRCUMFERENCE, prefersReducedMotion });
  return (
    <svg>
      <m.circle
        key={arc.key}
        data-testid="arc"
        r="36"
        strokeDasharray={CIRCUMFERENCE}
        initial={arc.initial}
        animate={arc.animate}
        transition={{ duration: 2 }}
      />
    </svg>
  );
}

// The shape both arcs had before the fix, kept to pin what was wrong.
function ControlsArc({ playToken }) {
  const controls = useAnimation();
  useEffect(() => {
    if (playToken === 0) return;
    controls.set({ strokeDashoffset: CIRCUMFERENCE });
    controls.start({ strokeDashoffset: FINAL, transition: { duration: 2 } });
  }, [playToken, controls]);
  return (
    <svg>
      <m.circle data-testid="arc" r="36" strokeDasharray={CIRCUMFERENCE} initial={{ strokeDashoffset: CIRCUMFERENCE }} animate={controls} />
    </svg>
  );
}

const offset = (el) => Number.parseFloat(el.getAttribute('stroke-dashoffset') ?? el.style.strokeDashoffset);

async function playBeforeFeatures(Arc) {
  const features = deferred();
  const view = render(
    <LazyMotion features={() => features.promise} strict>
      <Arc playToken={0} />
    </LazyMotion>,
  );
  // The card scrolls into view while the chunk is still downloading.
  view.rerender(
    <LazyMotion features={() => features.promise} strict>
      <Arc playToken={1} />
    </LazyMotion>,
  );
  await act(async () => {
    features.resolve(domAnimation);
    await features.promise;
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  return view.getByTestId('arc');
}

describe('arc sweep with delayed motion features', () => {
  it('pins the defect: controls started before the features land are lost', async () => {
    const arc = await playBeforeFeatures(ControlsArc);
    expect(offset(arc)).toBeCloseTo(CIRCUMFERENCE);
  });

  it('fills the arc when the play fired before the features landed', async () => {
    const arc = await playBeforeFeatures(DeclarativeArc);
    expect(offset(arc)).toBeCloseTo(FINAL);
  });

  it('replays from empty on each new play', async () => {
    const view = render(
      <LazyMotion features={domAnimation} strict>
        <DeclarativeArc playToken={1} />
      </LazyMotion>,
    );
    const first = view.getByTestId('arc');
    view.rerender(
      <LazyMotion features={domAnimation} strict>
        <DeclarativeArc playToken={2} />
      </LazyMotion>,
    );
    // A fresh element: the sweep runs again rather than holding the old one.
    expect(view.getByTestId('arc')).not.toBe(first);
  });
});

describe('arcSweep', () => {
  const at = (playToken, prefersReducedMotion = false) =>
    arcSweep({ playToken, finalOffset: FINAL, circumference: CIRCUMFERENCE, prefersReducedMotion });

  it('rests empty before the first play', () => {
    expect(at(0).initial.strokeDashoffset).toBe(CIRCUMFERENCE);
    expect(at(0).animate.strokeDashoffset).toBe(CIRCUMFERENCE);
  });

  it('sweeps from empty to the fill on a play, with a key per play', () => {
    expect(at(3)).toEqual({
      key: 'play-3',
      initial: { strokeDashoffset: CIRCUMFERENCE },
      animate: { strokeDashoffset: FINAL },
    });
    expect(at(4).key).not.toBe(at(3).key);
  });

  it('rests at the fill under reduced motion and never remounts', () => {
    expect(at(0, true)).toEqual(at(7, true));
    expect(at(0, true).initial.strokeDashoffset).toBe(FINAL);
  });
});
