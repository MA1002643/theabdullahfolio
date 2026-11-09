import { afterEach, describe, expect, it, vi } from 'vitest';

import { deferredChunk } from '@/lib/deferredChunk';
import { resilient } from '@/lib/motion/loadFeatures';

// The LazyMotion loader never rejects (issue #200). LazyMotion has no error
// path, so a rejected loader would leave every `m.*` element at its
// server-rendered `initial` style for the rest of the visit: a fade-in from
// opacity 0 is invisible text. A failed download is retried instead.

afterEach(() => vi.useRealTimers());

describe('resilient feature loader', () => {
  it('resolves to the module’s default export', async () => {
    const bundle = { renderer: () => {} };
    const load = resilient(deferredChunk(async () => ({ default: bundle }), 'test'));
    await expect(load()).resolves.toBe(bundle);
  });

  it('retries a failed download until it lands, without ever rejecting', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bundle = { renderer: () => {} };
    let attempts = 0;
    const load = resilient(
      deferredChunk(async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('ChunkLoadError');
        return { default: bundle };
      }, 'test'),
    );

    const settled = vi.fn();
    load().then(settled, settled);
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toBe(1);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(attempts).toBe(3);
    expect(settled).toHaveBeenCalledWith(bundle);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  // Retrying alone left a chunk that is gone for good (deleted by a deploy,
  // blocked by an extension) pending for the whole visit, with every entrance
  // invisible. The loader gives up on a bound, still without rejecting, and
  // <MotionFeatures> renders the final state (tests/component/motionStaticFallback.test.jsx).
  describe('giving up', () => {
    it('gives up after three failed attempts, and keeps retrying behind it', async () => {
      vi.useFakeTimers();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      let attempts = 0;
      const load = resilient(
        deferredChunk(async () => {
          attempts += 1;
          throw new Error('ChunkLoadError');
        }, 'test'),
      );
      const gaveUp = vi.fn();
      const settled = vi.fn();
      load().then(settled, settled);
      load.onGiveUp(gaveUp);

      await vi.advanceTimersByTimeAsync(1_000); // attempts 1 and 2
      expect(gaveUp).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(3_000); // attempt 3
      expect(attempts).toBe(3);
      expect(gaveUp).toHaveBeenCalledTimes(1);
      expect(settled).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(10_000);
      expect(attempts).toBe(4);
      expect(gaveUp).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    it('gives up on a request that hangs, at the deadline', async () => {
      vi.useFakeTimers();
      const load = resilient(deferredChunk(() => new Promise(() => {}), 'test'), { giveUpAfterMs: 8_000 });
      const gaveUp = vi.fn();
      load();
      load.onGiveUp(gaveUp);
      await vi.advanceTimersByTimeAsync(7_999);
      expect(gaveUp).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(gaveUp).toHaveBeenCalledTimes(1);
    });

    it('never gives up once the features have landed', async () => {
      vi.useFakeTimers();
      const load = resilient(deferredChunk(async () => ({ default: {} }), 'test'));
      const gaveUp = vi.fn();
      load.onGiveUp(gaveUp);
      await load();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(gaveUp).not.toHaveBeenCalled();
    });

    it('tells a listener that subscribes after the loader gave up, at once', async () => {
      vi.useFakeTimers();
      const load = resilient(deferredChunk(() => new Promise(() => {}), 'test'), { giveUpAfterMs: 100 });
      load();
      await vi.advanceTimersByTimeAsync(100);
      const late = vi.fn();
      load.onGiveUp(late);
      expect(late).toHaveBeenCalledTimes(1);
    });

    it('stops telling a listener that unsubscribed', async () => {
      vi.useFakeTimers();
      const load = resilient(deferredChunk(() => new Promise(() => {}), 'test'), { giveUpAfterMs: 100 });
      load();
      const listener = vi.fn();
      const unsubscribe = load.onGiveUp(listener);
      unsubscribe();
      await vi.advanceTimersByTimeAsync(100);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  it('shares one download between callers', async () => {
    const fetches = vi.fn(async () => ({ default: {} }));
    const load = resilient(deferredChunk(fetches, 'test'));
    const [a, b] = await Promise.all([load(), load()]);
    expect(a).toBe(b);
    expect(fetches).toHaveBeenCalledTimes(1);
  });
});
