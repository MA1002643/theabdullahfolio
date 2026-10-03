import { afterEach, describe, expect, it, vi } from 'vitest';

import { optionalChunk } from '@/lib/optionalChunk';

// optionalChunk (issue #92): a lazily loaded component that may fail without
// taking the route down with it. The browser proof is the chaos suite
// (tests/e2e/resilience.spec.js, "a lazy chunk fails to load"); this pins the
// contract the fix rests on.

afterEach(() => vi.restoreAllMocks());

describe('optionalChunk', () => {
  it('passes a successful import through untouched', async () => {
    const Component = () => 'scene';
    const loader = optionalChunk(async () => ({ default: Component }), 'Scene');
    await expect(loader()).resolves.toEqual({ default: Component });
  });

  it('turns a failed chunk load into a component that renders nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chunkError = Object.assign(new Error('Loading chunk 6689 failed.'), { name: 'ChunkLoadError' });
    const loader = optionalChunk(() => Promise.reject(chunkError), 'AuroraDust');
    const { default: Fallback } = await loader();
    expect(Fallback()).toBeNull();
    // Still visible to anyone looking, as a warning rather than an error.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('AuroraDust could not load'), 'ChunkLoadError');
  });

  it('never rejects, whatever the import throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const thrown of [new TypeError('Failed to fetch'), 'a string', undefined]) {
      await expect(optionalChunk(() => Promise.reject(thrown), 'X')()).resolves.toHaveProperty('default');
    }
  });
});
