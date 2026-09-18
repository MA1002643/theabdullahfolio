import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

// `eval` runs the compare-and-set that publishes the baseline. Most cases in
// this file fail upstream of it, so it only has to exist and succeed — but one
// needs it to FAIL, because the storage calls sit inside the same try as the
// upstream ones and their messages are the least safe thing in the block.
const { redisStub } = vi.hoisted(() => ({ redisStub: { failWith: null } }));

vi.mock('@/lib/guestbook/redisDriver', () => {
  const failIfAsked = () => {
    if (redisStub.failWith) throw new Error(redisStub.failWith);
  };
  return {
    redis: {
      get: async () => {
        failIfAsked();
        return null;
      },
      set: async () => 'OK',
      eval: async () => 1,
    },
    redisAvailable: true,
  };
});

/** A fetch that never settles on its own — only when the signal aborts. */
const stall = (signal) =>
  new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason));
  });

const okJson = (body) => ({ ok: true, status: 200, json: async () => body });

// ── A stall AFTER the headers ───────────────────────────────────────────────
// `fetch` settles when the response headers arrive, with the body still
// streaming — so a 200 proves nothing about how long reading it takes. These
// stubs are that server: status and headers immediately, then a body that never
// finishes. `deaf` is the same stall by a runtime that does NOT abort its body
// stream when the signal fires, which is the case a relabel alone cannot save.
const okStallingBody = (signal, deaf) => ({
  ok: true,
  status: 200,
  json: () => (deaf ? new Promise(() => {}) : stall(signal)),
});

// Which upstream should hang on this run: 'token', 'analytics', or null.
let stallTarget = null;
// WHERE it hangs: before the headers, part-way through the body, or part-way
// through the body on a runtime that ignores the abort.
let stallPhase = 'headers';
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
    const stalls = isToken
      ? stallTarget === 'token'
      : stallTarget === 'analytics';
    if (stalls && stallPhase !== 'headers') {
      return okStallingBody(init.signal, stallPhase === 'body-deaf');
    }
    if (isToken) {
      if (stalls) return stall(init.signal);
      return okJson({ access_token: 'test' });
    }
    if (stalls) return stall(init.signal);
    return okJson({ rows: [] });
  };

  ({ GET } = await import('@/app/api/seo-report/route'));
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  stallTarget = null;
  stallPhase = 'headers';
  throwInstead = null;
  seenSignals = [];
  redisStub.failWith = null;
});

/**
 * Everything a console spy was handed, as text.
 *
 * `JSON.stringify` cannot be used here: an Error serialises to `{}`, so a naive
 * assertion passes whatever the log holds — which would make "the diagnosis
 * moved to the log" a claim this suite never actually checks.
 */
const loggedText = (spy) =>
  spy.mock.calls
    .flat()
    .map((arg) => (arg instanceof Error ? arg.message : String(arg)))
    .join('\n');

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

  it('answers 502 when the token response stalls part-way through its body', async () => {
    // The gap the headers-only bound left open: Google answers 200 in
    // milliseconds and then stops sending. The request "succeeded", so a bound
    // that ends at `fetch` is already spent, and the read that follows it is
    // what the function actually sits in.
    stallTarget = 'token';
    stallPhase = 'body';
    const started = Date.now();

    const response = await call();

    expect(response.status).toBe(502);
    const body = await response.json();
    // The SAME message as a pre-headers stall. A slow body is the same event to
    // whoever reads the cron log — this upstream did not answer in time — and
    // reporting it as a bare "aborted" would hide which of the four calls it was.
    expect(body.error).toBe(`token exchange timed out after ${TIMEOUT_MS}ms`);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('answers 502 when a Search Console response stalls part-way through its body', async () => {
    stallTarget = 'analytics';
    stallPhase = 'body';
    const started = Date.now();

    const response = await call();

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toMatch(
      /^searchAnalytics\([a-z]+\) timed out after \d+ms$/,
    );
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('bounds the body read even if the runtime never aborts the stream', async () => {
    // Aborting a fetch is supposed to abort its body stream, so `json()` should
    // reject by itself. This case takes that away: the read never settles, for
    // any reason. The deadline is this route's promise to the orchestrator that
    // invokes it, so it cannot rest on the runtime keeping one of its own.
    stallTarget = 'analytics';
    stallPhase = 'body-deaf';
    const started = Date.now();

    const response = await call();

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toMatch(
      /^searchAnalytics\([a-z]+\) timed out after \d+ms$/,
    );
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('does not quote a non-timeout failure it did not write', async () => {
    // This case used to assert the OPPOSITE — that undici's `fetch failed`
    // reached the response verbatim — on the reasoning that a socket failure's
    // own message is more useful than "timed out" would be. It is, in the LOG.
    // In the body it is a description of this deployment's network written by
    // somebody else, and /api/daily-warmup forwards this body as its own
    // `detail`, so it travels to every holder of CRON_SECRET.
    throwInstead = 'token';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const body = await (await call()).json();

    expect(body.ok).toBe(false);
    expect(body.error).not.toContain('fetch failed');
    expect(body.error).toBe('Search Console report failed; see server logs');
    // Not a timeout, and the field says so rather than leaving it to be read
    // out of a message that is now fixed for every unquotable failure.
    expect(body.timedOut).toBeUndefined();
    // The diagnosis is not lost, it moved.
    expect(loggedText(errorSpy)).toContain('fetch failed');
  });

  it('does not quote a storage failure, which is the least safe of them', async () => {
    // The four `redis` calls live inside the same try as the upstream ones, and
    // `@upstash/redis` rejects with its own wording — which can name the REST
    // endpoint that is half of `KV_REST_API_URL`, a credential by this repo's
    // own table. Nothing in the old "overwhelmingly our own labels" reasoning
    // covered them.
    redisStub.failWith =
      'fetch failed: https://eu2-notreal-12345.upstash.io (token AXY_notreal)';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(502);
    const serialised = JSON.stringify(body);
    for (const leak of ['upstash.io', 'eu2-notreal', 'AXY_notreal']) {
      expect(
        serialised,
        `The 502 body carries "${leak}" from the storage error.`,
      ).not.toContain(leak);
    }
    expect(body.error).toBe('Search Console report failed; see server logs');
    // And the operator still gets the whole thing, where it belongs.
    expect(loggedText(errorSpy)).toContain('upstash.io');
  });

  it('still quotes the labels it wrote itself, and flags the timeout', async () => {
    // The half that must not be lost to the fix: naming WHICH of four upstream
    // calls stalled is the entire value of the relabel, and a blanket fixed
    // string would have deleted it to close a leak those labels never had.
    stallTarget = 'analytics';
    const body = await (await call()).json();

    expect(body.error).toMatch(
      /^searchAnalytics\([a-z]+\) timed out after \d+ms$/,
    );
    expect(body.timedOut).toBe(true);
  });
});

// ── The bounds are only bounds if the function outlives them ────────────────
// Everything above proves this route gives up on a stalled upstream and answers
// 502. None of it proves the function is still ALIVE to answer: the two phases
// each get UPSTREAM_TIMEOUT_MS, so ~20 s of in-budget work runs against a
// duration this route never declared — whatever the account default happens to
// be, in a repository whose other GitHub routes are written for a 10 s ceiling.
// Killed at the limit there is no 502, no relabelled message naming which call
// stalled, and the orchestrator sees only a dead socket.
describe('seo-report declares the duration its bounds assume', () => {
  const SOURCE = readFileSync(
    path.join(process.cwd(), 'src/app/api/seo-report/route.js'),
    'utf8',
  );

  it('declares a function duration both bounded phases fit inside', async () => {
    const route = await import('@/app/api/seo-report/route');

    // Declared at all — without this the bound above is measured against an
    // unstated number, which is what made it a bet rather than a guarantee.
    expect(typeof route.maxDuration).toBe('number');
    expect(route.maxDuration).toBeGreaterThan(0);

    // Read off the source, since these constants are module-private on purpose
    // and this suite has already imported the route with the budget turned down
    // to 80ms. The claim is about the DEFAULT's relationship to the declared
    // duration, which is what a deployment actually runs with.
    const [, fraction] =
      SOURCE.match(
        /UPSTREAM_TIMEOUT_CEILING_MS\s*=\s*\(maxDuration \* 1000 \* (0\.\d+)\)\s*\/\s*UPSTREAM_PHASES/,
      ) ?? [];
    expect(
      fraction,
      'The per-call ceiling should be a fraction of `maxDuration`, not a ' +
        'literal that can drift away from it.',
    ).toBeTruthy();

    const [, phases] = SOURCE.match(/UPSTREAM_PHASES = (\d+)/) ?? [];
    const [, defaultMs] =
      SOURCE.match(
        /envPositiveMs\(\s*process\.env\.SEO_REPORT_TIMEOUT_MS,\s*(\d+)/,
      ) ?? [];
    expect(phases).toBeTruthy();
    expect(defaultMs).toBeTruthy();

    // Both phases are sequential — token exchange, then the parallel queries —
    // so the worst case is their SUM, and it is the sum that has to fit.
    const durationMs = route.maxDuration * 1000;
    const worstCaseMs = Number(defaultMs) * Number(phases);

    expect(worstCaseMs).toBeLessThan(durationMs);
    // Asserted as a range rather than a pair of magic numbers: what matters is
    // that the deadline expires FIRST and that what remains is enough for the
    // Upstash writes and serialising a body the cron can read, neither of which
    // is an upstream call or carries a bound of its own.
    expect(durationMs - worstCaseMs).toBeGreaterThanOrEqual(5000);

    // And the default must survive its own clamp. A default above the ceiling
    // would be silently lowered, leaving this file's arithmetic describing a
    // timeout no deployment actually runs with.
    const ceilingMs = (durationMs * Number(fraction)) / Number(phases);
    expect(Number(defaultMs)).toBeLessThanOrEqual(ceilingMs);
  });

  it('cannot have that ceiling raised by the env override', async () => {
    // `envPositiveMs` guarantees finite and positive, not USABLE: at
    // `SEO_REPORT_TIMEOUT_MS=60000` a single phase outlasts the whole declared
    // duration, so the function is killed before its own deadline can fire —
    // the bound switched off through the knob that tunes it, which is the
    // defect already fixed for `CRON_RUN_BUDGET_MS` one route over.
    //
    // The shape is asserted rather than the behaviour, and this is the honest
    // limit of it: observing the clamped value means letting a stalled phase
    // reach 11 s in a suite that runs in one. It would survive an equivalent
    // rewrite that does not mention `Math.min`; it would not survive the clamp
    // being dropped, which is the regression that matters.
    const [, expression] =
      SOURCE.match(/const UPSTREAM_TIMEOUT_MS =([\s\S]*?);\n/) ?? [];

    expect(expression, 'UPSTREAM_TIMEOUT_MS should still exist').toBeTruthy();
    expect(
      expression,
      'The env override must be combined with the duration-derived ceiling ' +
        'rather than used raw, or one phase can outlive the whole function.',
    ).toContain('Math.min');
    expect(expression).toContain('SEO_REPORT_TIMEOUT_MS');
    expect(expression).toContain('UPSTREAM_TIMEOUT_CEILING_MS');
  });
});
