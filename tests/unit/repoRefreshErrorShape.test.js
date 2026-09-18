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

/** How much of an error body the route lets into the log. Mirrors the route. */
const LOG_EXCERPT_MAX_CHARS = 300;

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
  new Request(ENDPOINT, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });

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

  it('bounds a warm that sends headers and then stalls its body', async () => {
    // The budget used to end at the headers. `clearTimeout` sat in a `finally`
    // around the fetch, and `fetch` settles the moment the headers arrive — so
    // the abort was CANCELLED while the body was still streaming, and the
    // `await res.json()` below it ran with no deadline at all. Not a
    // runtime-dependent one, as in the sibling routes that race their reads:
    // here nothing could fire, because the timer had already been cleared.
    //
    // A downstream answering 200 and then never finishing therefore held this
    // route open until the platform killed it — and `aborted`, the one flag
    // that tells an operator "tighten the budget" apart from "fix the
    // downstream", could never be set for the failure most likely to need it.
    //
    // The body here never settles for any reason, so the case fails by HANGING
    // if the bound is lost, which is the production shape.
    process.env.CRON_WARM_TIMEOUT_MS = '60';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).includes('/api/github-stats')) {
          return { ok: true, status: 200, json: () => new Promise(() => {}) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );

    const { GET } = await import('@/app/api/repo-refresh/route');
    const started = Date.now();
    const body = await (await GET(authed())).json();

    expect(body.githubStats.ok).toBe(false);
    expect(
      body.githubStats.aborted,
      'A stalled BODY is a budget breach exactly as a stalled request is — the ' +
        'operator acts on the same flag either way.',
    ).toBe(true);
    expect(body.githubStats.error).toBe('github-stats warm failed');
    expect(Date.now() - started).toBeLessThan(3000);
    delete process.env.CRON_WARM_TIMEOUT_MS;
  });

  it('bounds the error-detail read too, without losing the status', async () => {
    // The other body read: a downstream that fails AND stalls the body
    // explaining why. That read is deliberately swallowed — `detail` is
    // context, the status is the finding — but swallowed is not the same as
    // unbounded, and before the fix this one hung just as hard.
    process.env.CRON_WARM_TIMEOUT_MS = '60';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).includes('/api/github-stats')) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: () => new Promise(() => {}),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { GET } = await import('@/app/api/repo-refresh/route');
    const started = Date.now();
    const body = await (await GET(authed())).json();

    // The HTTP failure still reported, with the unreadable body simply absent.
    expect(body.githubStats.ok).toBe(false);
    expect(body.githubStats.status).toBe(500);
    // `detailLogged: false` is what "absent" looks like now the body itself no
    // longer travels: nothing was captured, so there is nothing in the log to
    // go and read either. The distinction the old `detail: null` carried,
    // without the half that carried the body.
    expect(body.githubStats.detailLogged).toBe(false);
    expect(Date.now() - started).toBeLessThan(3000);
    delete process.env.CRON_WARM_TIMEOUT_MS;
  });

  // ── The branch the cases above do not reach ────────────────────────────────
  // Every case so far fails by THROWING, and the fixed-message rule was applied
  // to the catch that handles it. The non-OK branch is the other half of the
  // same try, and it was still returning the downstream's error body verbatim
  // as `detail` — the leak this file's header describes, moved one field over
  // rather than closed. An error body is the worst one to forward, too: it is
  // the response nobody chose the contents of.
  it('returns no part of a failed warm’s error body', async () => {
    const ERROR_BODY = `<html>\n<title>502</title>\n<body>upstream 502 from 10.1.2.3:3000</body>\n${'x'.repeat(LOG_EXCERPT_MAX_CHARS)}\ntoken ghp_notreal\n</html>`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).includes('/api/github-stats')) {
          return {
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            text: async () => ERROR_BODY,
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { GET } = await import('@/app/api/repo-refresh/route');
    const body = await (await GET(authed())).json();

    const serialised = JSON.stringify(body);
    for (const leak of ['10.1.2.3', 'ghp_notreal', 'upstream 502', '<html>']) {
      expect(
        serialised,
        `The response body carries "${leak}" from the downstream error body.`,
      ).not.toContain(leak);
    }

    // What an operator acts on is still there, and so is the pointer to where
    // the body went — this must not become a silent drop.
    expect(body.githubStats.ok).toBe(false);
    expect(body.githubStats.status).toBe(502);
    expect(body.githubStats.statusText).toBe('Bad Gateway');
    expect(body.githubStats.detailLogged).toBe(true);

    // ── And the LOG gets an excerpt, not the body ────────────────────────────
    // "Keep it in the log" is where the previous pass stopped, and the log is a
    // sink of its own: persisted, drainable, read by anyone with project
    // access, and fed here by whatever answered a deployment-configurable
    // origin. The two properties that bounds it, asserted as properties rather
    // than as a string — the diagnosis survives, the body's freedom does not.
    const logged = errorSpy.mock.calls[0][1];
    expect(logged, 'The whole body is in the log again.').not.toBe(ERROR_BODY);
    // Still diagnostic: which reply this was, and what answered.
    expect(logged).toContain('<title>502</title>');
    // Bounded — a page cannot spend the log budget.
    expect(logged.length).toBeLessThanOrEqual(LOG_EXCERPT_MAX_CHARS + 32);
    // Single line — a body cannot forge log lines with newlines of its own.
    expect(logged).not.toMatch(/[\r\n]/);
    // And what sat beyond the cap did not travel. This is a VOLUME bound, not
    // a secret filter, and the fixture says so by construction: `ghp_notreal`
    // is dropped because it is past the cap, not because anything recognised
    // it. The route sends no `Authorization` header on this warm, which is what
    // makes a reflected credential not the threat here in the first place.
    expect(logged).not.toContain('ghp_notreal');
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
