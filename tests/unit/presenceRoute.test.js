import { describe, expect, it } from 'vitest';

// Same env discipline as the other suites: the redis client and the limiter
// backend are chosen at module load, so pin the in-memory path before the
// route (and, transitively, the store) is imported.
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.GUESTBOOK_DRIVER = 'json';

const ENDPOINT = 'http://localhost/api/guestbook/presence';

const post = (id, headers) =>
  new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ id }),
  });

// Endpoint test for the abuse shape: one caller looping over UNIQUE,
// well-formed ids — every one of which used to become a registered presence
// and a Redis write. These go through the real route handler, in order, and
// share its module state (presence set + limiter window).
describe('POST /api/guestbook/presence — unique-id flood from one client', () => {
  it('registers beats up to the budget, then refuses without counting them', async () => {
    const route = await import('@/app/api/guestbook/presence/route');
    const { POST } = route;
    const { PRESENCE_BEATS_PER_MINUTE } = await import(
      '@/lib/guestbook/ratelimit'
    );
    const headers = { 'x-real-ip': '198.51.100.7' };

    for (let i = 1; i <= PRESENCE_BEATS_PER_MINUTE; i++) {
      const res = await POST(post(`flood-${String(i).padStart(4, '0')}`, headers));
      expect(res.status).toBe(200);
      expect((await res.json()).count).toBe(i);
    }

    const denied = await POST(post('flood-one-too-many', headers));
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0);

    // Another client is still served — and its reply is the read: the
    // refused id was never registered, so the count is the budget plus this
    // one beat, not plus two.
    const other = await POST(post('someone-else-0001', { 'x-real-ip': '198.51.100.8' }));
    expect(other.status).toBe(200);
    expect((await other.json()).count).toBe(PRESENCE_BEATS_PER_MINUTE + 1);

    // POST is the route's only method. The read-only GET was an unmetered
    // Redis prune + count per call, around the budget above (code review);
    // a method the file does not export is a 405 from Next, never a handler.
    expect(route.GET).toBeUndefined();
  });

  it('malformed ids are rejected before they touch the budget', async () => {
    const { POST } = await import('@/app/api/guestbook/presence/route');
    const headers = { 'x-real-ip': '198.51.100.9' };
    for (let i = 0; i < 5; i++) {
      // Too short for ID_RE — a 400, and no beat consumed.
      expect((await POST(post('nope', headers))).status).toBe(400);
    }
    expect((await POST(post('valid-id-0001', headers))).status).toBe(200);
  });

  it('falls back to the leftmost x-forwarded-for hop when x-real-ip is absent', async () => {
    const { POST } = await import('@/app/api/guestbook/presence/route');
    const { PRESENCE_BEATS_PER_MINUTE } = await import(
      '@/lib/guestbook/ratelimit'
    );
    const headers = { 'x-forwarded-for': '192.0.2.44, 10.0.0.1' };
    for (let i = 0; i < PRESENCE_BEATS_PER_MINUTE; i++) {
      expect((await POST(post(`proxied-${i}-0000`, headers))).status).toBe(200);
    }
    expect((await POST(post('proxied-final-0000', headers))).status).toBe(429);
  });
});
