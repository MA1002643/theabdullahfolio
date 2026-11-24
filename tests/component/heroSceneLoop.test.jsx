import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The hero live-recording loop's gates and fail-safety (issue #31, owner
// 2026-11-21; CLAUDE.md §5). The loop is ambient decoration over the hero
// still — a multi-megabyte one — so every gate errs toward the still:
// reduced motion and a device asking for less (Save-Data, small memory or
// core count) never download a byte, a failed or refused playback unmounts
// the layer, and the fade-in waits for real playing frames.

let reduced = false;
vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => reduced }));
vi.mock('@/components/motion/useStaticMotion', () => ({ useStaticMotion: () => false }));
vi.mock('@/lib/webglSupport', () => ({ canCreateWebGL: () => false }));
// Idle time is now: the gate itself is what these tests exercise.
vi.mock('@/lib/whenIdle', () => ({
  whenIdle: (cb) => {
    cb();
    return () => {};
  },
}));

const { default: HeroMedia } = await import('@/components/case-study/HeroMedia');
const { default: HeroSceneLoop } = await import('@/components/case-study/HeroSceneLoop');

const SOURCES = [
  { max: 1280, webm: '/x/hero-loop-960.webm', mp4: '/x/hero-loop-960.mp4' },
  { max: Infinity, webm: '/x/hero-loop.webm', mp4: '/x/hero-loop.mp4' },
];
const MEDIA = {
  src: '/projects/theabdullahfolio/hero.webp',
  alt: 'The home page still',
  width: 1600,
  height: 1000,
  video: { sources: SOURCES },
};

// jsdom's HTMLMediaElement has no real playback: play() must be stubbed or
// it logs "not implemented". Resolving is the autoplay-granted browser.
let playStub;
beforeEach(() => {
  playStub = vi
    .spyOn(window.HTMLMediaElement.prototype, 'play')
    .mockImplementation(() => Promise.resolve());
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  // jsdom may report a tiny machine; the gate under test must see a device
  // that did NOT ask for less unless a case says otherwise.
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
  Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
  delete navigator.connection;
  window.innerWidth = 1440;
  window.devicePixelRatio = 1;
});

afterEach(() => {
  reduced = false;
  delete navigator.connection;
  vi.restoreAllMocks();
});

describe('hero loop gates (HeroMedia)', () => {
  it('never mounts the video under reduced motion, image untouched', async () => {
    reduced = true;
    const { container, getByAltText } = render(<HeroMedia {...MEDIA} />);
    expect(getByAltText('The home page still')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('video')).toBeNull());
    expect(playStub).not.toHaveBeenCalled();
  });

  it('never mounts the video when the device asked for less (Save-Data)', async () => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    });
    const { container } = render(<HeroMedia {...MEDIA} />);
    await waitFor(() => expect(container.querySelector('video')).toBeNull());
  });

  it('never mounts the video without sources', async () => {
    const { container } = render(<HeroMedia {...MEDIA} video={null} />);
    await waitFor(() => expect(container.querySelector('video')).toBeNull());
  });

  it('mounts the loop, plays it, and fades in only on real playing frames', async () => {
    const { container } = render(<HeroMedia {...MEDIA} />);
    const video = await waitFor(() => {
      const el = container.querySelector('video');
      expect(el).not.toBeNull();
      return el;
    });
    expect(video).toHaveAttribute('aria-hidden');
    expect(video.querySelector('source[type="video/webm"]')).toHaveAttribute(
      'src',
      '/x/hero-loop.webm',
    );
    await waitFor(() => expect(playStub).toHaveBeenCalled());
    expect(video.className).not.toContain('is-live');
    fireEvent(video, new Event('playing'));
    expect(video.className).toContain('is-live');
  });

  it('picks the small rung for a narrow painted width', async () => {
    window.innerWidth = 390;
    window.devicePixelRatio = 2;
    const { container } = render(<HeroMedia {...MEDIA} />);
    await waitFor(() =>
      expect(container.querySelector('source[type="video/webm"]')).toHaveAttribute(
        'src',
        '/x/hero-loop-960.webm',
      ),
    );
  });
});

describe('hero loop fail-safety (HeroSceneLoop)', () => {
  it('a decode or source failure unmounts the video entirely', async () => {
    const { container } = render(<HeroSceneLoop sources={SOURCES} />);
    const video = await waitFor(() => {
      const el = container.querySelector('video');
      expect(el).not.toBeNull();
      return el;
    });
    fireEvent(video, new Event('error'));
    await waitFor(() => expect(container.querySelector('video')).toBeNull());
  });

  it('an autoplay refusal (NotAllowedError) withdraws to the still', async () => {
    playStub.mockImplementation(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    const { container } = render(<HeroSceneLoop sources={SOURCES} />);
    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
    await waitFor(() => expect(container.querySelector('video')).toBeNull());
  });

  it('a routine play/pause interruption (AbortError) does NOT unmount it', async () => {
    playStub.mockImplementation(() => Promise.reject(new DOMException('no', 'AbortError')));
    const { container } = render(<HeroSceneLoop sources={SOURCES} />);
    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
    // Give the rejection a tick to (wrongly) act, then confirm it did not.
    await new Promise((r) => setTimeout(r, 10));
    expect(container.querySelector('video')).not.toBeNull();
  });
});
