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
// older than all of them, so it sits last in every walk. Authors carry the
// identity KEY (identity.js: provider account id) beside the display login —
// except the Google row, which is stored in the LEGACY shape (its sub as the
// username, no key) so the read-back of that form stays covered.
const WALL = 7;
const TOTAL = WALL + 1;
const GOOGLE_ID = 'google:110000000000000000001';
const base = Date.UTC(2026, 2, 1);
const seed = (i) => ({
  id: `msg_${i}`,
  author: {
    name: `Visitor ${i}`,
    username: `visitor${i}`,
    avatar: null,
    provider: 'github',
    key: `github:${i}`,
  },
  message: `mark ${i}`,
  createdAt: new Date(base + i * 60_000).toISOString(),
});
const googleSeed = {
  id: 'msg_google',
  author: { name: 'Gee', username: GOOGLE_ID, avatar: null, provider: 'google' },
  message: 'a mark from a Google account',
  createdAt: new Date(base).toISOString(),
};
const del = (id) =>
  new Request(`${ENDPOINT}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });

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
// the card told to hide it. Now no guestbook response carries it — nor any
// identity key, the viewer's own included — and ownership (what the client
// used the username for) is a per-viewer boolean.
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
    // The legacy Google row: its stored username IS the key, so the account
    // still owns it.
    sessionUser = { key: GOOGLE_ID, name: 'Gee', provider: 'google' };
    let { text, body } = await wholeWall();
    expect(body.messages.find((m) => m.id === 'msg_google').isOwn).toBe(true);
    expect(body.messages.filter((m) => m.isOwn)).toHaveLength(1);
    expect(text).not.toContain('google:');

    // By KEY, whatever the login reads now — a renamed author still owns
    // their mark, and the login is not consulted at all.
    sessionUser = {
      key: 'github:3',
      username: 'visitor3-renamed',
      name: 'Visitor 3',
      provider: 'github',
    };
    ({ text, body } = await wholeWall());
    expect(body.messages.find((m) => m.id === 'msg_3').isOwn).toBe(true);
    expect(body.messages.filter((m) => m.isOwn)).toHaveLength(1);
    // No key in a guestbook response — the viewer's own included. The only
    // place a key reaches a browser is its owner's session payload.
    expect(text).not.toContain('github:');
  });

  it('POST answers in the same public shape: isOwn true, no internal id', async () => {
    const { POST } = await import('@/app/api/guestbook/route');
    sessionUser = { key: GOOGLE_ID, name: 'Gee', image: null, provider: 'google' };
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
    // …while the STORED record keeps the key — and, for a Google author, no
    // username at all — which is what DELETE's ownership check compares the
    // session against.
    const { getMessage } = await import('@/lib/guestbook/store');
    const stored = await getMessage(body.id);
    expect(stored.author.key).toBe(GOOGLE_ID);
    expect(stored.author).not.toHaveProperty('username');
    sessionUser = null;
  });
});

// The review finding this pins down: a GitHub login is renameable, and a
// released login can be claimed by someone else. The wall keys authors by the
// provider account id (identity.js), so a rename moves the display handle and
// nothing else — ownership, the reaction field and the rate-limit slot stay
// with the account, and the old handle's new holder inherits none of them.
describe('POST / GET / DELETE /api/guestbook — identity is the account id, never the login', () => {
  const OWNER = {
    key: 'github:9001',
    username: 'before-rename',
    name: 'Ren',
    image: null,
    provider: 'github',
  };
  const RENAMED = { ...OWNER, username: 'after-rename' };
  // Someone who registered the released login on a different account.
  const CLAIMANT = {
    key: 'github:9002',
    username: 'before-rename',
    name: 'Claimant',
    image: null,
    provider: 'github',
  };
  let posted;

  it('stores the key beside the login, and ships only the login', async () => {
    const { POST } = await import('@/app/api/guestbook/route');
    sessionUser = OWNER;
    const res = await POST(post({ message: 'signed before the rename' }));
    expect(res.status).toBe(201);
    const text = await res.text();
    posted = JSON.parse(text);
    expect(posted.author).toEqual({
      name: 'Ren',
      avatar: null,
      provider: 'github',
      username: 'before-rename',
    });
    expect(text).not.toContain('github:9001');
    const { getMessage } = await import('@/lib/guestbook/store');
    const stored = await getMessage(posted.id);
    expect(stored.author.key).toBe('github:9001');
    expect(stored.author.username).toBe('before-rename');
  });

  it("the renamed author still owns it; the old login's new holder never does", async () => {
    const { GET, DELETE } = await import('@/app/api/guestbook/route');
    const isOwn = async () =>
      (await (await GET(get('?limit=50'))).json()).messages.find(
        (m) => m.id === posted.id,
      ).isOwn;

    sessionUser = RENAMED;
    expect(await isOwn()).toBe(true);

    sessionUser = CLAIMANT;
    expect(await isOwn()).toBe(false);
    expect((await DELETE(del(posted.id))).status).toBe(403);

    sessionUser = RENAMED;
    expect((await DELETE(del(posted.id))).status).toBe(200);
    sessionUser = null;
  });

  it('a session with no key (minted before keys existed) cannot write — it must sign in again', async () => {
    const { POST, DELETE } = await import('@/app/api/guestbook/route');
    sessionUser = { username: 'visitor1', name: 'Visitor 1', provider: 'github' };
    expect((await POST(post({ message: 'from a stale session' }))).status).toBe(401);
    expect((await DELETE(del('msg_1'))).status).toBe(401);
    sessionUser = null;
  });
});

// Every write answers with `count`, the wall's size just after it — the
// client's settlement reads that rather than guessing whether a page fetched
// in flight already included the change.
describe('POST / DELETE /api/guestbook — writes answer with the count after them', () => {
  it('DELETE answers { ok, count } with the size after the removal', async () => {
    const { POST, DELETE } = await import('@/app/api/guestbook/route');
    sessionUser = {
      key: 'github:1',
      username: 'visitor1',
      name: 'Visitor 1',
      image: null,
      provider: 'github',
    };
    const posted = await (await POST(post({ message: 'a mark to take back' }))).json();
    // The Google post above is still on the wall: TOTAL + 1 before this one.
    expect(posted.count).toBe(TOTAL + 2);

    const res = await DELETE(del(posted.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: TOTAL + 1 });
    sessionUser = null;
  });
});
