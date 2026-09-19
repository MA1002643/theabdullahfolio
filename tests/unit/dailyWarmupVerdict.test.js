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

// ── The verdict is the whole product of this route ──────────────────────────
// /api/daily-warmup fans out to three steps and returns one status code, and
// that code is the ONLY thing platform cron monitoring looks at. A wrong
// verdict is therefore invisible in exactly the way that matters: the run is
// green, the alert never fires, and the first sign of trouble is noticing
// weeks later that a report stopped arriving.
//
// seo-report used to be excluded from the verdict unconditionally. That was
// correct while `GSC_SERVICE_ACCOUNT_KEY` was unset — a nightly alarm about an
// unconfigured step teaches people to ignore alarms — but it meant that once
// configured, an expired key, revoked property access, a Search Console outage
// or an Upstash failure all still returned 200.
//
// These cases pin the line: optional exactly while the integration is absent,
// counted the moment it is not, and erring toward counted whenever the answer
// is ambiguous.

// Generated per run, never written down: see tests/helpers/secrets.js.
const CRON_SECRET = freshCronSecret();
const ENDPOINT = 'http://localhost/api/daily-warmup';

/** A `callInternal`-shaped fetch response. */
const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

const OK = reply(200, { ok: true });
// What /api/seo-report actually answers when the credential is absent.
const NOT_CONFIGURED = reply(503, {
  ok: false,
  skipped: 'GSC_SERVICE_ACCOUNT_KEY is not configured',
});

let GET;
let realFetch;
let routes;

beforeAll(async () => {
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.BASE_URL = 'http://localhost';
  realFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/api/work-status')) return routes.workStatus;
    if (target.includes('/api/repo-refresh')) return routes.repoRefresh;
    if (target.includes('/api/seo-report')) return routes.seoReport;
    throw new Error(`unexpected fetch in test: ${target}`);
  };

  ({ GET } = await import('@/app/api/daily-warmup/route'));
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Run the route with the three downstreams answering as given. */
async function run({ workStatus = OK, repoRefresh = OK, seoReport = OK } = {}) {
  routes = { workStatus, repoRefresh, seoReport };
  const response = await GET(
    new Request(ENDPOINT, {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    }),
  );
  return { status: response.status, body: await response.json() };
}

describe('daily-warmup verdict', () => {
  it('is green when all three steps succeed', async () => {
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results.seoReport.notConfigured).toBeUndefined();
  });

  it('fails the run when seo-report fails, once it is configured', async () => {
    // The regression this file exists for. An expired service-account key, a
    // revoked property, a Search Console outage and an Upstash error all land
    // here as a 502 from the downstream — and all used to return 200.
    const { status, body } = await run({
      seoReport: reply(502, { ok: false, error: 'token exchange failed' }),
    });
    expect(status).toBe(502);
    expect(body.ok).toBe(false);
    // The reason stays readable in the body rather than only in the status.
    expect(body.results.seoReport.detail).toContain('token exchange failed');
  });

  it('stays green while the Search Console integration is unset', async () => {
    // The case the original exclusion was protecting, still protected.
    const { status, body } = await run({ seoReport: NOT_CONFIGURED });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    // and is visible as an opt-out rather than indistinguishable from success.
    expect(body.results.seoReport.notConfigured).toBe(true);
    expect(body.results.seoReport.ok).toBe(false);
  });

  it('counts a 503 that gives no reason', async () => {
    // Fails closed: "unavailable" without a `skipped` reason is not the
    // documented not-configured answer, so it is a failure.
    const { status } = await run({ seoReport: reply(503, { ok: false }) });
    expect(status).toBe(502);
  });

  it('counts a 503 whose body is not JSON at all', async () => {
    // A platform error page, a proxy timeout — anything unparseable must not
    // be read as a deliberate opt-out.
    const { status } = await run({
      seoReport: reply(503, '<html>Service Unavailable</html>'),
    });
    expect(status).toBe(502);
  });

  it('counts a non-503 that happens to carry a skipped field', async () => {
    // `skipped` alone does not excuse a step; the status has to agree.
    const { status } = await run({
      seoReport: reply(500, { ok: false, skipped: 'nope' }),
    });
    expect(status).toBe(502);
  });

  it('counts a 503 carrying `skipped` without the `ok: false` beside it', async () => {
    // The excused answer is a SHAPE — `{ ok: false, skipped: '…' }` — and half
    // of it was going unchecked, so a 503 body that merely contains the word
    // was forgiven. A proxy envelope, an error wrapper, or a future handler
    // reusing the field would have kept the cron green while nothing was
    // stored, which is the blind spot `isNotConfigured` exists to close.
    const { status } = await run({
      seoReport: reply(503, { skipped: 'temporary outage' }),
    });
    expect(status).toBe(502);
  });

  it('counts a thrown fetch, which has no status at all', async () => {
    routes = { workStatus: OK, repoRefresh: OK };
    const response = await GET(
      new Request(ENDPOINT, {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    // seo-report's fetch throws (the stub has no entry for it), so the route's
    // own catch supplies `{ ok: false, error }` with no `status` field.
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.results.seoReport.ok).toBe(false);
    expect(body.results.seoReport.notConfigured).toBeUndefined();
  });

  it('still fails on the other two steps regardless of seo-report', async () => {
    expect((await run({ workStatus: reply(500, { ok: false }) })).status).toBe(
      502,
    );
    expect((await run({ repoRefresh: reply(500, { ok: false }) })).status).toBe(
      502,
    );
    // Including when seo-report opted out — a skipped step must not rescue a
    // genuinely failed run.
    expect(
      (
        await run({
          workStatus: reply(500, { ok: false }),
          seoReport: NOT_CONFIGURED,
        })
      ).status,
    ).toBe(502);
  });

  it('refuses an unauthenticated caller before fanning out at all', async () => {
    routes = { workStatus: OK, repoRefresh: OK, seoReport: OK };
    const response = await GET(new Request(ENDPOINT));
    expect(response.status).toBe(401);
  });

  // ── A 2xx is not a verdict ────────────────────────────────────────────────
  // `/api/repo-refresh` warms two caches and answers 200 when only the
  // experience-summary half failed — a best-effort semantic it documents on
  // purpose. This route judged every step by HTTP status alone, so that
  // half-failure arrived as an all-green cron: the body said `ok: false` and
  // nothing read it. The step's own report now counts.
  it('counts a 200 whose body reports failure', async () => {
    // Exactly what repo-refresh answers when the experience warm fails: 200,
    // `ok: false`, and the failing half named in its own field.
    const { status, body } = await run({
      repoRefresh: reply(200, {
        ok: false,
        githubStats: { ok: true, attempted: true },
        experience: {
          ok: false,
          attempted: true,
          error: 'experience-summary warm failed',
        },
      }),
    });

    expect(status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.results.repoRefresh.ok).toBe(false);
    // Distinguishable from a step that answered 502 — the status it really
    // gave is still reported beside the marker.
    expect(body.results.repoRefresh.status).toBe(200);
    expect(body.results.repoRefresh.bodyReportedFailure).toBe(true);
  });

  it('leaves a step with no `ok` field alone', async () => {
    // `/api/work-status` returns no `ok` at all, so "did it admit failure?"
    // must read as no rather than as yes — inventing an admission from a body
    // that says nothing would turn every healthy run red.
    const { status, body } = await run({
      workStatus: reply(200, { status: 'building', repo: 'theabdullahfolio' }),
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results.workStatus.bodyReportedFailure).toBeUndefined();
  });

  it('leaves a non-JSON 200 alone', async () => {
    // The status is the only verdict available for a plain-text body, and it
    // stands. Failing OPEN here is the deliberate opposite of `isNotConfigured`,
    // which must not let an ambiguous body excuse a step.
    //
    // The subject is `workStatus` on purpose, and the two cases below are why:
    // this claim is true of a step whose 2xx IS its verdict, and false of the
    // one whose 2xx is conditional.
    const { status, body } = await run({ workStatus: reply(200, 'warmed') });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  // ── A 200 that cannot be corroborated, from the step that needs to be ──────
  // repo-refresh answers 200 when only the experience half failed, so its body
  // is the verdict. Reading only an explicit `ok: false` out of it meant every
  // OTHER unreadable answer — an intermediary's HTML error page, a truncated
  // payload, a body that never arrived — came back `ok: res.ok`, which is true.
  // The false green this route exists to prevent, reached by saying nothing
  // instead of by saying the wrong thing.
  it('counts a 200 whose body cannot be read as a verdict', async () => {
    const { status, body } = await run({ repoRefresh: reply(200, 'warmed') });

    expect(status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.results.repoRefresh.ok).toBe(false);
    // The status it really gave is still reported, and the marker says which
    // kind of not-ok this is: it did not admit failure, it failed to answer.
    expect(body.results.repoRefresh.status).toBe(200);
    expect(body.results.repoRefresh.bodyUnverified).toBe(true);
    expect(body.results.repoRefresh.bodyReportedFailure).toBeUndefined();
  });

  it('counts a 200 from that step whose JSON carries no verdict at all', async () => {
    // Valid JSON, and still not an answer. `/api/repo-refresh` sets `ok` on
    // every 2xx it emits, so a 200 without it did not come from that handler —
    // which is exactly the case a `!== false` test waves through.
    const { status, body } = await run({
      repoRefresh: reply(200, { warmed: true }),
    });

    expect(status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.results.repoRefresh.bodyUnverified).toBe(true);
  });

  it('still lets that step pass on the answer it actually gives', async () => {
    // The control, and the half that must not change: corroboration has to be
    // satisfiable by the real response, or this is just a nightly red light.
    // Verbatim what repo-refresh returns when both warms land.
    const { status, body } = await run({
      repoRefresh: reply(200, {
        ok: true,
        githubStats: { ok: true, attempted: true },
        experience: { ok: true, attempted: true, status: 200 },
      }),
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results.repoRefresh.bodyUnverified).toBeUndefined();
  });

  it('does not let a body-reported failure count as "not configured"', async () => {
    // A 503 + `skipped` is the opt-out; a 200 + `ok: false` is a failure. The
    // two must not be confused now that both are read out of the body.
    const { status, body } = await run({
      seoReport: reply(200, { ok: false, skipped: 'not really' }),
    });

    expect(status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.results.seoReport.notConfigured).toBeUndefined();
  });
});
