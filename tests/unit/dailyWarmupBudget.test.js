import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

  /**
   * A downstream that answers 200 HEADERS and then stalls streaming its body.
   *
   * `fetch` resolves as soon as the headers arrive, so this is not the same
   * failure as `hangs()` above: the request succeeds and it is the BODY read the
   * deadline lands on. That difference is the whole case — the step has a real
   * `res.ok === true` to report by the time anything goes wrong.
   */
  const stallsMidBody = () => (_url, options) => {
    const signal = options?.signal;
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () =>
        new Promise((_, reject) => {
          if (signal?.aborted) reject(signal.reason);
          signal?.addEventListener('abort', () => reject(signal.reason));
        }),
    });
  };

  /**
   * The same 200-then-stall, by a runtime that does NOT abort its body stream.
   *
   * `stallsMidBody` above models a well-behaved runtime: the signal fires and
   * the read rejects. This one takes that away — the read never settles, for
   * any reason — which is the case a deadline expressed only as a `signal`
   * cannot reach. Aborting a fetch is supposed to abort its body, so undici
   * does reject here in practice; that is exactly what makes the gap invisible
   * until a runtime disagrees, and why the bound is raced rather than assumed.
   */
  const stallsMidBodyDeaf = () => () =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => new Promise(() => {}),
    });

  it('returns a verdict when a body read ignores the deadline entirely', async () => {
    // The failure this prevents is the worst one available to this route, and
    // it is silent: an unsettled `res.text()` leaves `callInternal` pending, so
    // `Promise.allSettled` never resolves, the handler never returns, and the
    // platform kills the function with no body, no per-step results and no
    // non-2xx for a cron monitor to alarm on. Not a wrong verdict — NO verdict,
    // which is the outcome the run budget was added to make impossible.
    //
    // Without the race this case does not fail an assertion, it HANGS to the
    // test timeout — the same shape as production, which is the point.
    globalThis.fetch = stallsMidBodyDeaf();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = Date.now();

    const GET = await loadRoute(60);
    const response = await GET(authed());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    for (const key of ['workStatus', 'repoRefresh', 'seoReport']) {
      // Classified as a budget breach rather than a downstream fault: the race
      // rejects with the signal's own reason, so it lands on the same check a
      // request-level abort takes.
      expect(body.results[key].timedOut).toBe(true);
    }
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('fails the run when a step stalls mid-body on a 200', async () => {
    globalThis.fetch = stallsMidBody();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const GET = await loadRoute(60);
    const response = await GET(authed());
    const body = await response.json();

    // The regression in one line: this was 200, all green, after the deadline
    // had already expired. `ok: res.ok` was true because the headers really did
    // say 200 — the abort was swallowed one line above it.
    expect(
      response.status,
      'An all-green verdict after the run budget was exceeded is the one ' +
        'outcome this orchestrator exists to prevent — the cron monitor reads ' +
        'the verdict and nothing else.',
    ).toBe(502);
    expect(body.ok).toBe(false);

    for (const key of ['workStatus', 'repoRefresh', 'seoReport']) {
      expect(body.results[key].ok).toBe(false);
      // Classified as a budget breach, not a downstream fault: re-throwing the
      // signal's own reason is what keeps that true, since an aborted body read
      // surfaces under different error names across runtimes.
      expect(body.results[key].timedOut).toBe(true);
    }
  });

  it('still reports a 200 whose body is unreadable for its own reasons', async () => {
    // The other side of the same branch, and the reason it is a condition on
    // `signal.aborted` rather than on any body failure: the response completed,
    // the status is real, and only `detail` is missing. Flattening both into a
    // failure would fail healthy runs whenever a body could not be decoded.
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => {
        throw new Error('malformed chunked encoding');
      },
    });

    const GET = await loadRoute(60);
    const response = await GET(authed());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results.workStatus.ok).toBe(true);
    expect(body.results.workStatus.detail).toBeNull();
    expect(body.results.workStatus.timedOut).toBeUndefined();
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
    expect(body.results.workStatus.error).toBe('Downstream request failed');
    expect(body.results.workStatus.timedOut).toBeUndefined();
  });

  it('keeps transport internals out of the response body', async () => {
    // A rejected `fetch` carries the resolved host and port, DNS state or TLS
    // detail in its message. This route answers to whoever holds CRON_SECRET,
    // not only to Vercel's scheduler, and the house rule is that API routes
    // return display data — so the message is fixed and the raw error stays in
    // the log. Modelled on the real shape rather than a bare word, so a partial
    // fix that trimmed the message instead of replacing it still fails.
    const raw = 'connect ECONNREFUSED 10.1.2.3:3000';
    globalThis.fetch = async () => {
      throw new Error(raw);
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const GET = await loadRoute(60);
    const body = await (await GET(authed())).json();

    const serialised = JSON.stringify(body);
    for (const leak of ['ECONNREFUSED', '10.1.2.3', '3000']) {
      expect(
        serialised,
        `The response body carries "${leak}" from the raw exception.`,
      ).not.toContain(leak);
    }

    // The other half of the rule, and the reason flattening costs nothing: the
    // diagnosis is still recorded, just not returned. Asserted on the logged
    // ERROR OBJECT rather than the formatted string, since that is what carries
    // the stack an operator actually needs.
    const logged = errorSpy.mock.calls.flat();
    expect(
      logged.some((arg) => arg instanceof Error && arg.message === raw),
      'The raw exception should still reach console.error.',
    ).toBe(true);
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

  // ── The budget has to expire before the platform does ─────────────────────
  // A wall-clock deadline is only a bound if the function outlives it. The
  // default was 45 s against a comment that said the platform limit was "60 s,
  // lower on smaller plans" — so on the smaller of its own two claims the
  // signal could never fire, and the run would be killed with no body, no
  // per-step results and no verdict: the exact outcome the budget exists to
  // prevent. The route now DECLARES the duration it needs, so a plan that
  // cannot grant it fails at deploy time instead of at 01:00.
  it('declares a function duration the default budget fits inside', async () => {
    // No env override: the claim is about the DEFAULT's relationship to the
    // ceiling, which is what a deployment actually runs with.
    delete process.env.CRON_RUN_BUDGET_MS;
    vi.resetModules();
    const route = await import('@/app/api/daily-warmup/route');

    // Declared at all. Without this the function silently takes the account's
    // default duration — the unstated assumption that made the old number a
    // bet rather than a bound.
    expect(typeof route.maxDuration).toBe('number');
    expect(route.maxDuration).toBeGreaterThan(0);

    // The default must be DERIVED from that ceiling rather than typed as a
    // literal beside it, because a literal is what drifts: raising the declared
    // duration and forgetting the budget leaves the run bounded by the old
    // number, and lowering it leaves the budget unreachable again with nothing
    // to notice. Read off the source, since the constant is module-private on
    // purpose (see `loadRoute` above) and a copy of it here would be one more
    // thing to keep in step.
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/api/daily-warmup/route.js'),
      'utf8',
    );
    const [, fraction] = source.match(
      /RUN_BUDGET_CEILING_MS\s*=\s*maxDuration \* 1000 \* (0\.\d+)/,
    ) ?? [];
    expect(
      fraction,
      'The default run budget should be a fraction of `maxDuration`, not a ' +
        'literal that can drift away from it.',
    ).toBeTruthy();

    const ceilingMs = route.maxDuration * 1000;
    const budgetMs = ceilingMs * Number(fraction);

    // Asserted as a range, not a pair of magic numbers: the properties that
    // matter are that the deadline expires FIRST, that what remains is enough
    // to key the results, log and serialise a body, and that the budget still
    // covers the ~30 s worst case of three concurrent cold starts — otherwise
    // it would abort healthy work every slow night.
    expect(budgetMs).toBeLessThan(ceilingMs);
    expect(ceilingMs - budgetMs).toBeGreaterThanOrEqual(5000);
    expect(budgetMs).toBeGreaterThanOrEqual(30000);
  });

  it('cannot have that ceiling raised by the env override', async () => {
    // Deriving the DEFAULT from `maxDuration` fixed the drift only for
    // deployments that leave the knob alone. `envPositiveMs` takes any finite
    // positive number, so `CRON_RUN_BUDGET_MS=120000` put the deadline past the
    // platform's own — a budget that cannot expire before the function is
    // killed is no budget, and the results are discarded at 60 s exactly as
    // they were before any of this existed. `Infinity` was already refused for
    // that reason; every number large enough to mean the same thing was not.
    //
    // ── Read off the source, and this is the honest limit of it ──────────────
    // The clamped value is observable only through the breach message, and
    // observing it means letting a stalled run reach the ceiling — 45 s, in a
    // suite that runs in nine. So this asserts the SHAPE of the expression, in
    // the same spirit and for the same reason as the case above (the constant
    // is module-private on purpose). It would survive a rewrite into something
    // equivalent that does not mention `Math.min`; it would not survive the
    // clamp being dropped, which is the regression that matters.
    //
    // The other direction is already covered behaviourally: every stall case
    // above loads the route at 60 ms, so a clamp written the wrong way round
    // (`Math.max`) would pin them to 45 s and time the suite out rather than
    // quietly passing.
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/api/daily-warmup/route.js'),
      'utf8',
    );
    const [, budgetExpression] =
      source.match(/const RUN_BUDGET_MS =([\s\S]*?);\n/) ?? [];

    expect(budgetExpression, 'RUN_BUDGET_MS should still exist').toBeTruthy();
    expect(
      budgetExpression,
      'The env override must be combined with the platform-derived ceiling ' +
        'rather than used raw, or a large value disables the deadline entirely.',
    ).toContain('Math.min');
    expect(budgetExpression).toContain('CRON_RUN_BUDGET_MS');
    // Both operands, not one: a `Math.min` over the override alone would read
    // as a clamp and bound nothing.
    expect(
      budgetExpression.match(/RUN_BUDGET_CEILING_MS/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
  });
});
