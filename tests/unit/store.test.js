import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  // The paged read path (the wall's GET): bounded pages in the shared
  // newest-first order, a position to continue from, and the total counted
  // on its own — so a route never has to load the wall to size it.
  it('listMessages pages newest-first from a position; countMessages sizes the wall', async () => {
    const driver = getDriver();
    const base = Date.UTC(2026, 0, 1);
    for (let i = 1; i <= 5; i++) {
      await driver.addMessage({
        ...sample(`m${i}`),
        createdAt: new Date(base + i * 60_000).toISOString(),
      });
    }
    expect(await driver.countMessages()).toBe(5);

    const p1 = await driver.listMessages({ limit: 2 });
    expect(p1.messages.map((m) => m.id)).toEqual(['m5', 'm4']);
    expect(p1.next).toEqual({ t: base + 4 * 60_000, id: 'm4' });

    const p2 = await driver.listMessages({ limit: 2, after: p1.next });
    expect(p2.messages.map((m) => m.id)).toEqual(['m3', 'm2']);

    const p3 = await driver.listMessages({ limit: 2, after: p2.next });
    expect(p3.messages.map((m) => m.id)).toEqual(['m1']);
    expect(p3.next).toBe(null);

    // A page that ends exactly on the oldest message also reports the end,
    // and an empty wall is an empty page with no cursor.
    const exact = await driver.listMessages({ limit: 5 });
    expect(exact.messages).toHaveLength(5);
    expect(exact.next).toBe(null);
    for (let i = 1; i <= 5; i++) await driver.deleteMessage(`m${i}`);
    expect(await driver.listMessages({ limit: 2 })).toEqual({
      messages: [],
      next: null,
    });
    expect(await driver.countMessages()).toBe(0);
  });

  it('listMessages breaks same-instant ties by id, descending, losing none across a page edge', async () => {
    const driver = getDriver();
    const same = new Date(Date.UTC(2026, 0, 2)).toISOString();
    for (const id of ['tie_a', 'tie_b', 'tie_c']) {
      await driver.addMessage({ ...sample(id), createdAt: same });
    }
    const p1 = await driver.listMessages({ limit: 2 });
    expect(p1.messages.map((m) => m.id)).toEqual(['tie_c', 'tie_b']);
    const p2 = await driver.listMessages({ limit: 2, after: p1.next });
    expect(p2.messages.map((m) => m.id)).toEqual(['tie_a']);
    expect(p2.next).toBe(null);
  });

  it('getMessage returns the stored message or null', async () => {
    const driver = getDriver();
    const m = sample('m1');
    await driver.addMessage(m);
    expect(await driver.getMessage('m1')).toEqual(m);
    expect(await driver.getMessage('ghost')).toBe(null);
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
    expect(await store.listMessages({ limit: 8 })).toEqual({
      messages: [m],
      next: null,
    });
    expect(await store.countMessages()).toBe(1);
    expect(await store.getMessage('facade-1')).toEqual(m);
    expect(await store.deleteMessage('facade-1')).toBe(true);
  });
});

// The json driver's two single-process invariants: mutations are serialised
// (no lost update) and writes land by atomic rename (no torn file, no debris).
describe('jsonDriver — serialised mutations, atomic writes', () => {
  let dir;
  let dataPath;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'guestbook-json-race-'));
    dataPath = join(dir, 'guestbook.json');
    process.env.GUESTBOOK_JSON_PATH = dataPath;
  });

  it('keeps every one of N concurrent posts — no lost update', async () => {
    const { jsonDriver } = await import('@/lib/guestbook/jsonDriver');
    const N = 40;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        jsonDriver.addMessage(sample(`c${i}`, `user${i}`)),
      ),
    );
    const stored = await jsonDriver.getMessages();
    expect(stored).toHaveLength(N);
    expect(new Set(stored.map((m) => m.id)).size).toBe(N);
  });

  it('interleaved add / react / delete land in one consistent end state', async () => {
    const { jsonDriver } = await import('@/lib/guestbook/jsonDriver');
    await jsonDriver.addMessage(sample('keep'));
    await jsonDriver.addMessage(sample('gone'));
    const results = await Promise.all([
      jsonDriver.addMessage(sample('late')),
      jsonDriver.setReaction('keep', 'bob', 'fire'),
      jsonDriver.deleteMessage('gone'),
      jsonDriver.setReaction('keep', 'carol', 'heart'),
      jsonDriver.addMessage(sample('later')),
    ]);
    expect(results[2]).toBe(true); // the delete found its target
    const stored = await jsonDriver.getMessages();
    expect(stored.map((m) => m.id).sort()).toEqual(['keep', 'late', 'later']);
    expect(await jsonDriver.getReactions(['keep'])).toEqual({
      keep: { bob: 'fire', carol: 'heart' },
    });
  });

  it('writes by temp-file rename and leaves no temp files behind', async () => {
    const { jsonDriver } = await import('@/lib/guestbook/jsonDriver');
    await Promise.all([
      jsonDriver.addMessage(sample('a1')),
      jsonDriver.addMessage(sample('a2')),
      jsonDriver.addMessage(sample('a3')),
    ]);
    expect(await readdir(dir)).toEqual(['guestbook.json']);
    expect(JSON.parse(await readFile(dataPath, 'utf8'))).toHaveLength(3);
  });

  it('a failed mutation rejects its caller but does not wedge the queue', async () => {
    const { jsonDriver } = await import('@/lib/guestbook/jsonDriver');
    // Point the store under a FILE, so the directory cannot be created.
    const blocker = join(dir, 'blocker');
    await writeFile(blocker, 'not a directory');
    process.env.GUESTBOOK_JSON_PATH = join(blocker, 'guestbook.json');
    await expect(jsonDriver.addMessage(sample('doomed'))).rejects.toThrow();

    process.env.GUESTBOOK_JSON_PATH = dataPath;
    await jsonDriver.addMessage(sample('after'));
    expect((await jsonDriver.getMessages()).map((m) => m.id)).toEqual(['after']);
    // The failed attempt left nothing behind either.
    expect(await readdir(dir)).toEqual(['blocker', 'guestbook.json']);
  });
});

// The read guard: only a MISSING file is an empty wall. Every mutation is
// read-modify-write, so a read that swallowed an I/O error or a parse error
// into `[]` used to hand the next write a wall of one record — the existing
// file overwritten, silently. Each failing case below also checks the file on
// disk afterwards: exactly as it was, no temp debris.
describe('jsonDriver — an unreadable or malformed data file is never an empty wall', () => {
  let dir;
  let dataPath;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'guestbook-json-guard-'));
    dataPath = join(dir, 'guestbook.json');
    process.env.GUESTBOOK_JSON_PATH = dataPath;
  });

  it('a missing file is an empty wall — the first run, before any write', async () => {
    const { jsonDriver } = await import('@/lib/guestbook/jsonDriver');
    expect(await jsonDriver.getMessages()).toEqual([]);
    expect(await jsonDriver.countMessages()).toBe(0);
    expect(await jsonDriver.listMessages({ limit: 8 })).toEqual({
      messages: [],
      next: null,
    });
  });

  it('an empty file is an empty wall too — it holds nothing a write could lose', async () => {
    const { jsonDriver } = await import('@/lib/guestbook/jsonDriver');
    await writeFile(dataPath, '\n');
    expect(await jsonDriver.getMessages()).toEqual([]);
    await jsonDriver.addMessage(sample('first'));
    expect(JSON.parse(await readFile(dataPath, 'utf8'))).toHaveLength(1);
  });

  it('malformed JSON fails every read, and a mutation refuses to overwrite it', async () => {
    const { jsonDriver } = await import('@/lib/guestbook/jsonDriver');
    const corrupt = '[{"id":"m1","message":"half-written';
    await writeFile(dataPath, corrupt);
    await expect(jsonDriver.getMessages()).rejects.toThrow(/not valid JSON/);
    await expect(jsonDriver.listMessages({ limit: 8 })).rejects.toThrow(
      /not valid JSON/,
    );
    await expect(jsonDriver.getMessage('m1')).rejects.toThrow(/not valid JSON/);
    await expect(jsonDriver.addMessage(sample('m2'))).rejects.toThrow(
      /not valid JSON/,
    );
    await expect(jsonDriver.setReaction('m1', 'bob', 'fire')).rejects.toThrow(
      /not valid JSON/,
    );
    await expect(jsonDriver.deleteMessage('m1')).rejects.toThrow(
      /not valid JSON/,
    );
    // Nothing was written back, and no temp file was even started.
    expect(await readFile(dataPath, 'utf8')).toBe(corrupt);
    expect(await readdir(dir)).toEqual(['guestbook.json']);
  });

  it('valid JSON that is not an array of messages is refused the same way', async () => {
    const { jsonDriver } = await import('@/lib/guestbook/jsonDriver');
    const foreign = '{"messages":[{"id":"m1"}]}\n';
    await writeFile(dataPath, foreign);
    await expect(jsonDriver.getMessages()).rejects.toThrow(
      /JSON array of messages/,
    );
    await expect(jsonDriver.addMessage(sample('m2'))).rejects.toThrow(
      /JSON array of messages/,
    );
    expect(await readFile(dataPath, 'utf8')).toBe(foreign);
    expect(await readdir(dir)).toEqual(['guestbook.json']);
  });

  it('an I/O error other than "missing" propagates with its own code', async () => {
    const { jsonDriver } = await import('@/lib/guestbook/jsonDriver');
    // The data path IS a directory — it exists, and cannot be read as a file.
    process.env.GUESTBOOK_JSON_PATH = dir;
    await expect(jsonDriver.getMessages()).rejects.toMatchObject({
      code: 'EISDIR',
    });
    await expect(jsonDriver.addMessage(sample('m1'))).rejects.toMatchObject({
      code: 'EISDIR',
    });
    // …and the queue is not wedged: the next mutation on a good path lands.
    process.env.GUESTBOOK_JSON_PATH = dataPath;
    await jsonDriver.addMessage(sample('after'));
    expect((await jsonDriver.getMessages()).map((m) => m.id)).toEqual(['after']);
  });
});

// Runs LAST: these flip the driver env, NODE_ENV and NEXT_PHASE and reset the
// module registry, which the suites above must not observe. The KV_*/UPSTASH_*
// names are deleted at the top of this file, so the redis client is null
// throughout.
describe('store facade — refusals to load, and the served-production guard', () => {
  const env = { NODE_ENV: process.env.NODE_ENV, NEXT_PHASE: process.env.NEXT_PHASE };

  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.GUESTBOOK_DRIVER = 'json';
    process.env.NODE_ENV = env.NODE_ENV;
    if (env.NEXT_PHASE === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = env.NEXT_PHASE;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('GUESTBOOK_DRIVER=redis without credentials: an error naming the variables, not a null client', async () => {
    // Forcing the driver anyway used to hand that null client to the routes,
    // to explode on the first zrange.
    process.env.GUESTBOOK_DRIVER = 'redis';
    await expect(import('@/lib/guestbook/store')).rejects.toThrow(
      /GUESTBOOK_DRIVER=redis .*KV_REST_API_URL.*UPSTASH_REDIS_REST_URL/,
    );
  });

  it('a served production with no Redis and no explicit driver refuses to load', async () => {
    // This used to fall through to the json driver with a console warning —
    // on Vercel, a store that accepts posts and loses them on the next cold
    // start. The error names the credentials and the one deliberate way onto
    // the file store.
    delete process.env.GUESTBOOK_DRIVER;
    delete process.env.NEXT_PHASE;
    process.env.NODE_ENV = 'production';
    await expect(import('@/lib/guestbook/store')).rejects.toThrow(
      /without Redis credentials.*KV_REST_API_URL.*UPSTASH_REDIS_REST_URL.*GUESTBOOK_DRIVER=json/s,
    );
  });

  it('an EXPLICIT GUESTBOOK_DRIVER=json still serves in production — the e2e path — with the warning', async () => {
    process.env.GUESTBOOK_DRIVER = 'json';
    delete process.env.NEXT_PHASE;
    process.env.NODE_ENV = 'production';
    const dir = await mkdtemp(join(tmpdir(), 'guestbook-prod-json-'));
    process.env.GUESTBOOK_JSON_PATH = join(dir, 'guestbook.json');
    const store = await import('@/lib/guestbook/store');
    expect(await store.countMessages()).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/json storage driver active under NODE_ENV=production/),
    );
  });

  it('the build phase evaluates the module without serving: no throw, no warning', async () => {
    // `next build` loads route modules under NODE_ENV=production too, in a
    // credential-free CI job — nothing is served there, so the guard must
    // stand down (Next marks the phase in NEXT_PHASE).
    delete process.env.GUESTBOOK_DRIVER;
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PHASE = 'phase-production-build';
    await expect(import('@/lib/guestbook/store')).resolves.toBeDefined();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('development with no Redis and no explicit driver is the json driver, quietly', async () => {
    delete process.env.GUESTBOOK_DRIVER;
    delete process.env.NEXT_PHASE;
    process.env.NODE_ENV = 'development';
    const dir = await mkdtemp(join(tmpdir(), 'guestbook-dev-auto-'));
    process.env.GUESTBOOK_JSON_PATH = join(dir, 'guestbook.json');
    const store = await import('@/lib/guestbook/store');
    expect(await store.countMessages()).toBe(0);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
