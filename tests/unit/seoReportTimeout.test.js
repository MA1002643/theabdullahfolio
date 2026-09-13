import crypto from 'node:crypto';

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { freshCronSecret } from '../helpers/secrets.js';

// ── Why a stalled upstream is this route's problem and not only its own ─────
// /api/seo-report runs as the third step of /api/daily-warmup's fan-out, and
// that orchestrator returns ONE response carrying every step's result. So an
// unbounded fetch here does not degrade this route alone: it holds daily-warmup
// open until the platform kills the function, and the work-status and
// repo-refresh results already collected are never reported. The cron dies with
// nothing useful in the log — which is exactly the failure repo-refresh's
// CRON_WARM_TIMEOUT_MS and work-status's per-query bounds exist to prevent.
//
// The stall is reproduced here rather than described: the fetch stub honours
// the AbortSignal it is handed and rejects with `signal.reason`, which is what
// a real fetch does. `AbortSignal.timeout`'s reason is a DOMException named
// `TimeoutError`, so these cases exercise the genuine path — with the budget
// turned down to 80ms so the suite does not wait ten seconds to find out.

// Generated per run, never written down: see tests/helpers/secrets.js.
const CRON_SECRET = freshCronSecret();
const TIMEOUT_MS = 80;

vi.mock('@/lib/guestbook/redisDriver', () => ({
  // `eval` runs the compare-and-set that publishes the baseline. Every case in
  // this file fails upstream of it, so it only has to exist and succeed.
  redis: { get: async () => null, set: async () => 'OK', eval: async () => 1 },
  redisAvailable: true,
}));

/** A fetch that never settles on its own — only when the signal aborts. */
const stall = (signal) =>
  new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason));
  });

const okJson = (body) => ({ ok: true, status: 200, json: async () => body });

// Which upstream should hang on this run: 'token', 'analytics', or null.
let stallTarget = null;
// Set by a case that wants a non-timeout failure instead.
let throwInstead = null;
let seenSignals = [];

let GET;
let realFetch;

beforeAll(async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.SEO_REPORT_TIMEOUT_MS = String(TIMEOUT_MS);
  process.env.GSC_SERVICE_ACCOUNT_KEY = Buffer.from(
    JSON.stringify({
      client_email: 'seo-report@test.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }),
  ).toString('base64');

  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    const isToken = target.startsWith('https://oauth2.googleapis.com/token');
    seenSignals.push({
      target: isToken ? 'token' : 'analytics',
      signal: init.signal,
    });

    if (
      throwInstead &&
      ((isToken && throwInstead === 'token') ||
        (!isToken && throwInstead === 'analytics'))
    ) {
      throw new TypeError('fetch failed');
    }
    if (isToken) {
      if (stallTarget === 'token') return stall(init.signal);
      return okJson({ access_token: 'test' });
    }
    if (stallTarget === 'analytics') return stall(init.signal);
    return okJson({ rows: [] });
  };

  ({ GET } = await import('@/app/api/seo-report/route'));
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  stallTarget = null;
  throwInstead = null;
  seenSignals = [];
});

const call = () =>
  GET(
    new Request('http://localhost/api/seo-report', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    }),
  );

describe('seo-report bounds every upstream call', () => {
  it('hands an abort signal to both the token and the analytics requests', async () => {
    const response = await call();
    expect(response.status).toBe(200);

    // One token exchange plus three analytics queries.
    expect(seenSignals).toHaveLength(4);
    expect(seenSignals.filter((s) => s.target === 'token')).toHaveLength(1);
    expect(seenSignals.filter((s) => s.target === 'analytics')).toHaveLength(3);
    for (const { signal } of seenSignals) {
      expect(
        signal,
        'every upstream call must carry a deadline',
      ).toBeInstanceOf(AbortSignal);
    }
  });

  it('answers 502 instead of hanging when the token exchange stalls', async () => {
    stallTarget = 'token';
    const started = Date.now();

    const response = await call();

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.ok).toBe(false);
    // Names the step and the budget, so a cron log says what gave up and after
    // how long rather than reporting a dead function.
    expect(body.error).toBe(`token exchange timed out after ${TIMEOUT_MS}ms`);
    // Bounded in fact, not just in intent.
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('answers 502 instead of hanging when a Search Console query stalls', async () => {
    stallTarget = 'analytics';
    const started = Date.now();

    const response = await call();

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toMatch(
      /^searchAnalytics\([a-z]+\) timed out after \d+ms$/,
    );
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('never puts a credential in the timeout message', async () => {
    // The token request body carries a signed JWT assertion and the analytics
    // requests carry a bearer token. This route's errors are readable by anyone
    // holding CRON_SECRET, so the label must name the step and nothing else.
    stallTarget = 'token';
    const body = await (await call()).json();

    expect(body.error).not.toMatch(/Bearer|assertion|PRIVATE KEY|eyJ/i);
    expect(body.error).toBe(`token exchange timed out after ${TIMEOUT_MS}ms`);
  });

  it('leaves a non-timeout failure to propagate as itself', async () => {
    // The helper only rewrites TimeoutError. A DNS or socket failure keeps its
    // own message, which is more useful than "timed out" would be.
    throwInstead = 'token';
    const body = await (await call()).json();

    expect(body.ok).toBe(false);
    expect(body.error).toBe('fetch failed');
  });
});
