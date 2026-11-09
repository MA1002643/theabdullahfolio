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

  it('shares one download between callers', async () => {
    const fetches = vi.fn(async () => ({ default: {} }));
    const load = resilient(deferredChunk(fetches, 'test'));
    const [a, b] = await Promise.all([load(), load()]);
    expect(a).toBe(b);
    expect(fetches).toHaveBeenCalledTimes(1);
  });
});
