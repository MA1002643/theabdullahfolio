import { act } from '@testing-library/react';
import { MotionGlobalConfig, visualElementStore } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { usesData } from '@/app/data';
import EditorFrame from '@/components/uses/EditorFrame';
import { renderWithIntl } from '../support/intl';

// Tab onto the /uses editor's code block before the frame has revealed
// (review, 2026-11-08).
//
// The <pre> is focusable (it scrolls sideways on a phone), so a keyboard user
// can reach it while the frame is still shut. useStagedReveal answers focus
// with `instant`, but EditorFrame ignored it: `on` turned true and the screen
// then ran its 0.65s unroll and the line-by-line typing on their normal
// schedule, so focus landed on a shut screen and untyped lines. Under
// `instant` the frame now opens fully typed at once, with no carets.

// framer's own value for a layer, so the check does not depend on jsdom
// keeping a `clip-path` it does not implement.
const valueOf = (el, key) => visualElementStore.get(el)?.values.get(key);

const frames = (n) =>
  new Promise((resolve) => {
    const step = (left) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(n);
  });

describe('EditorFrame and keyboard focus', () => {
  // The suite completes every tween on its first frame; this case is about the
  // tweens' real length, so real timing is restored.
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = false;
  });
  afterEach(() => {
    MotionGlobalConfig.skipAnimations = true;
  });

  it('opens fully typed at once when Tab reaches the code block before the reveal', async () => {
    const { container } = renderWithIntl(
      <EditorFrame
        frame={usesData.editorFrame}
        // The plate has not revealed: the gate stays shut on its own.
        revealed={false}
        reduceMotion={false}
        revealedAtRef={{ current: null }}
      />,
    );
    const figure = container.querySelector('figure');
    const screenLayer = container.querySelector('.uses-editor__screen');
    const code = container.querySelector('pre');
    const lines = [...container.querySelectorAll('.uses-editor__typed code')];
    expect(lines.length).toBe(usesData.editorFrame.lines.length);
    // Shut before focus, and the typing carets are there to run.
    expect(valueOf(screenLayer, 'clipPath')?.get()).toBe('inset(0 0 100% 0)');
    expect(container.querySelectorAll('.uses-caret').length).toBeGreaterThan(0);

    await act(async () => code.focus());
    expect(document.activeElement).toBe(code);
    // Two frames: a 0.65s unroll and ~1s of typing are nowhere near done on
    // their normal schedule.
    await act(() => frames(2));

    expect(valueOf(figure, 'opacity')?.get()).toBe(1);
    const unroll = valueOf(screenLayer, 'clipPath');
    expect(unroll?.isAnimating()).toBe(false);
    expect(unroll?.get()).toBe('inset(0 0 0% 0)');
    for (const line of lines) {
      const typed = valueOf(line, 'clipPath');
      expect(typed?.isAnimating()).toBe(false);
      expect(typed?.get()).toBe('inset(0 0% 0 0)');
    }
    // No caret runs or blinks over text that is already typed.
    expect(container.querySelectorAll('.uses-caret').length).toBe(0);
    // The block is still the focused element: nothing remounted under it.
    expect(document.activeElement).toBe(code);
  });
});
