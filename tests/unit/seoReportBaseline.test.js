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

const { redisStore, redisMock } = vi.hoisted(() => {
  const store = new Map();
  return {
    redisStore: store,
    redisMock: {
      async get(key) {
        const held = store.get(key);
        // Upstash auto-deserialises, so callers get an object back. Cloning
        // keeps the test honest: the route must not mutate stored state.
        return held === undefined ? null : structuredClone(held);
      },
      async set(key, value, options = {}) {
        // The only two SET semantics this route depends on. `nx` returning
        // null on an existing key is what makes the daily snapshot immutable.
        if (options.nx && store.has(key)) return null;
        store.set(key, structuredClone(value));
        return 'OK';
      },
    },
  };
});

vi.mock('@/lib/guestbook/redisDriver', () => ({
  redis: redisMock,
  redisAvailable: true,
}));

const CRON_SECRET = 'test-cron-secret';
const SNAPSHOT_KEY = (date) => `seo:gsc:${date}`;
const LATEST_KEY = 'seo:gsc:latest';

// Rows the stubbed Search Analytics answers with. Mutated between runs to
// simulate the site's ranking actually changing during the day.
let queryRows = [];

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
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'test' }),
      };
    }
    if (target.includes('searchAnalytics/query')) {
      const { dimensions } = JSON.parse(init.body);
      // Only the `query` dimension drives the findings under test; `page` and
      // `country` are answered empty so the snapshot stays readable.
      return {
        ok: true,
        status: 200,
        json: async () => ({
          rows: dimensions[0] === 'query' ? queryRows : [],
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
});

/** Run the route as if it were `when`, answering with `rows`. */
async function runAt(when, rows) {
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
  expect(response.status).toBe(200);
  return response.json();
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
