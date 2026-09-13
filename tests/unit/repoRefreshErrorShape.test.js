import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshCronSecret } from '../helpers/secrets.js';

// ── A warm failure reports a verdict, not the transport that produced it ────
// Both warm fetches here target `baseUrl`, which is the deployment's own origin,
// so a rejection carries internal transport state: the resolved host and port
// behind an `ECONNREFUSED`, DNS status, a TLS error. Those used to be returned
// verbatim as `error`.
//
// This route is not the last stop for that body. `/api/daily-warmup` calls it,
// reads the whole response with `res.text()` and returns it as the `detail` field
// of its own payload — so sanitising the orchestrator's `error` while this route
// still handed it the raw string would have MOVED the leak into the neighbouring
// field of the same response, to the same caller, and looked fixed.
//
// The house rule is that API routes return display data. `aborted` already
// carries the one distinction an operator acts on — a warm that timed out
// against CRON_WARM_TIMEOUT_MS versus one refused outright — and the raw error
// stays in `console.warn` where a cron failure is read from.

// `revalidateTag` is the route's first real action and needs Next's cache
// context, which does not exist in a unit process. Identity-mocked so the warm
// fetches below are what the case actually exercises.
vi.mock('next/cache', () => ({ revalidateTag: () => {} }));

const CRON_SECRET = freshCronSecret();
const ENDPOINT = 'https://ma.codes/api/repo-refresh';

// Modelled on the real rejection shape rather than a bare word, so a partial fix
// that trimmed the message instead of replacing it still fails.
const RAW = 'connect ECONNREFUSED 10.1.2.3:3000';

let warnSpy;

beforeEach(() => {
  vi.resetModules();
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.BASE_URL = 'http://localhost';
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const authed = () =>
  new Request(ENDPOINT, { headers: { authorization: `Bearer ${CRON_SECRET}` } });

describe('repo-refresh — warm failures carry no transport detail', () => {
  it('returns a fixed message when both warms reject', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(RAW);
      }),
    );

    const { GET } = await import('@/app/api/repo-refresh/route');
    const body = await (await GET(authed())).json();

    const serialised = JSON.stringify(body);
    for (const leak of ['ECONNREFUSED', '10.1.2.3', '3000']) {
      expect(
        serialised,
        `The response body carries "${leak}" from the raw exception.`,
      ).not.toContain(leak);
    }

    // Still says WHICH warm failed — the step name is display data, the
    // transport behind it is not.
    expect(body.githubStats.error).toBe('github-stats warm failed');
    expect(body.experience.error).toBe('experience-summary warm failed');
    expect(body.githubStats.ok).toBe(false);
    expect(body.experience.ok).toBe(false);
  });

  it('still distinguishes an abort, which is what an operator acts on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        // The shape `fetchWithTimeout`'s controller produces when the warm
        // outlives CRON_WARM_TIMEOUT_MS.
        const err = new Error('This operation was aborted');
        err.name = 'AbortError';
        throw err;
      }),
    );

    const { GET } = await import('@/app/api/repo-refresh/route');
    const body = await (await GET(authed())).json();

    // A boolean, not a sentence: tighten the budget versus fix a downstream.
    expect(body.githubStats.aborted).toBe(true);
    expect(body.experience.aborted).toBe(true);
    expect(body.githubStats.error).toBe('github-stats warm failed');
  });

  it('keeps the raw exception in the log', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(RAW);
      }),
    );

    const { GET } = await import('@/app/api/repo-refresh/route');
    await GET(authed());

    // The other half of the rule, and why flattening the response costs nothing.
    const logged = warnSpy.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain(RAW);
  });

  it('is still refused without the bearer', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const { GET } = await import('@/app/api/repo-refresh/route');

    expect((await GET(new Request(ENDPOINT))).status).toBe(401);
  });
});
