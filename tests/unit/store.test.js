import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

// Same env discipline as ratelimit.test.js — pin the json driver before any
// module under test loads.
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.GUESTBOOK_DRIVER = 'json';

const sample = (id, username = 'alice') => ({
  id,
  author: { name: username, username, avatar: null },
  message: `message ${id}`,
  createdAt: new Date().toISOString(),
});

// The DRIVER CONTRACT suite (issue #40 Phase 6): every storage driver must
// pass exactly these behaviours. It runs here against jsonDriver (pointed at
// a temp dir); redisDriver implements the same contract against Upstash and
// is exercised by the deployed API rather than a mocked Redis — the contract
// itself is what this file pins down.
function driverContract(getDriver) {
  it('starts empty and round-trips a message', async () => {
    const driver = getDriver();
    expect(await driver.getMessages()).toEqual([]);
    const m = sample('m1');
    await driver.addMessage(m);
    expect(await driver.getMessages()).toEqual([m]);
  });

  it('deleteMessage reports whether anything was removed', async () => {
    const driver = getDriver();
    await driver.addMessage(sample('m1'));
    expect(await driver.deleteMessage('m1')).toBe(true);
    expect(await driver.deleteMessage('m1')).toBe(false);
    expect(await driver.getMessages()).toEqual([]);
  });

  it('reactions: set, move, clear — one value per user', async () => {
    const driver = getDriver();
    await driver.addMessage(sample('m1'));

    expect(await driver.setReaction('m1', 'bob', 'fire')).toEqual({
      bob: 'fire',
    });
    // A second reaction MOVES the user's choice, never adds a second one.
    expect(await driver.setReaction('m1', 'bob', 'heart')).toEqual({
      bob: 'heart',
    });
    expect(await driver.setReaction('m1', 'carol', 'fire')).toEqual({
      bob: 'heart',
      carol: 'fire',
    });
    expect(await driver.setReaction('m1', 'bob', null)).toEqual({
      carol: 'fire',
    });
    expect(await driver.getReactions(['m1'])).toEqual({
      m1: { carol: 'fire' },
    });
  });

  it('setReaction on a missing message returns null', async () => {
    const driver = getDriver();
    expect(await driver.setReaction('ghost', 'bob', 'fire')).toBe(null);
  });
}

describe('jsonDriver fulfils the driver contract', () => {
  let driver;

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guestbook-store-'));
    process.env.GUESTBOOK_JSON_PATH = join(dir, 'guestbook.json');
    ({ jsonDriver: driver } = await import('@/lib/guestbook/jsonDriver'));
  });

  driverContract(() => driver);
});

describe('store facade', () => {
  it('routes through the json driver when GUESTBOOK_DRIVER=json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guestbook-facade-'));
    process.env.GUESTBOOK_JSON_PATH = join(dir, 'guestbook.json');
    const store = await import('@/lib/guestbook/store');
    const m = sample('facade-1');
    await store.addMessage(m);
    expect(await store.getMessages()).toEqual([m]);
    expect(await store.deleteMessage('facade-1')).toBe(true);
  });
});
