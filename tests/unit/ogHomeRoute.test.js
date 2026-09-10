import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getWide } from '@/app/og/home/route';
import { GET as getSquare } from '@/app/og/home-square/route';

// The live homepage share cards (issues #88 v2, #90). These render a real
// PNG, which makes this suite slower than its neighbours and also far more
// useful than a shallow one: it proves the subsetted WOFF fonts parse, the
// seal decodes, satori composes the tree, and the cache header comes out the
// way the route asked — all the things that fail silently in production
// because an unfurler never reports an error.

const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

beforeEach(() => {
  // No network in unit tests. Rejecting also exercises the fail-soft path:
  // every live signal is unavailable, so the card must fall back to the pure
  // identity composition rather than throwing.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('offline'))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each([
  ['wide', getWide, 1200, 630],
  ['square', getSquare, 1200, 1200],
])('/og/home %s card', (_label, handler, width, height) => {
  it('renders a PNG even with every live signal down', async () => {
    const res = await handler();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');

    const png = Buffer.from(await res.arrayBuffer());
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    // IHDR carries the real canvas size: bytes 16-23 of a PNG are width and
    // height, so this checks what was rasterised, not what was requested.
    expect(png.readUInt32BE(16)).toBe(width);
    expect(png.readUInt32BE(20)).toBe(height);
  }, 30000);

  it('serves its own cache-control, not ImageResponse’s immutable default', async () => {
    const res = await handler();

    // The regression this pins: ImageResponse spreads `options.headers` over
    // a lowercase 'cache-control' default, so a capital-C key does not
    // override it — both survive and the response goes out as
    // "public, immutable, no-transform, max-age=31536000, public, s-maxage=…".
    // A card whose whole point is hourly live data was frozen for a year.
    expect(res.headers.get('cache-control')).toBe(CACHE);
    expect(res.headers.get('cache-control')).not.toMatch(/immutable/);
  }, 30000);
});
