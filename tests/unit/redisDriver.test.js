import { beforeEach, describe, expect, it, vi } from 'vitest';

// The redis driver's write plumbing, against a recording stand-in for
// @upstash/redis. There is no Redis here — the contract suite (store.test.js)
// proves the behaviour on the json driver and the deployed API exercises this
// one — so what THIS file pins is the shape of the commands the driver sends:
//   · setReaction is ONE script call (existence check, write and read-back
//     atomic on the server), never a separate EXISTS / HSET / HGETALL;
//   · it runs on a client with automatic deserialisation OFF, and builds the
//     map from the flat reply with string keys — a numeric-looking login
//     stays the login;
//   · deleteMessage is ONE MULTI/EXEC of ZREM + DEL(message, reactions);
//   · addMessage is ONE MULTI/EXEC of SET + ZADD;
//   · listMessages pages by score-bounded index walks and, when a delete
//     lands between the index read and the row fetch, scans on through the
//     index instead of reporting a false end of the wall.
// These values are placeholders so the driver believes Redis is configured —
// nothing is contacted.
process.env.KV_REST_API_URL = 'https://unit-test.invalid';
process.env.KV_REST_API_TOKEN = 'not-a-real-token';
process.env.GUESTBOOK_DRIVER = 'redis';

const state = {
  clients: [],
  scripts: [],
  transactions: [],
  zrangeCalls: [],
  scriptReply: null,
  txReply: () => [],
};

// A tiny ZSET + row store behind the paging fakes (zrange / mget), so
// listMessages runs against the shapes the real client returns — including
// WITHSCORES' flat [member, score, member, score, …] reply. Index and rows
// are SEPARATE on purpose: an id present in the index with no row is exactly
// what a delete landing between the index read and the MGET looks like.
const index = { members: [], rows: new Map() };
const rowKey = (id) => `guestbook:msg:${id}`;

function setIndex(members, { missing = [] } = {}) {
  index.members = members;
  index.rows.clear();
  for (const m of members) {
    if (missing.includes(m.id)) continue;
    index.rows.set(rowKey(m.id), {
      id: m.id,
      message: `mark ${m.id}`,
      createdAt: new Date(m.score).toISOString(),
    });
  }
}

// REV order: score desc, then member desc — the order paging.js defines.
const byNewest = (a, b) =>
  b.score - a.score || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

const bound = (v) => {
  if (v === '-inf') return { v: -Infinity, excl: false };
  if (v === '+inf') return { v: Infinity, excl: false };
  const s = String(v);
  return s.startsWith('(')
    ? { v: Number(s.slice(1)), excl: true }
    : { v: Number(s), excl: false };
};

function fakeZrange(key, lo, hi, opts = {}) {
  state.zrangeCalls.push([key, lo, hi, opts]);
  let list = [...index.members].sort(byNewest);
  if (opts.byScore) {
    // Under REV the bounds arrive positionally as (max, min).
    const max = bound(lo);
    const min = bound(hi);
    list = list.filter(
      (m) =>
        (max.excl ? m.score < max.v : m.score <= max.v) &&
        (min.excl ? m.score > min.v : m.score >= min.v),
    );
    if (opts.offset !== undefined) {
      list = list.slice(opts.offset, opts.offset + opts.count);
    }
  } else {
    list = list.slice(lo, hi + 1);
  }
  return opts.withScores
    ? list.flatMap((m) => [m.id, m.score])
    : list.map((m) => m.id);
}

vi.mock('@upstash/redis', () => {
  class Redis {
    constructor(opts) {
      this.opts = opts;
      state.clients.push(this);
      // The commands the OLD implementation used — they must stay unused.
      this.exists = vi.fn();
      this.hset = vi.fn();
      this.hdel = vi.fn();
      this.hgetall = vi.fn();
      this.zrem = vi.fn();
      this.del = vi.fn();
      // The paged read's commands, answered from the fake index and rows.
      this.zrange = async (...args) => fakeZrange(...args);
      this.mget = async (...keys) => keys.map((k) => index.rows.get(k) ?? null);
    }
    createScript(source) {
      const script = {
        source,
        client: this,
        exec: vi.fn(async () => state.scriptReply),
      };
      state.scripts.push(script);
      return script;
    }
    multi() {
      const calls = [];
      const tx = {
        exec: async () => {
          state.transactions.push(calls);
          return state.txReply(calls);
        },
      };
      for (const cmd of ['zrem', 'del', 'set', 'zadd']) {
        tx[cmd] = (...args) => {
          calls.push([cmd, ...args]);
          return tx;
        };
      }
      return tx;
    }
    // The paged read's cursor pipeline: two ZRANGEs, answered in order.
    pipeline() {
      const calls = [];
      const p = {
        zrange: (...args) => {
          calls.push(args);
          return p;
        },
        exec: async () => calls.map((args) => fakeZrange(...args)),
      };
      return p;
    }
  }
  return { Redis };
});

async function driver() {
  const mod = await import('@/lib/guestbook/redisDriver');
  return mod.redisDriver;
}

beforeEach(() => {
  state.transactions.length = 0;
  state.zrangeCalls.length = 0;
  state.scriptReply = null;
  state.txReply = () => [];
  for (const s of state.scripts) s.exec.mockClear();
});

// The paged read against the fake index. Ids are named oldest → newest
// (m1 … m5), one minute apart, so the REV walk reads m5 first.
describe('redisDriver — cursor-paged read', () => {
  const at = Date.UTC(2026, 2, 1);
  const wall = (ids, missing = []) =>
    setIndex(
      ids.map((id, i) => ({ id, score: at + i * 60_000 })),
      { missing },
    );
  const pos = (id) => ({
    id,
    t: index.members.find((m) => m.id === id).score,
  });
  const ids = (page) => page.messages.map((m) => m.id);

  it('walks newest-first, one position beyond the page, and continues from the last row', async () => {
    const d = await driver();
    wall(['m1', 'm2', 'm3', 'm4', 'm5']);
    const p1 = await d.listMessages({ limit: 2 });
    expect(ids(p1)).toEqual(['m5', 'm4']);
    expect(p1.next).toEqual(pos('m4'));
    // limit + 1 positions, WITH scores — so a position can be minted for an
    // id whose row turns out to be gone.
    expect(state.zrangeCalls[0]).toEqual([
      'guestbook:ids',
      0,
      2,
      { rev: true, withScores: true },
    ]);
    const p2 = await d.listMessages({ limit: 2, after: p1.next });
    expect(ids(p2)).toEqual(['m3', 'm2']);
    expect(p2.next).toEqual(pos('m2'));
    const p3 = await d.listMessages({ limit: 2, after: p2.next });
    expect(ids(p3)).toEqual(['m1']);
    expect(p3.next).toBe(null);
  });

  it('a same-millisecond pair is not skipped at a page edge', async () => {
    const d = await driver();
    setIndex([
      { id: 'a', score: at },
      { id: 'b', score: at + 1 },
      { id: 'c', score: at + 1 },
      { id: 'd', score: at + 2 },
    ]);
    // REV: d, then c and b (same score, member desc), then a.
    const p1 = await d.listMessages({ limit: 2 });
    expect(ids(p1)).toEqual(['d', 'c']);
    const p2 = await d.listMessages({ limit: 2, after: p1.next });
    expect(ids(p2)).toEqual(['b', 'a']);
    expect(p2.next).toBe(null);
  });

  // The regression this pins: the page's every row lost a race with a delete
  // between ZRANGE and MGET. The read used to answer { messages: [], next:
  // null } — "the wall is exhausted" — with three live messages below.
  it('every row of the page deleted after the index read: the read scans on instead of ending the wall', async () => {
    const d = await driver();
    wall(['m1', 'm2', 'm3', 'm4', 'm5'], ['m5', 'm4']);
    const page = await d.listMessages({ limit: 2 });
    expect(ids(page)).toEqual(['m3', 'm2']);
    expect(page.next).toEqual(pos('m2'));
    // The continuation scanned from the last INDEXED position — the deleted
    // m4's own score — by score, never by rank: a rank offset would skip the
    // member that slid into the vacated rank.
    const byScore = state.zrangeCalls.filter(([, , , o]) => o.byScore);
    expect(byScore).toEqual([
      [
        'guestbook:ids',
        pos('m4').t,
        pos('m4').t,
        { byScore: true, rev: true, withScores: true },
      ],
      [
        'guestbook:ids',
        `(${pos('m4').t}`,
        '-inf',
        { byScore: true, rev: true, offset: 0, count: 3, withScores: true },
      ],
    ]);
  });

  it('a partly deleted page is filled from further down', async () => {
    const d = await driver();
    wall(['m1', 'm2', 'm3', 'm4', 'm5'], ['m4']);
    const page = await d.listMessages({ limit: 2 });
    expect(ids(page)).toEqual(['m5', 'm3']);
    expect(page.next).toEqual(pos('m3'));
  });

  it('a short page always means the index is exhausted — never a deleted tail', async () => {
    const d = await driver();
    wall(['m1', 'm2', 'm3'], ['m1']);
    const p1 = await d.listMessages({ limit: 2 });
    expect(ids(p1)).toEqual(['m3', 'm2']);
    expect(p1.next).toEqual(pos('m2'));
    // Only m1 is indexed below, and its row is gone: nothing live older.
    const p2 = await d.listMessages({ limit: 2, after: p1.next });
    expect(p2).toEqual({ messages: [], next: null });
  });

  it('an empty index is an empty wall', async () => {
    const d = await driver();
    setIndex([]);
    expect(await d.listMessages({ limit: 8 })).toEqual({ messages: [], next: null });
  });
});

describe('redisDriver — atomic reaction write', () => {
  it("sends one script with both keys, the reactor's identity key and the reaction key", async () => {
    const d = await driver();
    // A reply mixing a current field (identity key) with a legacy one (a bare
    // login that happens to look numeric).
    state.scriptReply = ['github:7', 'fire', '123', 'heart'];
    const map = await d.setReaction('m1', 'github:7', 'fire');

    expect(state.scripts).toHaveLength(1);
    const script = state.scripts[0];
    expect(script.exec).toHaveBeenCalledTimes(1);
    expect(script.exec).toHaveBeenCalledWith(
      ['guestbook:msg:m1', 'guestbook:reactions:m1'],
      ['github:7', 'fire'],
    );
    // The flat reply becomes a map with STRING keys, "123" included.
    expect(map).toEqual({ 'github:7': 'fire', 123: 'heart' });
    expect(Object.keys(map)).toEqual(['123', 'github:7']);

    // Nothing check-then-act about it: no client-side EXISTS / HSET / HGETALL.
    for (const c of state.clients) {
      expect(c.exists).not.toHaveBeenCalled();
      expect(c.hset).not.toHaveBeenCalled();
      expect(c.hgetall).not.toHaveBeenCalled();
    }
  });

  it('the script checks existence, writes, and reads back — on the server', async () => {
    // Import the driver here too: the script is created at module load, and
    // vitest's module cache means the load happens once whichever test asks
    // first — so this case reads the script under a name filter as well as
    // after its siblings (it used to lean on the previous test's import).
    await driver();
    expect(state.scripts).toHaveLength(1);
    const { source } = state.scripts[0];
    expect(source).toMatch(/EXISTS.*KEYS\[1\]/s);
    expect(source).toMatch(/return nil/);
    expect(source).toMatch(/HSET.*KEYS\[2\].*ARGV\[1\].*ARGV\[2\]/s);
    expect(source).toMatch(/HDEL.*KEYS\[2\].*ARGV\[1\]/s);
    expect(source).toMatch(/return redis\.call\('HGETALL', KEYS\[2\]\)/);
  });

  it("clearing passes '' for the key; a nil reply means the message is gone", async () => {
    const d = await driver();
    state.scriptReply = [];
    expect(await d.setReaction('m1', 'bob', null)).toEqual({});
    expect(state.scripts[0].exec).toHaveBeenLastCalledWith(
      ['guestbook:msg:m1', 'guestbook:reactions:m1'],
      ['bob', ''],
    );

    state.scriptReply = null;
    expect(await d.setReaction('ghost', 'bob', 'fire')).toBe(null);
  });

  it('runs on a client with automatic deserialisation off; the data client keeps it on', async () => {
    await driver();
    const script = state.scripts[0];
    expect(script.client.opts.automaticDeserialization).toBe(false);
    const dataClient = state.clients.find(
      (c) => c.opts.automaticDeserialization === undefined,
    );
    expect(dataClient).toBeDefined();
    expect(dataClient).not.toBe(script.client);
  });
});

describe('redisDriver — atomic delete and insert', () => {
  it('deleteMessage is one MULTI of ZREM + DEL(message, reactions), reporting the ZREM count', async () => {
    const d = await driver();
    state.txReply = () => [1, 2];
    expect(await d.deleteMessage('m1')).toBe(true);
    expect(state.transactions).toEqual([
      [
        ['zrem', 'guestbook:ids', 'm1'],
        ['del', 'guestbook:msg:m1', 'guestbook:reactions:m1'],
      ],
    ]);
    for (const c of state.clients) {
      expect(c.zrem).not.toHaveBeenCalled();
      expect(c.del).not.toHaveBeenCalled();
    }

    state.txReply = () => [0, 0];
    expect(await d.deleteMessage('m1')).toBe(false);
  });

  it('addMessage is one MULTI of SET + ZADD scored by createdAt', async () => {
    const d = await driver();
    const message = {
      id: 'm2',
      message: 'hi',
      createdAt: '2026-03-01T00:00:00.000Z',
    };
    expect(await d.addMessage(message)).toBe(message);
    expect(state.transactions).toEqual([
      [
        ['set', 'guestbook:msg:m2', message],
        [
          'zadd',
          'guestbook:ids',
          { score: Date.parse('2026-03-01T00:00:00.000Z'), member: 'm2' },
        ],
      ],
    ]);
  });
});
