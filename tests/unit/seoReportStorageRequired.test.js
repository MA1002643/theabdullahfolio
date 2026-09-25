import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshCronSecret, freshSecret } from '../helpers/secrets.js';

// ── A configured integration that cannot store anything is broken, not dormant ─
// `/api/seo-report` answers 503 + `skipped` for exactly one condition, and that
// answer is a CONTRACT: it is the one thing `/api/daily-warmup` does not count
// against the run, so emitting it asserts "nothing is wrong, this is not set up
// yet".
//
// The Upstash guard used to claim it too. That guard sits AFTER the credential
// checks, so reaching it means `GSC_SERVICE_ACCOUNT_KEY` is present and usable —
// the integration is switched on — and the run still came back green every night
// while no snapshot was ever written.
//
// Worse than an ordinary silent failure, because it is self-concealing: every
// finding this route reports (new queries, dropped positions, low-CTR pages) is
// derived by comparing today's snapshot against the STORED previous one, so with
// no storage the feedback loop cannot start at all — and the single signal that
// would have said so was the one being suppressed. The same blind spot the
// verdict fix closed, re-entered one guard further down.
//
// These cases pin the line in both directions: storage is required once the
// credential is configured, and the credential being ABSENT is still the quiet,
// forgiven state it has to remain (alarming nightly about an integration nobody
// has set up is how people learn to ignore alarms).

const CRON_SECRET = freshCronSecret();
const ENDPOINT = 'https://ma.codes/api/seo-report';

// A credential that passes `readCredentials` — well-formed base64 JSON with both
// fields as non-empty strings. Never used to sign anything: every case here
// fails at the storage guard, which is BEFORE any Google call.
//
// `private_key` is GENERATED rather than written down, for the same reason
// tests/helpers/secrets.js exists: a key-shaped literal in a credential field is
// the string that gets copied into the next suite and eventually into something
// pointed at a real deployment, and CLAUDE.md §1 draws no exception for a test
// value. `client_email` stays pinned — it is an identifier, not a secret, and
// `example.invalid` is reserved by RFC 2606, the same reasoning that keeps
// `KV_REST_API_URL` readable in the other suites.
const USABLE_KEY = Buffer.from(
  JSON.stringify({
    client_email: 'unit-test@example.invalid',
    private_key: freshSecret('test-gsc-key'),
  }),
).toString('base64');

/** Import the route with the Upstash client absent, as unset KV vars produce. */
async function loadRouteWithoutRedis() {
  vi.resetModules();
  // `redis` is `const redis = url && token ? new Redis(...) : null` — null is
  // exactly what the route sees when KV_REST_API_URL / _TOKEN are unset.
  vi.doMock('@/lib/guestbook/redisDriver', () => ({
    redis: null,
    redisAvailable: false,
    redisDriver: {},
  }));
  return (await import('@/app/api/seo-report/route')).GET;
}

const authed = () =>
  new Request(ENDPOINT, { headers: { authorization: `Bearer ${CRON_SECRET}` } });

let errorSpy;

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@/lib/guestbook/redisDriver');
  delete process.env.GSC_SERVICE_ACCOUNT_KEY;
});

describe('seo-report — storage is required once configured', () => {
  it('fails rather than skipping when the credential is set and Upstash is not', async () => {
    process.env.GSC_SERVICE_ACCOUNT_KEY = USABLE_KEY;

    const GET = await loadRouteWithoutRedis();
    const response = await GET(authed());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    // The absence of `skipped` is the whole assertion — it is the single field
    // daily-warmup's `isNotConfigured` reads, so a `skipped` here is forgiven no
    // matter what else the body says.
    expect(
      body.skipped,
      'A `skipped` field here is excused by daily-warmup and the run goes green ' +
        'while no snapshot can be stored.',
    ).toBeUndefined();
    // BOTH accepted pairs. `redisDriver` reads `KV_REST_API_URL ||
    // UPSTASH_REDIS_REST_URL` (and the matching tokens), so naming only the
    // Vercel-integration pair sent an operator on a direct Upstash setup to
    // add a variable the driver would never have read. The guestbook store's
    // messages already name both; this keeps the two in step.
    expect(body.error).toMatch(/KV_REST_API_URL/);
    expect(body.error).toMatch(/KV_REST_API_TOKEN/);
    expect(body.error).toMatch(/UPSTASH_REDIS_REST_URL/);
    expect(body.error).toMatch(/UPSTASH_REDIS_REST_TOKEN/);
  });

  it('logs the reason, not just returns it', async () => {
    process.env.GSC_SERVICE_ACCOUNT_KEY = USABLE_KEY;

    const GET = await loadRouteWithoutRedis();
    await GET(authed());

    // The response goes to daily-warmup; the platform log is where a 01:00 cron
    // failure is actually read from, and a 500 with nothing logged sends whoever
    // reads it to the wrong layer.
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(logged).toMatch(/seo-report:/);
    expect(logged).toMatch(/Upstash is not configured/);
  });

  it('still skips quietly when the credential itself is absent', async () => {
    delete process.env.GSC_SERVICE_ACCOUNT_KEY;

    const GET = await loadRouteWithoutRedis();
    const response = await GET(authed());
    const body = await response.json();

    // The other direction, and it must not regress: with no credential the
    // integration is genuinely not set up, storage is irrelevant, and a nightly
    // alarm about it teaches people to ignore alarms. The credential guard runs
    // first precisely so this stays true.
    expect(response.status).toBe(503);
    expect(body.skipped).toBe('GSC_SERVICE_ACCOUNT_KEY is not configured');
  });

  it('is still refused without the bearer, before any guard runs', async () => {
    process.env.GSC_SERVICE_ACCOUNT_KEY = USABLE_KEY;

    const GET = await loadRouteWithoutRedis();
    const response = await GET(new Request(ENDPOINT));

    // The storage guard must not become an unauthenticated way to probe which
    // integrations this deployment has configured.
    expect(response.status).toBe(401);
  });
});

// The claim that actually matters to the operator is an end-to-end one: this
// 500 has to make the cron verdict go red. That is `isNotConfigured`'s job, and
// it is asserted against the exact body shape the route now returns rather than
// against a hand-written approximation of it.
describe('daily-warmup — the verdict catches missing storage', () => {
  it('fails the run on seo-report’s storage failure', async () => {
    vi.resetModules();
    process.env.BASE_URL = 'http://localhost';

    const storageFailure = {
      ok: false,
      status: 500,
      text: async () =>
        JSON.stringify({
          ok: false,
          error:
            'Upstash is not configured (KV_REST_API_URL / KV_REST_API_TOKEN, ' +
            'or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN), so no ' +
            'Search Console snapshot can be stored',
        }),
    };
    const OK = { ok: true, status: 200, text: async () => '{"ok":true}' };

    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) =>
      String(url).includes('/api/seo-report') ? storageFailure : OK;

    try {
      const { GET } = await import('@/app/api/daily-warmup/route');
      const response = await GET(authed());
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body.ok).toBe(false);
      expect(
        body.results.seoReport.notConfigured,
        'Marking this notConfigured is what made the run green while the ' +
          'feedback loop could not start.',
      ).toBeUndefined();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
