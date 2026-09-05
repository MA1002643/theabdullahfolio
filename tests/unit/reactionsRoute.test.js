import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Same env discipline as the other suites: pin the json driver (temp dir) and
// the in-memory limiter before the route — and, transitively, the store and
// the limiter — is imported.
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.GUESTBOOK_DRIVER = 'json';

// The session is the ONLY source of identity for this route; the stub lets a
// test choose who is calling (or nobody).
let sessionUser = null;
vi.mock('@/auth', () => ({
  auth: async () => (sessionUser ? { user: sessionUser } : null),
}));

const ENDPOINT = 'http://localhost/api/guestbook/reactions';
const post = (body) =>
  new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const KEYS = ['fire', 'rocket', 'heart'];

// The seeded mark's id, in the MINTED shape (messageId.js): the route now
// refuses any other shape before the limiter, so a fixture id must look like
// one the API could have issued.
const MESSAGE_ID = 'msg_1725000000000_0000c0de';

// Endpoint test for the abuse shape the review named: one valid session
// toggling a reaction in a loop. Every accepted call is a storage write, so
// the route must meet a ceiling — after validation (a malformed body spends
// nothing) and before the write (a refused call changes nothing).
describe('POST /api/guestbook/reactions — per-user budget', () => {
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guestbook-reactions-route-'));
    process.env.GUESTBOOK_JSON_PATH = join(dir, 'guestbook.json');
    const store = await import('@/lib/guestbook/store');
    await store.addMessage({
      id: MESSAGE_ID,
      author: { name: 'Owner', username: 'owner', avatar: null, key: 'github:1' },
      message: 'react to me',
      createdAt: new Date().toISOString(),
    });
  });

  it('serves the budget, then refuses with a 429 + Retry-After that writes nothing', async () => {
    const { POST } = await import('@/app/api/guestbook/reactions/route');
    const { REACTIONS_PER_MINUTE } = await import('@/lib/guestbook/ratelimit');
    const { getReactions } = await import('@/lib/guestbook/store');
    sessionUser = { key: 'github:2', username: 'alice', name: 'Alice' };

    let last;
    for (let i = 0; i < REACTIONS_PER_MINUTE; i++) {
      last = KEYS[i % KEYS.length];
      const res = await POST(post({ id: MESSAGE_ID, key: last }));
      expect(res.status).toBe(200);
      expect((await res.json()).viewerReaction).toBe(last);
    }

    const next = KEYS[(KEYS.indexOf(last) + 1) % KEYS.length];
    const denied = await POST(post({ id: MESSAGE_ID, key: next }));
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await denied.json()).error).toMatch(/too many reactions/i);

    // The refused toggle never reached the store: alice's reaction is still
    // the last one that was accepted — filed under her identity KEY, not her
    // login (identity.js).
    expect((await getReactions([MESSAGE_ID]))[MESSAGE_ID]).toEqual({ 'github:2': last });
  });

  it('another user is still served', async () => {
    const { POST } = await import('@/app/api/guestbook/reactions/route');
    sessionUser = { key: 'github:3', username: 'bob', name: 'Bob' };
    const res = await POST(post({ id: MESSAGE_ID, key: 'heart' }));
    expect(res.status).toBe(200);
  });

  it('malformed bodies are rejected before they touch the budget', async () => {
    const { POST } = await import('@/app/api/guestbook/reactions/route');
    const { REACTIONS_PER_MINUTE } = await import('@/lib/guestbook/ratelimit');
    sessionUser = { key: 'github:4', username: 'carol', name: 'Carol' };

    // A whole budget's worth of bad keys — every one a 400, none a spend…
    for (let i = 0; i < REACTIONS_PER_MINUTE; i++) {
      expect((await POST(post({ id: MESSAGE_ID, key: 'nope' }))).status).toBe(400);
    }
    // …so the first VALID reaction is still within budget.
    expect((await POST(post({ id: MESSAGE_ID, key: 'fire' }))).status).toBe(200);
  });

  // The id's SHAPE is part of validation (isMessageId, messageId.js): an id
  // the API could not have minted used to pass the body check, spend a unit
  // of the caller's budget in the limiter, and travel into the store as a
  // key before coming back 404. Now it is a 400 that touches neither.
  it('a malformed id is a 400 before the limiter or the store — a whole budget of them spends nothing', async () => {
    const { POST } = await import('@/app/api/guestbook/reactions/route');
    const { REACTIONS_PER_MINUTE } = await import('@/lib/guestbook/ratelimit');
    sessionUser = { key: 'github:5', username: 'erin', name: 'Erin' };

    const malformed = [
      'm1',
      'msg_1',
      'guestbook',
      'msg_1725000000000',
      'msg_1725000000000_XYZ12345',
      'msg_1725000000000_0000c0d',
      // Long but under the 1 KB body ceiling — the shape check's 400, not a 413.
      `msg_1725000000000_${'a'.repeat(500)}`,
      'msg_1725000000000_0000c0de/../x',
      42,
      null,
      undefined,
      { id: MESSAGE_ID },
    ];
    for (let i = 0; i < REACTIONS_PER_MINUTE; i++) {
      const id = malformed[i % malformed.length];
      const res = await POST(post({ id, key: 'fire' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid reaction');
    }
    // …so the first VALID reaction is still within budget.
    expect((await POST(post({ id: MESSAGE_ID, key: 'fire' }))).status).toBe(200);
    // A well-formed id that names nothing is still storage's 404, as before.
    expect((await POST(post({ id: 'msg_1725000000000_deadbeef', key: 'fire' }))).status).toBe(404);
    sessionUser = null;
  });

  // The body ceiling (body.js, REACTION_BODY_MAX_BYTES): this route also
  // parses before it meters, so an oversized body is a 413 before validation
  // — and before the limiter, so it spends nothing either.
  it('an oversized body is 413 before validation and spends no budget', async () => {
    const { POST, REACTION_BODY_MAX_BYTES } = await import('@/app/api/guestbook/reactions/route');
    const { REACTIONS_PER_MINUTE } = await import('@/lib/guestbook/ratelimit');
    sessionUser = { key: 'github:6', username: 'frank', name: 'Frank' };

    const oversized = { id: MESSAGE_ID, key: 'fire', pad: 'x'.repeat(REACTION_BODY_MAX_BYTES) };
    for (let i = 0; i < REACTIONS_PER_MINUTE; i++) {
      const res = await POST(post(oversized));
      expect(res.status).toBe(413);
      expect((await res.json()).error).toMatch(/at most 1024 bytes/);
    }
    expect((await POST(post({ id: MESSAGE_ID, key: 'fire' }))).status).toBe(200);
    sessionUser = null;
  });

  it('an anonymous caller is refused before identity could even be metered', async () => {
    const { POST } = await import('@/app/api/guestbook/reactions/route');
    sessionUser = null;
    expect((await POST(post({ id: MESSAGE_ID, key: 'fire' }))).status).toBe(401);
    // So is a session from before identity keys existed: a login is not an
    // identity the hash could be keyed by.
    sessionUser = { username: 'dave', name: 'Dave' };
    expect((await POST(post({ id: MESSAGE_ID, key: 'fire' }))).status).toBe(401);
    sessionUser = null;
  });
});
