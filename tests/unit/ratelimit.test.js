import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Force the json/dev path BEFORE the modules under test are imported: the
// redis client and driver selection are resolved at module load, and a
// developer's shell exporting KV_* must not flip these tests onto a live
// Redis.
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.GUESTBOOK_DRIVER = 'json';

const NOW = new Date('2026-08-23T12:00:00.000Z').getTime();
// Rows carry the identity KEY the limiter compares (identity.js). The limiter
// treats keys as opaque strings — real ones read github:<id> / google:<sub> —
// so the cases below use short names as keys; the login beside each is a
// decoy that must never match anything.
const msg = (userKey, msAgo, id = `${userKey}-${msAgo}`) => ({
  id,
  author: { name: userKey, username: 'a-login-not-the-key', avatar: null, key: userKey },
  message: 'hello there',
  createdAt: new Date(NOW - msAgo).toISOString(),
});
const at = (msAgo) => new Date(NOW - msAgo).toISOString();

describe('latestPostTime', () => {
  it('finds the newest post for the user, ignoring others', async () => {
    const { latestPostTime } = await import('@/lib/guestbook/ratelimit');
    const messages = [
      msg('alice', 10 * 60 * 1000),
      msg('alice', 2 * 60 * 1000),
      msg('bob', 1000),
    ];
    expect(latestPostTime(messages, 'alice')).toBe(NOW - 2 * 60 * 1000);
    expect(latestPostTime(messages, 'carol')).toBe(null);
  });

  it('compares the identity key, never the login — and reads a legacy Google row by its username', async () => {
    const { latestPostTime } = await import('@/lib/guestbook/ratelimit');
    const messages = [
      { id: 'r1', author: { name: 'A', username: 'alice', key: 'github:1', avatar: null }, createdAt: at(1000) },
      // Before keys existed a Google author's sub was stored AS the username.
      { id: 'r2', author: { name: 'G', username: 'google:42', avatar: null }, createdAt: at(2000) },
      // …and a GitHub author's login was. That row keys nothing now.
      { id: 'r3', author: { name: 'L', username: 'legacy-login', avatar: null }, createdAt: at(3000) },
    ];
    expect(latestPostTime(messages, 'github:1')).toBe(NOW - 1000);
    expect(latestPostTime(messages, 'alice')).toBe(null);
    expect(latestPostTime(messages, 'google:42')).toBe(NOW - 2000);
    expect(latestPostTime(messages, 'legacy-login')).toBe(null);
  });

  it('survives malformed rows', async () => {
    const { latestPostTime } = await import('@/lib/guestbook/ratelimit');
    const messages = [{}, { author: {} }, msg('alice', 5000)];
    expect(latestPostTime(messages, 'alice')).toBe(NOW - 5000);
  });
});

// An ADMITTED check reserves the slot in module memory (mirroring the Redis
// limiter, which consumes a token at check time), so each case below uses its
// own key — a user admitted in one case is, correctly, inside the window for
// the next.
describe('checkRateLimit (json driver path)', () => {
  let dataPath;

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guestbook-rl-'));
    dataPath = join(dir, 'guestbook.json');
    process.env.GUESTBOOK_JSON_PATH = dataPath;
  });

  it('allows a first-time poster', async () => {
    await writeFile(dataPath, JSON.stringify([msg('bob', 1000)]));
    const { checkRateLimit } = await import('@/lib/guestbook/ratelimit');
    expect((await checkRateLimit('alice', NOW)).ok).toBe(true);
  });

  it('blocks inside the 5-minute window, with an honest retry time', async () => {
    await writeFile(dataPath, JSON.stringify([msg('bella', 2 * 60 * 1000)]));
    const { checkRateLimit } = await import('@/lib/guestbook/ratelimit');
    const r = await checkRateLimit('bella', NOW);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSeconds).toBe(3 * 60);
  });

  it('allows again once the window has passed', async () => {
    await writeFile(
      dataPath,
      JSON.stringify([msg('carla', 5 * 60 * 1000 + 1000)]),
    );
    const { checkRateLimit } = await import('@/lib/guestbook/ratelimit');
    expect((await checkRateLimit('carla', NOW)).ok).toBe(true);
  });

  it('admits exactly ONE of two concurrent posts by the same user', async () => {
    // The race: both requests read the file before either writes a message.
    // The reservation made in the same synchronous section as the check is
    // what the second request must see.
    await writeFile(dataPath, JSON.stringify([]));
    const { checkRateLimit, RATE_LIMIT_WINDOW_MS } = await import(
      '@/lib/guestbook/ratelimit'
    );
    const results = await Promise.all([
      checkRateLimit('dave', NOW),
      checkRateLimit('dave', NOW),
      checkRateLimit('dave', NOW),
    ]);
    const admitted = results.filter((r) => r.ok);
    const refused = results.filter((r) => !r.ok);
    expect(admitted).toHaveLength(1);
    expect(refused).toHaveLength(2);
    for (const r of refused) {
      expect(r.retryAfterSeconds).toBe(RATE_LIMIT_WINDOW_MS / 1000);
    }
  });

  it('a reservation ages out with the window', async () => {
    // Self-contained: its own user, admitted here, with no stored post — so
    // the only thing holding the slot is the reservation itself.
    await writeFile(dataPath, JSON.stringify([]));
    const { checkRateLimit, RATE_LIMIT_WINDOW_MS } = await import(
      '@/lib/guestbook/ratelimit'
    );
    expect((await checkRateLimit('fred', NOW)).ok).toBe(true);
    expect((await checkRateLimit('fred', NOW + RATE_LIMIT_WINDOW_MS - 1000)).ok).toBe(false);
    expect((await checkRateLimit('fred', NOW + RATE_LIMIT_WINDOW_MS)).ok).toBe(true);
  });

  it('a reservation never hides a NEWER stored post', async () => {
    const { checkRateLimit } = await import('@/lib/guestbook/ratelimit');
    // Admitted long ago…
    expect((await checkRateLimit('erin', NOW - 400 * 1000)).ok).toBe(true);
    // …then a message of hers lands 60s before NOW: the stored post governs.
    await writeFile(dataPath, JSON.stringify([msg('erin', 60 * 1000)]));
    const r = await checkRateLimit('erin', NOW);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSeconds).toBe(4 * 60);
  });
});

// The in-memory path is what these exercise; the redis path is the same
// @upstash/ratelimit sliding window the posting limit already uses. The window
// state is module-scoped, so every case uses its own address and builds the
// state it needs — each runs correctly when selected alone.
describe('checkPresenceRateLimit (in-memory path)', () => {
  // Spend the whole budget for `ip`, one beat per second from NOW.
  const fillBudget = async (checkPresenceRateLimit, budget, ip) => {
    for (let i = 0; i < budget; i++) {
      expect((await checkPresenceRateLimit(ip, NOW + i * 1000)).ok).toBe(true);
    }
  };

  it('allows the per-minute budget, then refuses with an honest retry time', async () => {
    const { checkPresenceRateLimit, PRESENCE_BEATS_PER_MINUTE } =
      await import('@/lib/guestbook/ratelimit');
    const ip = '203.0.113.10';
    await fillBudget(checkPresenceRateLimit, PRESENCE_BEATS_PER_MINUTE, ip);
    // One over budget, 30s after the first beat: the oldest frees at +60s.
    const denied = await checkPresenceRateLimit(ip, NOW + 30 * 1000);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSeconds).toBe(30);
  });

  it('keys per client — another address is unaffected by a spent one', async () => {
    const { checkPresenceRateLimit, PRESENCE_BEATS_PER_MINUTE } =
      await import('@/lib/guestbook/ratelimit');
    await fillBudget(checkPresenceRateLimit, PRESENCE_BEATS_PER_MINUTE, '203.0.113.11');
    expect((await checkPresenceRateLimit('203.0.113.11', NOW + 30 * 1000)).ok).toBe(false);
    expect((await checkPresenceRateLimit('203.0.113.12', NOW + 30 * 1000)).ok).toBe(true);
  });

  it('slides: once the oldest beat ages out, exactly one more is allowed', async () => {
    const { checkPresenceRateLimit, PRESENCE_BEATS_PER_MINUTE } =
      await import('@/lib/guestbook/ratelimit');
    const ip = '203.0.113.13';
    await fillBudget(checkPresenceRateLimit, PRESENCE_BEATS_PER_MINUTE, ip);
    // The first beat (at NOW) is outside the window at NOW+60s — one slot.
    expect((await checkPresenceRateLimit(ip, NOW + 60 * 1000)).ok).toBe(true);
    expect((await checkPresenceRateLimit(ip, NOW + 60 * 1000)).ok).toBe(false);
  });

  it('never stores the raw address — the key is a stable, distinct hash', async () => {
    const { presenceLimitKey } = await import('@/lib/guestbook/ratelimit');
    const ip = '203.0.113.10';
    const key = presenceLimitKey(ip);
    expect(key).not.toContain(ip);
    expect(key).toHaveLength(22);
    expect(presenceLimitKey(ip)).toBe(key);
    expect(presenceLimitKey('203.0.113.11')).not.toBe(key);
  });
});

// The reaction budget's in-memory path — the same helper as presence, keyed
// by the session's identity key rather than an address hash. As above, the
// window state is module-scoped, so every case uses its own user.
describe('checkReactionRateLimit (in-memory path)', () => {
  const fillBudget = async (check, budget, user) => {
    for (let i = 0; i < budget; i++) {
      expect((await check(user, NOW + i * 1000)).ok).toBe(true);
    }
  };

  it('allows the per-minute budget, then refuses with an honest retry time', async () => {
    const { checkReactionRateLimit, REACTIONS_PER_MINUTE } = await import(
      '@/lib/guestbook/ratelimit'
    );
    await fillBudget(checkReactionRateLimit, REACTIONS_PER_MINUTE, 'toggler');
    // One over budget, 30s after the first reaction: the oldest frees at +60s.
    const denied = await checkReactionRateLimit('toggler', NOW + 30 * 1000);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSeconds).toBe(30);
  });

  it('keys per user — another session is unaffected by a spent one', async () => {
    const { checkReactionRateLimit, REACTIONS_PER_MINUTE } = await import(
      '@/lib/guestbook/ratelimit'
    );
    await fillBudget(checkReactionRateLimit, REACTIONS_PER_MINUTE, 'spent');
    expect((await checkReactionRateLimit('spent', NOW + 30 * 1000)).ok).toBe(false);
    expect((await checkReactionRateLimit('fresh', NOW + 30 * 1000)).ok).toBe(true);
  });

  it('slides: once the oldest reaction ages out, exactly one more is allowed', async () => {
    const { checkReactionRateLimit, REACTIONS_PER_MINUTE } = await import(
      '@/lib/guestbook/ratelimit'
    );
    await fillBudget(checkReactionRateLimit, REACTIONS_PER_MINUTE, 'slider');
    expect((await checkReactionRateLimit('slider', NOW + 60 * 1000)).ok).toBe(true);
    expect((await checkReactionRateLimit('slider', NOW + 60 * 1000)).ok).toBe(false);
  });
});
