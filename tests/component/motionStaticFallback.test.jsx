import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The terminal fallback for framer's features chunk (issue #200).
//
// LazyMotion has no error path, and the loader never rejects, so a chunk that
// is gone for good (a deploy removed it) used to leave every `m.*` entrance at
// its `initial` style for the visit: page content at opacity 0, despite a page
// that hydrated. Once the loader gives up (src/lib/motion/loadFeatures.js),
// <MotionFeatures> remounts its subtree under a presence context that blocks
// the initial animation, and framer seeds each element from its `animate`
// target with no renderer at all.
//
// Run against the REAL `m` (the suite maps `m` to `motion`,
// tests/support/motionDouble.js), and a loader whose chunk never arrives.

const actual = await vi.importActual('framer-motion');
const { m } = actual;

const loader = vi.hoisted(() => {
  const listeners = new Set();
  const load = () => new Promise(() => {});
  load.onGiveUp = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  load.giveUp = () => listeners.forEach((listener) => listener());
  load.reset = () => listeners.clear();
  return load;
});

vi.mock('@/lib/motion/loadFeatures', () => ({ loadMotionFeatures: loader, loadLayoutFeatures: loader }));

const { default: MotionFeatures, LayoutMotionFeatures } = await import('@/components/motion/MotionFeatures');

beforeEach(() => loader.reset());

function Page() {
  return (
    <>
      <m.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        Title
      </m.h1>
      <m.ul initial="hidden" animate="shown" variants={{ hidden: { opacity: 0 }, shown: { opacity: 1 } }}>
        <m.li variants={{ hidden: { clipPath: 'inset(0 100% 0 0)' }, shown: { clipPath: 'inset(0 0% 0 0)' } }}>
          Inherited
        </m.li>
      </m.ul>
      <m.p initial={{ opacity: 0 }} animate={{ opacity: [0, 0.4, 0.9] }}>
        Keyframes
      </m.p>
      <m.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
        In view
      </m.p>
    </>
  );
}

describe('motion static fallback', () => {
  it('holds the initial style while the features are only late', () => {
    render(
      <MotionFeatures>
        <Page />
      </MotionFeatures>,
    );
    expect(screen.getByRole('heading', { name: 'Title' }).style.opacity).toBe('0');
  });

  it('shows every entrance at its final state once the loader gives up', () => {
    render(
      <MotionFeatures>
        <Page />
      </MotionFeatures>,
    );
    act(() => loader.giveUp());

    const title = screen.getByRole('heading', { name: 'Title' });
    expect(title.style.opacity).toBe('1');
    expect(title.style.transform).toBe('none');
    expect(screen.getByText('Inherited').style.clipPath).toBe('inset(0 0% 0 0)');
    // The LAST keyframe, not the first.
    expect(screen.getByText('Keyframes').style.opacity).toBe('0.9');
    // No animate target: no seeded style, so the CSS default (visible).
    expect(screen.getByText('In view').style.opacity).toBe('');
    expect(title).toBeVisible();
  });

  it('covers content mounted after the fallback, outside an AnimatePresence', () => {
    function Later() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {open && (
            <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              Opened
            </m.div>
          )}
        </>
      );
    }
    render(
      <MotionFeatures>
        <Later />
      </MotionFeatures>,
    );
    act(() => loader.giveUp());
    act(() => screen.getByRole('button', { name: 'Open' }).click());
    expect(screen.getByText('Opened').style.opacity).toBe('1');
  });

  it('applies to the layout provider too', () => {
    render(
      <LayoutMotionFeatures>
        <m.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          Card
        </m.div>
      </LayoutMotionFeatures>,
    );
    act(() => loader.giveUp());
    expect(screen.getByText('Card').style.opacity).toBe('1');
  });
});
