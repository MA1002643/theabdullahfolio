import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { freshCronSecret } from '../helpers/secrets.js';

// ── The run has to come back, and a serial chain could not promise that ─────
// /api/daily-warmup is the site's ONLY cron (Hobby caps cron count, which is
// why three jobs share one schedule), so a run that gets killed takes every
// step with it and reports nothing — no body, no per-step results, no non-2xx
// for platform monitoring to alarm on. The failure looks like silence.
//
// Each downstream bounds itself, and that was mistaken for the orchestrator
// being bounded. Awaited one after another the budgets ADD:
//
//   work-status ~10 s  +  repo-refresh ~30 s  +  seo-report ~20 s  =  ~60 s
//
// of legitimate, in-budget work, against a platform function limit this
// repository documents as 60 s and which is lower on smaller plans. Adding the
// seo-report step is what pushed it over; the shape was already there.
//
// These cases pin the two properties that fix it, and they are separate claims:
// the steps OVERLAP (worst case is the slowest step, not the sum), and the run
// is bounded by a deadline of its own EVEN IF a downstream ignores its own
// budget entirely — which is the case concurrency alone cannot cover, since
// three concurrent hangs hang just as permanently as one.

const CRON_SECRET = freshCronSecret();
const ENDPOINT = 'http://localhost/api/daily-warmup';

const OK = {
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ ok: true }),
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let realFetch;

beforeAll(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.BASE_URL = 'http://localhost';
  realFetch = globalThis.fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.CRON_RUN_BUDGET_MS;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Import the route with a given run budget.
 *
 * `RUN_BUDGET_MS` is read at MODULE scope — deliberately, so the knob cannot be
 * changed per request — so the env var has to be set before the import, and the
 * module registry reset between cases that use different budgets.
 */
async function loadRoute(budgetMs) {
  vi.resetModules();
  if (budgetMs === undefined) delete process.env.CRON_RUN_BUDGET_MS;
  else process.env.CRON_RUN_BUDGET_MS = String(budgetMs);
  return (await import('@/app/api/daily-warmup/route')).GET;
}

const authed = () =>
  new Request(ENDPOINT, { headers: { authorization: `Bearer ${CRON_SECRET}` } });

describe('daily-warmup — the steps overlap', () => {
  it('has all three downstreams in flight at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let release;
    const allStarted = new Promise((resolve) => {
      release = resolve;
    });

    globalThis.fetch = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (inFlight === 3) release();
      // Whichever happens first. The barrier is what a CONCURRENT run trips
      // immediately; the delay is what keeps a SERIAL run from deadlocking on a
      // barrier its own serialisation prevents it from ever reaching — so a
      // regression fails this assertion instead of hanging the suite.
      await Promise.race([allStarted, delay(150)]);
      inFlight -= 1;
      return OK;
    };

    const GET = await loadRoute();
    const response = await GET(authed());

    expect(response.status).toBe(200);
    expect(
      maxInFlight,
      'Expected all three steps in flight together. maxInFlight of 1 means the ' +
        'route went back to awaiting them one at a time, and the downstream ' +
        'budgets sum past the platform function limit.',
    ).toBe(3);
  });
});

describe('daily-warmup — the run budget', () => {
  /** A downstream that never answers until the caller gives up on it. */
  const hangs = () => (_url, options) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(OK), 10000);
      options?.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(options.signal.reason);
      });
    });

  it('returns a verdict instead of hanging when every step stalls', async () => {
    globalThis.fetch = hangs();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const GET = await loadRoute(60);
    const response = await GET(authed());
    const body = await response.json();

    // The whole point: a bounded, reported failure rather than a function the
    // platform kills while it is still waiting.
    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    for (const key of ['workStatus', 'repoRefresh', 'seoReport']) {
      expect(body.results[key].ok).toBe(false);
      expect(
        body.results[key].timedOut,
        `${key} should be recorded as a budget breach, not as a downstream fault`,
      ).toBe(true);
    }
  });

  it('still reports the steps that finished when one stalls', async () => {
    const stall = hangs();
    globalThis.fetch = async (url, options) => {
      if (String(url).includes('/api/repo-refresh')) return stall(url, options);
      return OK;
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const GET = await loadRoute(60);
    const body = await (await GET(authed())).json();

    // The results this route collected are exactly what a killed function threw
    // away, so losing them to one slow step would be the same defect one layer in.
    expect(body.results.workStatus.ok).toBe(true);
    expect(body.results.seoReport.ok).toBe(true);
    expect(body.results.repoRefresh.timedOut).toBe(true);
    expect(body.ok).toBe(false);
  });

  it('does not mark an ordinary downstream failure as a budget breach', async () => {
    globalThis.fetch = async () => {
      throw new Error('connection refused');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const GET = await loadRoute(60);
    const body = await (await GET(authed())).json();

    // `timedOut` is read by whoever is woken at 01:00 to decide whether the
    // budget is too tight or a downstream is broken. A flag set on every failure
    // would answer neither question.
    expect(body.results.workStatus.ok).toBe(false);
    expect(body.results.workStatus.error).toContain('connection refused');
    expect(body.results.workStatus.timedOut).toBeUndefined();
  });

  it('rejects a non-positive budget rather than aborting instantly', async () => {
    // `envPositiveMs` exists because `Number(env) || fallback` lets a negative
    // through, which here would abort every step before it began — a cron that
    // fails 100% of the time from one typo in an env var.
    globalThis.fetch = async () => OK;

    const GET = await loadRoute(-1);
    const response = await GET(authed());

    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });
});
