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
//   · addMessage is ONE MULTI/EXEC of SET + ZADD.
// These values are placeholders so the driver believes Redis is configured —
// nothing is contacted.
process.env.KV_REST_API_URL = 'https://unit-test.invalid';
process.env.KV_REST_API_TOKEN = 'not-a-real-token';
process.env.GUESTBOOK_DRIVER = 'redis';

const state = {
  clients: [],
  scripts: [],
  transactions: [],
  scriptReply: null,
  txReply: () => [],
};

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
    pipeline() {
      return this.multi();
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
  state.scriptReply = null;
  state.txReply = () => [];
  for (const s of state.scripts) s.exec.mockClear();
});

describe('redisDriver — atomic reaction write', () => {
  it('sends one script with both keys, the username and the reaction key', async () => {
    const d = await driver();
    state.scriptReply = ['bob', 'fire', '123', 'heart'];
    const map = await d.setReaction('m1', 'bob', 'fire');

    expect(state.scripts).toHaveLength(1);
    const script = state.scripts[0];
    expect(script.exec).toHaveBeenCalledTimes(1);
    expect(script.exec).toHaveBeenCalledWith(
      ['guestbook:msg:m1', 'guestbook:reactions:m1'],
      ['bob', 'fire'],
    );
    // The flat reply becomes a map with STRING keys, "123" included.
    expect(map).toEqual({ bob: 'fire', 123: 'heart' });
    expect(Object.keys(map)).toEqual(['123', 'bob']);

    // Nothing check-then-act about it: no client-side EXISTS / HSET / HGETALL.
    for (const c of state.clients) {
      expect(c.exists).not.toHaveBeenCalled();
      expect(c.hset).not.toHaveBeenCalled();
      expect(c.hgetall).not.toHaveBeenCalled();
    }
  });

  it('the script checks existence, writes, and reads back — on the server', () => {
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
