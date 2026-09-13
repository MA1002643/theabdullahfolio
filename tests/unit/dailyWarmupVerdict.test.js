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
});
