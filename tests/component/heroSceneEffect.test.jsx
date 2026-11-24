import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The hero cinemagraph's gates and its fail-safety (issue #31, owner
// 2026-11-19; CLAUDE.md §5). The effect is ambient decoration over the hero
// still, so every gate errs toward the still: reduced motion never mounts
// (or downloads) the chunk, a browser that cannot create WebGL is never
// asked to, and when the mounted chunk cannot actually start a context
// (jsdom's honest state) it renders NOTHING rather than a dead canvas —
// the still beneath is the page.

let reduced = false;
let webgl = true;
vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => reduced }));
vi.mock('@/components/motion/useStaticMotion', () => ({ useStaticMotion: () => false }));
vi.mock('@/lib/webglSupport', () => ({ canCreateWebGL: () => webgl }));
// Idle time is now: the gate itself is what these tests exercise.
vi.mock('@/lib/whenIdle', () => ({
  whenIdle: (cb) => {
    cb();
    return () => {};
  },
}));

const { default: HeroMedia } = await import('@/components/case-study/HeroMedia');
const { default: HeroSceneEffect } = await import('@/components/case-study/HeroSceneEffect');

const EFFECT = {
  water: [[0, 0.5, 0.3, 0.7]],
  mist: [[0, 0.4, 0.3, 0.6]],
  lights: [[0.14, 0.65, 0.07]],
};
const MEDIA = {
  src: '/projects/theabdullahfolio/hero.webp',
  alt: 'The home page still',
  width: 1600,
  height: 1000,
  effect: EFFECT,
};

// jsdom's getContext logs "not implemented" unless stubbed; returning null is
// exactly the browser-without-WebGL answer the component must survive.
const stubContext = () =>
  vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

afterEach(() => {
  reduced = false;
  webgl = true;
});

describe('hero cinemagraph gates (HeroMedia)', () => {
  it('never mounts the canvas under reduced motion, image untouched', async () => {
    reduced = true;
    stubContext();
    const { container, getByAltText } = render(<HeroMedia {...MEDIA} />);
    expect(getByAltText('The home page still')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('canvas')).toBeNull());
  });

  it('never mounts the canvas when WebGL cannot be created', async () => {
    webgl = false;
    stubContext();
    const { container, getByAltText } = render(<HeroMedia {...MEDIA} />);
    expect(getByAltText('The home page still')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('canvas')).toBeNull());
  });

  it('never mounts the canvas without an authored effect', async () => {
    stubContext();
    const { container } = render(<HeroMedia {...MEDIA} effect={null} />);
    await waitFor(() => expect(container.querySelector('canvas')).toBeNull());
  });
});

describe('hero cinemagraph fail-safety (HeroSceneEffect)', () => {
  it('renders nothing when the context cannot start, and does not throw', async () => {
    stubContext();
    const { container } = render(
      <HeroSceneEffect src={MEDIA.src} width={1600} height={1000} effect={EFFECT} />,
    );
    // The canvas mounts, asks for a context, gets none, and withdraws.
    await waitFor(() => expect(container.querySelector('canvas')).toBeNull());
    expect(container).toBeEmptyDOMElement();
  });

  it('starts hidden even where a context exists: it fades in only after a frame', () => {
    // Before any frame is drawn the canvas must be transparent (no is-live),
    // so a slow texture can never flash an empty black frame over the still.
    stubContext();
    const { container } = render(
      <HeroSceneEffect src={MEDIA.src} width={1600} height={1000} effect={EFFECT} />,
    );
    const canvas = container.querySelector('canvas');
    if (canvas) expect(canvas.className).not.toContain('is-live');
  });
});
