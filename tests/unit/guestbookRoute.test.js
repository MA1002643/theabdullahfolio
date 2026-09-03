import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Same env discipline as the other suites: pin the json driver (pointed at a
// temp dir) before the route — and, transitively, the store — is imported.
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.GUESTBOOK_DRIVER = 'json';

// The route reads identity through `@/auth` (Auth.js v5). Nothing under test
// here concerns identity — GET is public and only personalises
// `viewerReaction` — so the session is stubbed anonymous rather than booting
// next-auth in a unit test.
vi.mock('@/auth', () => ({ auth: async () => null }));

const ENDPOINT = 'http://localhost/api/guestbook';
const get = (qs = '') => new Request(`${ENDPOINT}${qs}`);

const WALL = 7;
const base = Date.UTC(2026, 2, 1);
const seed = (i) => ({
  id: `msg_${i}`,
  author: { name: `Visitor ${i}`, username: `visitor${i}`, avatar: null },
  message: `mark ${i}`,
  createdAt: new Date(base + i * 60_000).toISOString(),
});

// The wall's read contract (issue #40 follow-up): a GET is ONE bounded page
// plus a separately-counted total — never the whole wall — and a client that
// follows `nextCursor` sees every message exactly once, newest first.
describe('GET /api/guestbook — cursor pagination', () => {
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guestbook-route-'));
    process.env.GUESTBOOK_JSON_PATH = join(dir, 'guestbook.json');
    const store = await import('@/lib/guestbook/store');
    for (let i = 1; i <= WALL; i++) await store.addMessage(seed(i));
    await store.setReaction('msg_7', 'someone', 'fire');
  });

  it('serves one page, the total, and a cursor — enriched, private map stripped', async () => {
    const { GET } = await import('@/app/api/guestbook/route');
    const res = await GET(get('?limit=3'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(WALL);
    expect(body.messages.map((m) => m.id)).toEqual(['msg_7', 'msg_6', 'msg_5']);
    expect(typeof body.nextCursor).toBe('string');
    // Aggregate counts and the (anonymous) viewer's choice only — never the
    // { username: key } map the json driver stores inline.
    expect(body.messages[0].reactions).toEqual({ fire: 1, rocket: 0, heart: 0 });
    expect(body.messages[0].viewerReaction).toBe(null);
    expect(body.messages[0]).not.toHaveProperty('someone');
    expect(Object.values(body.messages[0].reactions)).not.toContain('fire');
  });

  it('following nextCursor walks the whole wall once, newest first, ending in null', async () => {
    const { GET } = await import('@/app/api/guestbook/route');
    const seen = [];
    let cursor = null;
    let pages = 0;
    do {
      const qs = cursor ? `?limit=3&cursor=${encodeURIComponent(cursor)}` : '?limit=3';
      const body = await (await GET(get(qs))).json();
      expect(body.messages.length).toBeLessThanOrEqual(3);
      seen.push(...body.messages.map((m) => m.id));
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual([7, 6, 5, 4, 3, 2, 1].map((i) => `msg_${i}`));
  });

  it('clamps limit to the ceiling and falls back to the default on garbage', async () => {
    const { GET } = await import('@/app/api/guestbook/route');
    const { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } = await import(
      '@/lib/guestbook/paging'
    );
    expect(MAX_PAGE_LIMIT).toBeLessThan(1000);
    const capped = await (await GET(get('?limit=1000'))).json();
    expect(capped.messages.length).toBe(Math.min(WALL, MAX_PAGE_LIMIT));
    const fallback = await (await GET(get('?limit=abc'))).json();
    expect(fallback.messages.length).toBe(Math.min(WALL, DEFAULT_PAGE_LIMIT));
  });

  it('refuses a cursor it did not mint', async () => {
    const { GET } = await import('@/app/api/guestbook/route');
    const res = await GET(get('?cursor=definitely-not-a-cursor'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cursor/i);
  });
});
