import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// First paint before the animation features arrive (issue #200).
//
// Every `m.*` element on the site renders before framer's features chunk has
// downloaded: LazyMotion loads it asynchronously. Until it lands the element
// shows its `initial` style, so an entrance from `opacity: 0` is invisible
// for that window. That is the accepted cost. What must NOT happen is the
// element staying there: when the features arrive, the entrance that was
// "missed" at mount has to play. framer 14 does this
// (`manuallyAnimateOnMount`); this pins it, against the REAL `m` (the suite's
// setup maps `m` to `motion`, tests/support/motionDouble.js).
//
// MotionGlobalConfig.skipAnimations is on in this suite, so "the entrance
// played" reads as "landed on its target".

const actual = await vi.importActual('framer-motion');
const { LazyMotion, m, domAnimation } = actual;

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('LazyMotion first paint', () => {
  it('renders the content at once and plays its entrance when the features land', async () => {
    const features = deferred();
    render(
      <LazyMotion features={() => features.promise} strict>
        <m.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          Hello
        </m.p>
      </LazyMotion>,
    );

    // In the document, with real text, before any feature code exists: the
    // server-rendered HTML a crawler and a no-JS reader get.
    const text = screen.getByText('Hello');
    expect(text.style.opacity).toBe('0');

    await act(async () => {
      features.resolve(domAnimation);
      await features.promise;
    });

    await waitFor(() => expect(text.style.opacity).toBe('1'));
    expect(text).toBeVisible();
  });

  it('works through the site provider and its real features module', async () => {
    const { default: MotionFeatures } = await import('@/components/motion/MotionFeatures');
    render(
      <MotionFeatures>
        <m.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          Title
        </m.h1>
      </MotionFeatures>,
    );
    const title = screen.getByRole('heading', { name: 'Title' });
    await waitFor(() => expect(title.style.opacity).toBe('1'));
    expect(title).toBeVisible();
  });

  it('throws on a `motion.*` component inside the strict provider (development)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <LazyMotion features={domAnimation} strict>
          <actual.motion.div animate={{ opacity: 1 }} />
        </LazyMotion>,
      ),
    ).toThrow(/LazyMotion/);
    error.mockRestore();
  });
});
