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

// The route reads identity through `@/auth` (Auth.js v5); the stub lets a
// test choose who is viewing (or nobody), without booting next-auth.
let sessionUser = null;
vi.mock('@/auth', () => ({
  auth: async () => (sessionUser ? { user: sessionUser } : null),
}));

const ENDPOINT = 'http://localhost/api/guestbook';
const get = (qs = '') => new Request(`${ENDPOINT}${qs}`);
const post = (body) =>
  new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// Seven GitHub-authored marks (newest = msg_7) plus one Google-authored mark
// older than all of them, so it sits last in every walk.
const WALL = 7;
const TOTAL = WALL + 1;
const GOOGLE_ID = 'google:110000000000000000001';
const base = Date.UTC(2026, 2, 1);
const seed = (i) => ({
  id: `msg_${i}`,
  author: { name: `Visitor ${i}`, username: `visitor${i}`, avatar: null },
  message: `mark ${i}`,
  createdAt: new Date(base + i * 60_000).toISOString(),
});
const googleSeed = {
  id: 'msg_google',
  author: { name: 'Gee', username: GOOGLE_ID, avatar: null, provider: 'google' },
  message: 'a mark from a Google account',
  createdAt: new Date(base).toISOString(),
};

// The wall's read contract (issue #40 follow-up): a GET is ONE bounded page
// plus a separately-counted total — never the whole wall — and a client that
// follows `nextCursor` sees every message exactly once, newest first.
describe('GET /api/guestbook — cursor pagination', () => {
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guestbook-route-'));
    process.env.GUESTBOOK_JSON_PATH = join(dir, 'guestbook.json');
    const store = await import('@/lib/guestbook/store');
    await store.addMessage(googleSeed);
    for (let i = 1; i <= WALL; i++) await store.addMessage(seed(i));
    await store.setReaction('msg_7', 'someone', 'fire');
  });

  it('serves one page, the total, and a cursor — enriched, private map stripped', async () => {
    const { GET } = await import('@/app/api/guestbook/route');
    const res = await GET(get('?limit=3'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(TOTAL);
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
    expect(seen).toEqual([
      ...[7, 6, 5, 4, 3, 2, 1].map((i) => `msg_${i}`),
      'msg_google',
    ]);
  });

  it('clamps limit to the ceiling and falls back to the default on garbage', async () => {
    const { GET } = await import('@/app/api/guestbook/route');
    const { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } = await import(
      '@/lib/guestbook/paging'
    );
    expect(MAX_PAGE_LIMIT).toBeLessThan(1000);
    const capped = await (await GET(get('?limit=1000'))).json();
    expect(capped.messages.length).toBe(Math.min(TOTAL, MAX_PAGE_LIMIT));
    const fallback = await (await GET(get('?limit=abc'))).json();
    expect(fallback.messages.length).toBe(Math.min(TOTAL, DEFAULT_PAGE_LIMIT));
  });

  it('refuses a malformed cursor', async () => {
    const { GET } = await import('@/app/api/guestbook/route');
    const res = await GET(get('?cursor=definitely-not-a-cursor'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cursor/i);
  });

  // Cursors are validated for SHAPE, not authenticated (cursor.js header):
  // a cursor is an unsigned position into public data, so a hand-built one
  // is served exactly as a minted one — and the minted one IS the hand-built
  // bytes, which is what makes the contract honest to state.
  it('serves a hand-built cursor exactly as a minted one — a position, not a capability', async () => {
    const { GET } = await import('@/app/api/guestbook/route');
    const cursorFor = (t, id) => Buffer.from(`${t}:${id}`, 'utf8').toString('base64url');

    // The position of msg_4, built by hand from the seed's own timestamp…
    const handBuilt = cursorFor(base + 4 * 60_000, 'msg_4');
    // …is byte-for-byte the cursor the server mints after a page ending there.
    const minted = (await (await GET(get('?limit=4'))).json()).nextCursor;
    expect(minted).toBe(handBuilt);

    const res = await GET(get(`?limit=3&cursor=${encodeURIComponent(handBuilt)}`));
    expect(res.status).toBe(200);
    expect((await res.json()).messages.map((m) => m.id)).toEqual(['msg_3', 'msg_2', 'msg_1']);

    // A position no message occupies pages from where it would sit.
    const between = cursorFor(base + 4 * 60_000 + 30_000, 'nothing-here');
    const gap = await (await GET(get(`?limit=3&cursor=${encodeURIComponent(between)}`))).json();
    expect(gap.messages.map((m) => m.id)).toEqual(['msg_4', 'msg_3', 'msg_2']);
  });
});

// The public author shape. A Google author's stored username is
// `google:<sub>` — a stable Google account identifier, internal by design —
// and it used to ride out of this public GET on every such message, with only
// the card told to hide it. Now it never leaves the server, and ownership
// (what the client used the username for) is a per-viewer boolean.
describe('GET / POST /api/guestbook — Google identities stay internal', () => {
  const wholeWall = async () => {
    const { GET } = await import('@/app/api/guestbook/route');
    const res = await GET(get('?limit=50'));
    const text = await res.text();
    return { text, body: JSON.parse(text) };
  };

  it("never sends a Google author's internal id; GitHub logins stay public", async () => {
    sessionUser = null;
    const { text, body } = await wholeWall();
    const google = body.messages.find((m) => m.id === 'msg_google');
    expect(google.author).toEqual({ name: 'Gee', avatar: null, provider: 'google' });
    expect(google.author).not.toHaveProperty('username');
    expect(text).not.toContain('google:');
    // The GitHub author is unchanged: the card links its handle.
    const github = body.messages.find((m) => m.id === 'msg_3');
    expect(github.author.username).toBe('visitor3');
    // Anonymous viewer: nothing is theirs.
    expect(body.messages.every((m) => m.isOwn === false)).toBe(true);
  });

  it('isOwn is decided per viewer, server-side, and still carries no id', async () => {
    sessionUser = { username: GOOGLE_ID, name: 'Gee', provider: 'google' };
    let { text, body } = await wholeWall();
    expect(body.messages.find((m) => m.id === 'msg_google').isOwn).toBe(true);
    expect(body.messages.filter((m) => m.isOwn)).toHaveLength(1);
    expect(text).not.toContain('google:');

    // Case-insensitive for GitHub logins, as DELETE is.
    sessionUser = { username: 'VISITOR3', name: 'Visitor 3', provider: 'github' };
    ({ body } = await wholeWall());
    expect(body.messages.find((m) => m.id === 'msg_3').isOwn).toBe(true);
    expect(body.messages.filter((m) => m.isOwn)).toHaveLength(1);
  });

  it('POST answers in the same public shape: isOwn true, no internal id', async () => {
    const { POST } = await import('@/app/api/guestbook/route');
    sessionUser = { username: GOOGLE_ID, name: 'Gee', image: null, provider: 'google' };
    const res = await POST(post({ message: 'posted from a Google account' }));
    expect(res.status).toBe(201);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.isOwn).toBe(true);
    expect(body.author).toEqual({ name: 'Gee', avatar: null, provider: 'google' });
    expect(text).not.toContain('google:');
    // …plus the wall's size just after the store, for the client to settle
    // its total from.
    expect(body.count).toBe(TOTAL + 1);
    // …while the STORED record keeps the id, which is what DELETE's ownership
    // check compares the session against.
    const { getMessage } = await import('@/lib/guestbook/store');
    expect((await getMessage(body.id)).author.username).toBe(GOOGLE_ID);
    sessionUser = null;
  });
});

// Every write answers with `count`, the wall's size just after it — the
// client's settlement reads that rather than guessing whether a page fetched
// in flight already included the change.
describe('POST / DELETE /api/guestbook — writes answer with the count after them', () => {
  it('DELETE answers { ok, count } with the size after the removal', async () => {
    const { POST, DELETE } = await import('@/app/api/guestbook/route');
    sessionUser = { username: 'visitor1', name: 'Visitor 1', image: null, provider: 'github' };
    const posted = await (await POST(post({ message: 'a mark to take back' }))).json();
    // The Google post above is still on the wall: TOTAL + 1 before this one.
    expect(posted.count).toBe(TOTAL + 2);

    const res = await DELETE(
      new Request(`${ENDPOINT}?id=${encodeURIComponent(posted.id)}`, { method: 'DELETE' }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: TOTAL + 1 });
    sessionUser = null;
  });
});
