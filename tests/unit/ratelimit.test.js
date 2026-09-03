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
const msg = (username, msAgo, id = `${username}-${msAgo}`) => ({
  id,
  author: { name: username, username, avatar: null },
  message: 'hello there',
  createdAt: new Date(NOW - msAgo).toISOString(),
});

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

  it('survives malformed rows', async () => {
    const { latestPostTime } = await import('@/lib/guestbook/ratelimit');
    const messages = [{}, { author: {} }, msg('alice', 5000)];
    expect(latestPostTime(messages, 'alice')).toBe(NOW - 5000);
  });
});

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
    await writeFile(dataPath, JSON.stringify([msg('alice', 2 * 60 * 1000)]));
    const { checkRateLimit } = await import('@/lib/guestbook/ratelimit');
    const r = await checkRateLimit('alice', NOW);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSeconds).toBe(3 * 60);
  });

  it('allows again once the window has passed', async () => {
    await writeFile(
      dataPath,
      JSON.stringify([msg('alice', 5 * 60 * 1000 + 1000)]),
    );
    const { checkRateLimit } = await import('@/lib/guestbook/ratelimit');
    expect((await checkRateLimit('alice', NOW)).ok).toBe(true);
  });
});
