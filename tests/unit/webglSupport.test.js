// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { canCreateWebGL, resetWebGLSupportCache } from '@/lib/webglSupport';

// The WebGL probe, and the project scene's use of it. A browser with no WebGL
// context (headless Firefox in CI, WebGL switched off, a blocklisted driver)
// made three.js throw, and the throw took every sub-page down to Next's bare
// error screen. The probe decides first, on a throwaway canvas.

const realGetContext = HTMLCanvasElement.prototype.getContext;

function stubGetContext(impl) {
  HTMLCanvasElement.prototype.getContext = impl;
}

beforeEach(() => resetWebGLSupportCache());
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  cleanup();
});

describe('canCreateWebGL', () => {
  it('is false when the browser hands out no context of either version', () => {
    stubGetContext(() => null);
    expect(canCreateWebGL()).toBe(false);
  });

  it('accepts WebGL1 when WebGL2 is refused', () => {
    stubGetContext((type) =>
      type === 'webgl' ? { getExtension: () => null } : null,
    );
    expect(canCreateWebGL()).toBe(true);
  });

  it('releases the probe context, since browsers cap live contexts', () => {
    const loseContext = vi.fn();
    stubGetContext(() => ({ getExtension: () => ({ loseContext }) }));
    expect(canCreateWebGL()).toBe(true);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('is false, not a throw, when getContext itself throws', () => {
    stubGetContext(() => {
      throw new Error('blocked by policy');
    });
    expect(canCreateWebGL()).toBe(false);
  });

  it('asks once per page and reuses the answer', () => {
    const getContext = vi.fn(() => null);
    stubGetContext(getContext);
    expect(canCreateWebGL()).toBe(false);
    const calls = getContext.mock.calls.length;
    stubGetContext(() => ({ getExtension: () => null }));
    expect(canCreateWebGL()).toBe(false);
    expect(calls).toBe(2); // webgl2, then webgl, on the first call only
  });
});

