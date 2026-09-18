import crypto from 'node:crypto';

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { freshCronSecret } from '../helpers/secrets.js';

// The snapshot baseline is the one part of /api/seo-report that CANNOT be
// checked by reading a single response: it is a property of how three
// invocations interact across a UTC day boundary. The route stores a snapshot
// and compares the next run against it, so a bug here is silent — every
// response looks well-formed, and the only symptom is a finding that no run
// ever reports.
//
// The specific regression this pins: a SECOND run on the same day used to
// overwrite `seo:gsc:latest`, so the next day compared against that afternoon
// capture instead of the morning one, and everything that changed in between
// was skipped by both runs. `rerun` in the payload is the visible half of the
// same fix.
//
// Everything external is faked — Upstash in memory, Google over a stubbed
// fetch — so the assertions are about ordering, not about the network.

const { redisStore, redisMock, redisHooks, latestWrites, redisTtls } = vi.hoisted(() => {
  const store = new Map();
  // key → the expiry, in seconds, the last write to it asked for (undefined when
  // a write set none). The retention policy is only real if every key that
  // holds a snapshot carries one, and `latest` held the whole payload forever.
  const ttls = new Map();
  // EVERY value ever written to `latest`, in order — not just the one that
  // survived. Asserting on the final value alone is order-dependent: when two
  // runs race, a version that publishes the LOSER's capture still leaves the
  // right value behind whenever the winner's write happens to land last, so the
  // assertion passes by luck. The full list is order-independent.
  //
  // The key is spelled literally because `vi.hoisted` runs before the LATEST_KEY
  // constant below exists. The overlap case asserts this array is non-empty, so
  // a drift between the two spellings fails loudly rather than recording
  // nothing and passing.
  const latestKeyWrites = [];
  // Fault and staleness injection for the concurrency cases below. Each hook is
  // null unless a test sets it, so the default mock stays a plain in-memory
  // store and nothing else has to know these exist.
  const hooks = {
    /** Return this instead of the stored value, for one key. */
    staleGet: null, // { key, value }
    /** Throw when writing this key, to model a half-completed run. */
    failSetOn: null, // string key
    /** Force `get` to answer empty for this key, after an `nx` rejection. */
    emptyGetOn: null, // string key
  };
  return {
    redisStore: store,
    redisHooks: hooks,
    redisTtls: ttls,
    latestWrites: latestKeyWrites,
    redisMock: {
      async get(key) {
        if (hooks.emptyGetOn === key) return null;
        if (hooks.staleGet && hooks.staleGet.key === key) {
          return structuredClone(hooks.staleGet.value);
        }
        const held = store.get(key);
        // Upstash auto-deserialises, so callers get an object back. Cloning
        // keeps the test honest: the route must not mutate stored state.
        return held === undefined ? null : structuredClone(held);
      },
      async set(key, value, options = {}) {
        if (hooks.failSetOn === key) {
          throw new Error(`redis unavailable for ${key}`);
        }
        // The only two SET semantics this route depends on. `nx` returning
        // null on an existing key is what makes the daily snapshot immutable.
        if (options.nx && store.has(key)) return null;
        if (key === 'seo:gsc:latest')
          latestKeyWrites.push(structuredClone(value));
        store.set(key, structuredClone(value));
        ttls.set(key, options.ex);
        return 'OK';
      },
      // PUBLISH_LATEST_LUA, executed in JS.
      //
      // Stated plainly because it bounds what these cases prove: this is a
      // FAITHFUL MODEL of the script's decision, not the script. It reproduces
      // the compare-and-set — keep the stored value when its `capturedAt` is
      // strictly newer, otherwise write — and the atomicity it relies on is free
      // here, since a single-threaded test can no more interleave these lines
      // than Redis can interleave the script. What it cannot prove is that the
      // Lua itself parses, that `cjson.decode` accepts what the client stored,
      // or that the reply marshals back as a number. Those need a real Redis.
      //
      // Reads the store directly rather than going through `get`, because the
      // script runs server-side and cannot see this mock's fault-injection
      // hooks — modelling it otherwise would let `staleGet` fake an outcome the
      // real script could never produce.
      async eval(script, keys, args) {
        const [key] = keys;
        // `expiry` is ARGV[3]. The script SETs with `EX`, so a model that
        // ignored it would let an unbounded write pass here unnoticed — which is
        // exactly how `latest` came to be the one key with no retention.
        const [serialised, capturedAt, expiry] = args;
        // Whether the SCRIPT actually applies that argument. Read off the Lua
        // text rather than assumed, because this mock models the script's
        // DECISION and would otherwise record a TTL the script never set: the
        // route can pass ARGV[3] to a `SET` that ignores it, which is precisely
        // the state this key was in. Text-matching is the only check available
        // to a JS model; that the Lua parses and that Redis honours the expiry
        // need a real server.
        const boundedWrite = /'EX',\s*ARGV\[3\]/.test(script);
        // `failSetOn` has to reach here as well as `set`. The baseline write
        // moved from SET to this script, so a hook that only faulted `set` would
        // leave the half-completed-run case injecting nothing and passing while
        // asserting on a failure that never happened.
        if (hooks.failSetOn === key) {
          throw new Error(`redis unavailable for ${key}`);
        }
        const current = store.get(key);
        if (
          current &&
          typeof current.capturedAt === 'string' &&
          current.capturedAt > capturedAt
        ) {
          return 0;
        }
        const value = JSON.parse(serialised);
        if (key === 'seo:gsc:latest') latestKeyWrites.push(value);
        store.set(key, value);
        ttls.set(
          key,
          boundedWrite && expiry !== undefined ? Number(expiry) : undefined,
        );
        return 1;
      },
    },
  };
});

/** Clear every injected fault, and the record of `latest` writes. */
function resetHooks() {
  redisHooks.staleGet = null;
  redisHooks.failSetOn = null;
  redisHooks.emptyGetOn = null;
  latestWrites.length = 0;
  raceRows.length = 0;
  rowsByToken.clear();
  countryRows = [];
  redisTtls.clear();
}

vi.mock('@/lib/guestbook/redisDriver', () => ({
  redis: redisMock,
  redisAvailable: true,
}));

// Generated per run, never written down: see tests/helpers/secrets.js.
const CRON_SECRET = freshCronSecret();
const SNAPSHOT_KEY = (date) => `seo:gsc:${date}`;
const LATEST_KEY = 'seo:gsc:latest';

// Rows the stubbed Search Analytics answers with. Mutated between runs to
// simulate the site's ranking actually changing during the day.
let queryRows = [];

// Rows the `country` dimension answers with. Empty for every case but the one
// about the geographic split, so the snapshots the other cases build stay as
// readable as they were.
let countryRows = [];

// Per-RUN rows, for the overlapping case. `queryRows` above is module state, so
// two invocations started together both read whichever value was assigned last
// and build byte-identical snapshots — which makes "which snapshot got
// published?" unanswerable, and silently defeats any assertion about it.
//
// The runs are told apart by their access token: the route fetches one per
// invocation and puts that exact string in the Authorization header of every
// query it then makes, so issuing a unique token per exchange gives each
// concurrent run a tag that survives the interleaving.
let tokensIssued = 0;
/** Rows handed to the next run to ask for a token, in order. */
const raceRows = [];
/** access token → the rows that run should see. */
const rowsByToken = new Map();

const row = (
  key,
  { clicks = 0, impressions = 0, ctr = 0, position = 10 } = {},
) => ({
  keys: [key],
  clicks,
  impressions,
  ctr,
  position,
});

const MORNING_ROWS = [
  row('muhammad abdullah', {
    clicks: 5,
    impressions: 100,
    ctr: 0.05,
    position: 8.2,
  }),
];
// The afternoon rerun is the first run that can see this query. If the baseline
// walks forward, it is also the LAST run that ever sees it as new.
const AFTERNOON_ROWS = [
  ...MORNING_ROWS,
  row('ma codes portfolio', {
    clicks: 1,
    impressions: 40,
    ctr: 0.025,
    position: 12,
  }),
];

let GET;
let realFetch;

beforeAll(async () => {
  // A real keypair: the route signs its JWT with node:crypto before any fetch
  // happens, so a placeholder private key would fail inside getAccessToken and
  // the test would never reach the code under test.
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const credential = {
    client_email: 'seo-report@test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };

  process.env.CRON_SECRET = CRON_SECRET;
  process.env.GSC_SERVICE_ACCOUNT_KEY = Buffer.from(
    JSON.stringify(credential),
  ).toString('base64');

  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.startsWith('https://oauth2.googleapis.com/token')) {
      // Unique per exchange, which is what lets the analytics stub below tell
      // two concurrent invocations apart.
      const token = `test-token-${(tokensIssued += 1)}`;
      if (raceRows.length > 0) rowsByToken.set(token, raceRows.shift());
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: token }),
      };
    }
    if (target.includes('searchAnalytics/query')) {
      const { dimensions } = JSON.parse(init.body);
      // Which run is asking, read back off the header the route just set.
      // Falls through to the shared `queryRows` for every non-race case.
      const token = String(init.headers?.Authorization ?? '').replace(
        'Bearer ',
        '',
      );
      const rows = rowsByToken.get(token) ?? queryRows;
      // Only the `query` dimension drives the findings under test; `page` and
      // `country` are answered empty so the snapshot stays readable.
      return {
        ok: true,
        status: 200,
        json: async () => ({
          rows:
            dimensions[0] === 'query'
              ? rows
              : dimensions[0] === 'country'
                ? countryRows
                : [],
        }),
      };
    }
    throw new Error(`unexpected fetch in test: ${target}`);
  };

  ({ GET } = await import('@/app/api/seo-report/route'));
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

afterEach(() => {
  vi.useRealTimers();
  resetHooks();
});

/** Run the route as if it were `when`, without asserting the outcome. */
async function callAt(when, rows) {
  // Date only: faking setTimeout as well would reach into Next's response
  // machinery for no benefit here.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(when));
  queryRows = rows;
  const response = await GET(
    new Request('http://localhost/api/seo-report', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    }),
  );
  return { status: response.status, body: await response.json() };
}

/** Run the route as if it were `when`, answering with `rows`. */
async function runAt(when, rows) {
  const { status, body } = await callAt(when, rows);
  expect(status).toBe(200);
  return body;
}

describe('/api/seo-report — the snapshot baseline across a day boundary', () => {
  it('keeps the first snapshot of the day as the baseline, so a rerun cannot swallow a day of findings', async () => {
    redisStore.clear();

    // ── 06:00 — the daily cron ────────────────────────────────────────────
    const morning = await runAt('2026-09-11T06:00:00.000Z', MORNING_ROWS);
    expect(morning.ok).toBe(true);
    expect(morning.rerun).toBe(false);
    expect(morning.comparedAgainst).toBe(null); // nothing stored yet
    expect(morning.storedAs).toBe(SNAPSHOT_KEY('2026-09-11'));

    const firstCapture = redisStore.get(LATEST_KEY).capturedAt;
    expect(firstCapture).toBe('2026-09-11T06:00:00.000Z');
    expect(redisStore.get(SNAPSHOT_KEY('2026-09-11')).capturedAt).toBe(
      firstCapture,
    );

    // ── 18:00 — the same day, by hand, with a new query now ranking ───────
    const afternoon = await runAt('2026-09-11T18:00:00.000Z', AFTERNOON_ROWS);
    expect(afternoon.rerun).toBe(true);
    expect(afternoon.comparedAgainst).toBe(firstCapture);

    // Neither key moved: both still hold the 06:00 capture.
    expect(redisStore.get(LATEST_KEY).capturedAt).toBe(firstCapture);
    expect(redisStore.get(SNAPSHOT_KEY('2026-09-11')).capturedAt).toBe(
      firstCapture,
    );

    // ── 06:00 the next day — the assertion the whole fix exists for ───────
    const nextDay = await runAt('2026-09-12T06:00:00.000Z', AFTERNOON_ROWS);
    expect(nextDay.rerun).toBe(false);
    // Against the MORNING capture, not the rerun's.
    expect(nextDay.comparedAgainst).toBe(firstCapture);
    // So the query that first appeared during the rerun is still reported.
    // Before the fix this list was empty and that finding was lost for good.
    expect(nextDay.findings.newQueries.map((q) => q.query)).toEqual([
      'ma codes portfolio',
    ]);

    // A new day rolls the baseline forward exactly once.
    expect(redisStore.get(LATEST_KEY).capturedAt).toBe(
      '2026-09-12T06:00:00.000Z',
    );
    expect(redisStore.get(SNAPSHOT_KEY('2026-09-12')).capturedAt).toBe(
      '2026-09-12T06:00:00.000Z',
    );
    // and leaves yesterday's archived snapshot alone.
    expect(redisStore.get(SNAPSHOT_KEY('2026-09-11')).capturedAt).toBe(
      firstCapture,
    );
  });

  it('treats a missed day as a wider window rather than a fresh start', async () => {
    redisStore.clear();

    const seed = await runAt('2026-09-11T06:00:00.000Z', MORNING_ROWS);
    expect(seed.rerun).toBe(false);

    // Three days later: nothing ran in between, so `seo:gsc:2026-09-13` never
    // existed. Reading yesterday's key as the baseline would find nothing here
    // and report every query as new; `latest` degrades to the last day that
    // actually captured.
    const later = await runAt('2026-09-14T06:00:00.000Z', AFTERNOON_ROWS);
    expect(later.comparedAgainst).toBe('2026-09-11T06:00:00.000Z');
    expect(later.findings.newQueries.map((q) => q.query)).toEqual([
      'ma codes portfolio',
    ]);
  });
});

// ── Overlapping invocations, and half-completed ones ────────────────────────
// The date comparison that used to decide "is this a rerun?" was read at the
// TOP of the handler, seconds before the write. Two invocations overlapping
// inside that gap — the cron firing while someone runs it by hand, or a
// platform retry — both read the old `latest`, both concluded they were the
// day's first run, and both wrote `latest`, leaving it disagreeing with the
// daily key that only one of them managed to claim.
//
// The `nx` result is now what decides, because it is the only atomic step in
// the sequence: whoever loses the claim republishes the snapshot that won.
describe('/api/seo-report — concurrent and partial writes', () => {
  const DAY = '2026-09-11';
  const dayKey = SNAPSHOT_KEY(DAY);

  it('cannot be pushed off the baseline by a stale read of `latest`', () => {
    // The race, made deterministic. Run B is given the value `latest` held
    // BEFORE run A wrote — exactly what a concurrent B would have read — and
    // must still leave A's snapshot as the day's record.
    redisStore.clear();
    const yesterday = {
      capturedAt: '2026-09-10T06:00:00.000Z',
      queries: [],
      pages: [],
      countries: [],
    };
    redisStore.set(LATEST_KEY, yesterday);

    return (async () => {
      const a = await runAt(`${DAY}T06:00:00.000Z`, MORNING_ROWS);
      expect(a.rerun).toBe(false);
      const aCapture = redisStore.get(dayKey).capturedAt;

      // B still believes `latest` is yesterday's, so the old date comparison
      // would have said "not a rerun" and overwritten the baseline with B.
      redisHooks.staleGet = { key: LATEST_KEY, value: yesterday };
      const b = await runAt(`${DAY}T06:00:01.000Z`, AFTERNOON_ROWS);

      expect(b.rerun, 'the nx rejection decides, not the stale read').toBe(
        true,
      );
      expect(redisStore.get(dayKey).capturedAt).toBe(aCapture);
      expect(
        redisStore.get(LATEST_KEY).capturedAt,
        'latest must mirror the daily key, not the run that lost the race',
      ).toBe(aCapture);
    })();
  });

  it('leaves both keys agreeing when two runs genuinely overlap', async () => {
    redisStore.clear();
    latestWrites.length = 0;

    // The two runs must produce DIFFERENT snapshots or nothing below can tell
    // which one was published: whoever asks for a token first gets the morning
    // rows, the other the afternoon's.
    raceRows.push(MORNING_ROWS, AFTERNOON_ROWS);

    // Both handlers interleave on the same in-memory store. NOTE both are the
    // day's first run — neither sees a previous snapshot — which is the exact
    // shape a "two firsts race" report describes.
    const [first, second] = await Promise.all([
      callAt(`${DAY}T06:00:00.000Z`, MORNING_ROWS),
      callAt(`${DAY}T06:00:00.000Z`, AFTERNOON_ROWS),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // Exactly one of them owns the day.
    expect([first.body.rerun, second.body.rerun].filter(Boolean)).toHaveLength(
      1,
    );
    // And whichever it was, the two keys tell the same story.
    expect(redisStore.get(LATEST_KEY)).toEqual(redisStore.get(dayKey));

    // The assertion above is necessary but NOT sufficient, and that matters:
    // a version where the loser publishes its OWN capture still leaves the
    // right final value whenever the winner's write lands last, so the line
    // above passes by luck of interleaving rather than by correctness. This
    // one cannot: no run may publish anything except the snapshot that won the
    // `nx` claim, whatever order the two finish in.
    expect(
      latestWrites.length,
      'the mock must have recorded writes',
    ).toBeGreaterThan(0);
    for (const written of latestWrites) {
      expect(
        written,
        'a run published a capture that did not win the daily claim',
      ).toEqual(redisStore.get(dayKey));
    }
  });

  it('keeps the daily key when the latest write fails, then self-heals', async () => {
    // A half-completed run: the archive lands, `latest` does not. The old
    // shape skipped the `latest` write entirely on a rerun, so nothing ever
    // repaired it; rewriting it on every run is what makes the next invocation
    // a repair rather than a no-op.
    redisStore.clear();
    const yesterday = {
      capturedAt: '2026-09-10T06:00:00.000Z',
      queries: [],
      pages: [],
      countries: [],
    };
    redisStore.set(LATEST_KEY, yesterday);

    redisHooks.failSetOn = LATEST_KEY;
    const failed = await callAt(`${DAY}T06:00:00.000Z`, MORNING_ROWS);

    expect(failed.status).toBe(502);
    expect(failed.body.ok).toBe(false);
    // The archive was written before the failure, and `latest` is untouched —
    // stale, but a real baseline rather than a hole.
    const aCapture = redisStore.get(dayKey).capturedAt;
    expect(aCapture).toBe(`${DAY}T06:00:00.000Z`);
    expect(redisStore.get(LATEST_KEY).capturedAt).toBe(yesterday.capturedAt);

    // The next run finds the day already claimed and republishes the snapshot
    // that won, which is the repair.
    resetHooks();
    const healed = await runAt(`${DAY}T18:00:00.000Z`, AFTERNOON_ROWS);

    expect(healed.rerun).toBe(true);
    expect(redisStore.get(LATEST_KEY).capturedAt).toBe(aCapture);
    expect(redisStore.get(dayKey).capturedAt).toBe(aCapture);
  });

  it('does not let a slower day-1 run outrank the day-2 baseline it overlapped', async () => {
    // The boundary race that survived the compare-and-set, because it was the
    // COMPARISON's own input that was wrong.
    //
    // `capturedAt` was read when the snapshot was assembled — after the
    // upstream calls — while the window it describes is chosen before them. For
    // a run that does not cross midnight those two order identically, which is
    // why every existing case here passes either way. Overlap the boundary and
    // they come apart:
    //
    //   A  reads day 1 at 23:59:59, upstreams stall, finishes  00:00:20
    //   B  reads day 2 at 00:00:02, upstreams answer, finishes 00:00:10
    //
    // B publishes the day-2 window first. A then arrives with the LATER
    // assembly stamp, wins the `>` comparison, and overwrites `latest` with the
    // OLDER day-1 window — the exact baseline rewind PUBLISH_LATEST_LUA was
    // added to prevent, re-entered through the field it prevents it with. And
    // it is silent: both snapshots are well-formed, and the only symptom is the
    // next report comparing against a window a day too old, so everything that
    // changed in between is reported by no run.
    //
    // Reproduced rather than described: the clock is moved between A's
    // pre-flight and its completion, which is the only place the divergence can
    // appear.
    redisStore.clear();
    vi.useFakeTimers({ toFake: ['Date'] });

    // A's analytics calls are held open until B has been and gone.
    let releaseA;
    const aGate = new Promise((resolve) => {
      releaseA = resolve;
    });
    const realStub = globalThis.fetch;
    let gateNextRun = true;
    globalThis.fetch = async (url, init = {}) => {
      const held = gateNextRun && String(url).includes('searchAnalytics/query');
      const response = await realStub(url, init);
      if (held) await aGate;
      return response;
    };

    try {
      vi.setSystemTime(new Date('2026-09-17T23:59:59.000Z'));
      queryRows = MORNING_ROWS;
      const pendingA = GET(
        new Request('http://localhost/api/seo-report', {
          headers: { authorization: `Bearer ${CRON_SECRET}` },
        }),
      );
      // Let A get past its token exchange and its pre-flight date read, so it
      // is parked on the gated analytics calls with day 1 already chosen.
      await new Promise((resolve) => setImmediate(resolve));
      gateNextRun = false;

      // B runs start to finish on day 2 while A is still waiting.
      const b = await runAt('2026-09-18T00:00:02.000Z', AFTERNOON_ROWS);
      expect(b.window.end).toBe('2026-09-15');
      const dayTwoBaseline = redisStore.get(LATEST_KEY).capturedAt;

      // Now A completes, twenty seconds the far side of the boundary.
      vi.setSystemTime(new Date('2026-09-18T00:00:20.000Z'));
      releaseA();
      const responseA = await pendingA;
      const bodyA = await responseA.json();

      expect(responseA.status).toBe(200);
      // A is still a perfectly good day-1 snapshot and still archived — it is
      // only its claim to be the NEWEST that has to be refused.
      expect(bodyA.window.end).toBe('2026-09-14');
      expect(bodyA.baselinePublished).toBe(false);
      expect(
        redisStore.get(LATEST_KEY).capturedAt,
        'the day-2 baseline must survive a day-1 run that merely finished later',
      ).toBe(dayTwoBaseline);
      expect(redisStore.get(LATEST_KEY).window.end).toBe('2026-09-15');
    } finally {
      globalThis.fetch = realStub;
      releaseA();
    }
  });

  it('leaves the baseline alone rather than nulling it if the claim reads back empty', async () => {
    // Belt and braces: an `nx` rejection proves the key exists, so this should
    // be unreachable. If it ever happens anyway, erasing `latest` would make
    // the next run report every query as new — strictly worse than stale.
    redisStore.clear();
    const a = await runAt(`${DAY}T06:00:00.000Z`, MORNING_ROWS);
    expect(a.rerun).toBe(false);
    const aCapture = redisStore.get(LATEST_KEY).capturedAt;

    redisHooks.emptyGetOn = dayKey;
    const b = await runAt(`${DAY}T18:00:00.000Z`, AFTERNOON_ROWS);

    expect(b.rerun).toBe(true);
    expect(redisStore.get(LATEST_KEY).capturedAt).toBe(aCapture);
  });
});

// ── The boundary `nx` does not cover ────────────────────────────────────────
// The daily claim serialises runs that share a key. Two runs either side of UTC
// midnight DO NOT share one: one claims `seo:gsc:<day1>`, the other
// `seo:gsc:<day2>`, both claims succeed, and nothing ordered their `latest`
// writes. `latest` was written with an unconditional SET, so last-writer-won —
// and the likely last writer is the run that was already delayed, i.e. the older
// one.
//
// The result is the same silent failure the `nx` machinery exists to prevent,
// one boundary over: the baseline goes backwards, the next report compares
// against data a day too old, and everything that changed in between is reported
// by no run. Nothing about either response looks wrong.
//
// These cases drive the two runs in the order that loses, and assert on the
// STORED baseline rather than on either payload — the payloads were fine before
// the fix.
describe('/api/seo-report — a delayed run cannot rewind the baseline', () => {
  const LATE_NIGHT = '2026-09-11T23:59:50.000Z';
  const NEXT_DAY = '2026-09-12T00:30:00.000Z';

  it('keeps the newer day when an older run writes last', async () => {
    redisStore.clear();

    // Day 1's run captures just before midnight. Let it complete, then model the
    // delay by replaying its publish AFTER day 2 has landed — the route is
    // deterministic given the clock, so a second call at the same instant
    // reproduces exactly the write the delayed run would have made.
    const first = await runAt(LATE_NIGHT, MORNING_ROWS);
    expect(first.rerun).toBe(false);
    expect(first.baselinePublished).toBe(true);

    const second = await runAt(NEXT_DAY, AFTERNOON_ROWS);
    expect(second.rerun).toBe(false);
    expect(second.baselinePublished).toBe(true);
    const newest = redisStore.get(LATEST_KEY).capturedAt;
    expect(newest).toBe(NEXT_DAY);

    // The delayed day-1 run finally reaches its publish. It finds its own daily
    // key already claimed (by itself), republishes that canonical — and must be
    // refused, because `latest` now holds a strictly newer snapshot.
    const delayed = await runAt(LATE_NIGHT, MORNING_ROWS);

    expect(delayed.rerun).toBe(true);
    expect(
      delayed.baselinePublished,
      'The delayed run republished an older snapshot over a newer baseline.',
    ).toBe(false);
    expect(
      redisStore.get(LATEST_KEY).capturedAt,
      'The baseline went backwards a day — the next report will compare ' +
        'against stale data and silently skip everything in between.',
    ).toBe(newest);
  });

  it('still records the delayed run in its own daily archive', async () => {
    redisStore.clear();
    await runAt(LATE_NIGHT, MORNING_ROWS);
    await runAt(NEXT_DAY, AFTERNOON_ROWS);
    await runAt(LATE_NIGHT, MORNING_ROWS);

    // Refusing the BASELINE write must not lose the day's archive: the rolling
    // 90-day history is what a later investigation reads, and day 1 is a real
    // capture regardless of which snapshot is currently the comparison point.
    expect(redisStore.get(SNAPSHOT_KEY('2026-09-11')).capturedAt).toBe(
      LATE_NIGHT,
    );
    expect(redisStore.get(SNAPSHOT_KEY('2026-09-12')).capturedAt).toBe(NEXT_DAY);
  });

  it('publishes normally when the runs arrive in order', async () => {
    redisStore.clear();

    // The control, without which the two cases above would pass on a guard that
    // simply never writes.
    await runAt(LATE_NIGHT, MORNING_ROWS);
    const inOrder = await runAt(NEXT_DAY, AFTERNOON_ROWS);

    expect(inOrder.baselinePublished).toBe(true);
    expect(redisStore.get(LATEST_KEY).capturedAt).toBe(NEXT_DAY);
  });

  it('overwrites a baseline that carries no version at all', async () => {
    redisStore.clear();
    // A value from before `capturedAt` existed, or a half-written one. It cannot
    // be shown to be newer, so refusing to write would strand it forever and
    // leave `deriveFindings` comparing against something it cannot order.
    redisStore.set(LATEST_KEY, { queries: [], pages: [], countries: [] });

    const run = await runAt(NEXT_DAY, AFTERNOON_ROWS);

    expect(run.baselinePublished).toBe(true);
    expect(redisStore.get(LATEST_KEY).capturedAt).toBe(NEXT_DAY);
  });
});

// ── The retention window has to cover every key that holds a snapshot ───────
// W6 specifies a ROLLING 90-day store, and the daily keys implemented it: each
// is written with `SNAPSHOT_TTL_SECONDS` so expiry is the database's job. The
// baseline pointer was not — `latest` was SET with no expiry at all, and it
// holds a FULL snapshot: every query, page and country row of the run that
// published it. So the "rolling" store kept one copy of its largest value
// permanently, rewritten larger each night as the site accrued impressions.
// Nothing observable goes wrong; the bill goes up.
describe('/api/seo-report — the snapshot retention window', () => {
  const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;
  const DAY = '2026-09-14';
  const MORNING = `${DAY}T06:00:00.000Z`;
  const NEXT_MORNING = '2026-09-15T06:00:00.000Z';

  it('bounds the baseline pointer, not only the daily keys', async () => {
    redisStore.clear();

    await runAt(MORNING, MORNING_ROWS);

    // Vacuity guard: the daily key's TTL is the behaviour that was already
    // right, so if this is absent the mock stopped recording and the assertion
    // below would be meaningless.
    expect(redisTtls.get(SNAPSHOT_KEY(DAY))).toBe(NINETY_DAYS_SECONDS);

    // The regression in one line: this was `undefined`.
    expect(
      redisTtls.get(LATEST_KEY),
      '`latest` holds a full snapshot; without an expiry it is a permanent copy ' +
        'of the largest value this route writes.',
    ).toBe(NINETY_DAYS_SECONDS);
  });

  it('keeps the two windows equal rather than separately chosen', async () => {
    redisStore.clear();

    await runAt(MORNING, MORNING_ROWS);

    // One policy, read from one constant, applied by both writers — a second
    // literal in the Lua would be a second thing to keep in step, and the
    // pointer expiring before its own daily archive would be a stranger state
    // than having no expiry at all.
    expect(redisTtls.get(LATEST_KEY)).toBe(redisTtls.get(SNAPSHOT_KEY(DAY)));
  });

  it('refreshes the pointer window on every publish', async () => {
    redisStore.clear();

    // The reason a 90-day TTL on the pointer is harmless in steady state: each
    // run rewrites it, which restarts the clock. It can only expire after 90
    // days with no successful run — by which point the baseline it holds is
    // older than the retention window and useless as a comparison.
    await runAt(MORNING, MORNING_ROWS);
    redisTtls.delete(LATEST_KEY);
    await runAt(NEXT_MORNING, AFTERNOON_ROWS);

    expect(redisTtls.get(LATEST_KEY)).toBe(NINETY_DAYS_SECONDS);
  });
});

// ── The report has to return what it says it derives ────────────────────────
// docs/seo.md §9: this route derives "new queries, positions that dropped > 3,
// pages with impressions but CTR < 1%, and the geographic split". Three of the
// four reach the caller through `findings`. The fourth was fetched, stored and
// then dropped from the response, so the only way to read it was to open
// Upstash by hand — the "go and look" this whole loop exists to remove.
describe('/api/seo-report — the geographic split', () => {
  const DAY = '2026-09-14';
  const MORNING = `${DAY}T06:00:00.000Z`;

  it('returns the countries it collected', async () => {
    redisStore.clear();
    countryRows = [
      row('gbr', { clicks: 4, impressions: 90 }),
      row('usa', { clicks: 1, impressions: 30 }),
    ];

    const body = await runAt(MORNING, MORNING_ROWS);

    expect(body.countries).toEqual([
      { country: 'gbr', clicks: 4, impressions: 90 },
      { country: 'usa', clicks: 1, impressions: 30 },
    ]);
    // The same rows the snapshot stored, not a second derivation of them.
    expect(body.countries).toEqual(
      redisStore.get(SNAPSHOT_KEY(DAY)).countries,
    );
  });

  it('returns an empty split rather than omitting it', async () => {
    redisStore.clear();
    countryRows = [];

    const body = await runAt(MORNING, MORNING_ROWS);

    // A missing field and "no impressions from anywhere yet" are different
    // answers, and the second is the true one for a site that is still being
    // indexed. `[]` says it.
    expect(body.countries).toEqual([]);
  });
});
