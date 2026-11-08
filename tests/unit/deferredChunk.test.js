import { afterEach, describe, expect, it, vi } from 'vitest';

import { deferredChunk } from '@/lib/deferredChunk';

// The loader behind every deferred chunk (issue #55): the /about dialogs and
// the Ember Passage runtime. Its contract is what makes "prefetch on intent"
// safe to bind to events that fire dozens of times (pointerover).

const Component = () => null;

afterEach(() => vi.restoreAllMocks());

describe('deferredChunk', () => {
  it('shares one download between every preload, load and render', async () => {
    const load = vi.fn(async () => ({ default: Component }));
    const chunk = deferredChunk(load, 'Test');
    chunk.preload();
    chunk.preload();
    await chunk.load();
    await chunk.loader();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed download, so the next call retries instead of replaying the failure', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { name: 'ChunkLoadError' }))
      .mockResolvedValue({ default: Component });
    const chunk = deferredChunk(load, 'Test');
    await expect(chunk.load()).rejects.toThrow('offline');
    await expect(chunk.load()).resolves.toEqual({ default: Component });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('preload never rejects (it is bound straight to event handlers)', async () => {
    const chunk = deferredChunk(() => Promise.reject(new Error('offline')), 'Test');
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    chunk.preload();
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('the dynamic loader picks the named export, and degrades to rendering nothing', async () => {
    const named = deferredChunk(async () => ({ Modal: Component }), 'Named', (m) => m.Modal);
    expect((await named.loader()).default).toBe(Component);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = deferredChunk(() => Promise.reject(new Error('offline')), 'Broken');
    const { default: Fallback } = await broken.loader();
    expect(Fallback()).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Broken could not load'), expect.any(String));
  });
});
