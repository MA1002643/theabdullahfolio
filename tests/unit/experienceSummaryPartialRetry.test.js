import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshSecret } from '../helpers/secrets.js';

// ── A degraded answer must not hold the good answer's cache window ──────────
// `/api/experience-summary` answers `partial: true` when GitHub failed or
// paginated incompletely, and `experienceSummaryDegraded.test.js` pins what
// that answer looks like: employment kept, `total` withheld, `no-store` headers.
//
// Those headers were only ever half the story. They govern the CDN and the
// browser; the route's own `unstable_cache` sits BEHIND the handler, so a
// partial payload was memoised for the same ten minutes a complete one earns
// and every request inside that window read the same "Unavailable" straight
// back out — long after GitHub had recovered. `no-store` cannot reach a value
// held on the server, and nothing in the response said the hold-time existed.
//
// The route now gives a degraded answer its own, much shorter server-side life
// and retries through a second cache entry keyed by THE DEGRADED PAYLOAD IT
// REPLACES (`generatedAt`). This suite pins the four properties that make that
// a fix rather than a rewrite:
//
//   · a stale degraded answer is retried, and a recovery is published;
//   · that recovery is REMEMBERED — one attempt per degraded answer, not one
//     per minute. An earlier cut keyed this entry by a wall-clock bucket, which
//     bounded the retries and then discarded each result: every new minute was
//     a new key, so a recovery was re-fetched from GitHub on the minute for the
//     rest of the primary entry's ten-minute window;
//   · a FRESH degraded answer is not retried at all, which is what stops a
//     public endpoint firing one 9 s fan-out per request during an outage;
//   · a complete answer never reaches the retry path.
//
// The cache is mocked rather than run, because the behaviour under test is
// which ENTRY the route reads and with what key — not Next's cache
// implementation. The mock keeps the one property the design leans on:
// `unstable_cache` keys by the wrapped function's arguments, so the retry entry
// is memoised per degraded payload here exactly as it is in production. What
// the mock cannot model is TTL expiry, so the continuing-outage retry — which
// rides on this entry's own `revalidate` — is pinned as a contract on the
// options the route registers instead.

const { cache } = vi.hoisted(() => ({
  cache: { primary: null, retryStore: new Map(), retryOptions: null },
}));

vi.mock('next/cache', () => ({
  unstable_cache: (fn, keys, options) => {
    const isPrimary = keys?.[0] === 'experience-summary';
    if (!isPrimary) cache.retryOptions = options;
    return async (...args) => {
      // The primary entry answers with whatever the test has parked in it,
      // which is how an AGED payload is expressed — the route reads the age off
      // the payload's own `generatedAt`, so there is nothing else to fake.
      if (isPrimary) return cache.primary ?? fn(...args);
      const key = JSON.stringify(args);
      if (!cache.retryStore.has(key)) {
        cache.retryStore.set(key, await fn(...args));
      }
      return cache.retryStore.get(key);
    };
  },
}));

const ROUTE = '@/app/api/experience-summary/route';
const USERNAME = process.env.NEXT_PUBLIC_GITHUB_USERNAME || 'MA1002643';
const URL_FOR = (username) =>
  `https://ma.codes/api/experience-summary?username=${username}`;

// See the note in experienceSummaryDegraded.test.js: the route uses this as an
// Authorization credential, so it is generated rather than written down even
// though every fetch here is stubbed and nothing reads the header.
const GITHUB_TOKEN = freshSecret('test-github');

/** The window the route allows a degraded answer, in ms. Mirrors the route. */
const PARTIAL_RETRY_MS = 60 * 1000;

/** A fixed instant, so the time bucket is exact rather than whenever CI ran. */
const NOW = Date.parse('2026-09-17T12:00:00.000Z');

const partialPayload = (generatedAt) => ({
  generatedAt,
  partial: true,
  personalProjects: null,
  employment: { months: 90, display: '7+ years', roles: [] },
  total: null,
  changeFingerprint: 'sha256-cachedpartial0',
});

const completePayload = (generatedAt) => ({
  generatedAt,
  partial: false,
  personalProjects: {
    firstRepoDate: '2020-01-01',
    months: 60,
    display: '5+ years',
    repos: [],
    complete: true,
  },
  employment: { months: 90, display: '7+ years', roles: [] },
  total: { months: 150, display: '12+ years' },
  changeFingerprint: 'sha256-cachedcomplete',
});

/** One request to the route under test, at the allowed username. */
const GET_WITH = ({ GET }) => GET(new Request(URL_FOR(USERNAME)));

/** One healthy page of owned repos, in the shape the GraphQL query asks for. */
const healthyPage = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    data: {
      user: {
        repositories: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              name: 'oldest',
              createdAt: '2020-01-01T00:00:00Z',
              url: 'https://github.com/x/oldest',
            },
          ],
        },
      },
    },
  }),
});

beforeEach(() => {
  vi.resetModules();
  cache.primary = null;
  cache.retryStore.clear();
  cache.retryOptions = null;
  process.env.GITHUB_TOKEN = GITHUB_TOKEN;
  // `Date` ONLY. The route arms a real `setTimeout` per GitHub call for its
  // abort controller, and faking that too would leave those timers pending on a
  // clock nothing advances — the fetches here resolve immediately, so the
  // timeout path is not what this suite is about.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.GITHUB_TOKEN;
});

describe('experience-summary — a stale degraded answer', () => {
  it('retries GitHub and publishes the recovery', async () => {
    // The cached answer is five minutes into a ten-minute window, so the old
    // behaviour had five more minutes of "Unavailable" to serve.
    cache.primary = partialPayload(
      new Date(NOW - 5 * 60 * 1000).toISOString(),
    );
    const fetchMock = vi.fn(async () => healthyPage());
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET_WITH(await import(ROUTE));
    const body = await response.json();

    // GitHub was asked again, and the recovered answer is what the caller gets.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body.partial).toBe(false);
    expect(body.personalProjects.firstRepoDate).toBe('2020-01-01');
    expect(body.total).toBeTruthy();
    // And it is cacheable on the normal terms again — the degraded payload's
    // `no-store` does not follow the recovery out.
    expect(response.headers.get('cache-control')).toContain('s-maxage=600');
  });

  it('remembers the recovery instead of re-fetching it every minute', async () => {
    // The regression this key shape exists for. With a wall-clock bucket, the
    // three requests below fired THREE identical paginated fan-outs — one per
    // minute crossed — each arriving at the answer the previous one had already
    // computed, for as long as the primary entry kept serving its partial.
    cache.primary = partialPayload(
      new Date(NOW - 5 * 60 * 1000).toISOString(),
    );
    const fetchMock = vi.fn(async () => healthyPage());
    vi.stubGlobal('fetch', fetchMock);

    const { GET } = await import(ROUTE);
    const first = await GET(new Request(URL_FOR(USERNAME))).then((r) =>
      r.json(),
    );
    const second = await GET(new Request(URL_FOR(USERNAME))).then((r) =>
      r.json(),
    );

    // Two requests, one fan-out — the same bound a bucket gave.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.partial).toBe(false);
    expect(second.partial).toBe(false);

    // And crossing the window changes nothing, because the key describes the
    // degraded ANSWER rather than the clock: there is no new question to ask
    // while the primary entry is still handing out the same payload.
    vi.setSystemTime(NOW + 4 * PARTIAL_RETRY_MS);
    const later = await GET(new Request(URL_FOR(USERNAME))).then((r) =>
      r.json(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(later.partial).toBe(false);
  });

  it('spends one attempt per degraded answer, not one per window', async () => {
    // The other side of the same property: a NEW degraded payload — the primary
    // entry's ten minutes expired and it rebuilt while GitHub was still down —
    // is a new question, and earns exactly one fresh attempt.
    cache.primary = partialPayload(
      new Date(NOW - 5 * 60 * 1000).toISOString(),
    );
    const fetchMock = vi.fn(async () => healthyPage());
    vi.stubGlobal('fetch', fetchMock);

    const { GET } = await import(ROUTE);
    await GET(new Request(URL_FOR(USERNAME)));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    cache.primary = partialPayload(new Date(NOW - 60 * 1000).toISOString());
    await GET(new Request(URL_FOR(USERNAME)));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('registers the retry entry with the short TTL and the shared tag', async () => {
    // A contract, because the mock cannot model TTL expiry and this option is
    // what retries a CONTINUING outage: once the entry is a minute old,
    // `unstable_cache` serves what it holds and rebuilds behind it. The tag is
    // the other half — `/api/repo-refresh` must be able to drop this entry with
    // the single `revalidateTag('experience-summary')` call it already makes,
    // or a forced refresh would leave the retry answer behind.
    await import(ROUTE);

    expect(cache.retryOptions?.revalidate).toBe(PARTIAL_RETRY_MS / 1000);
    expect(cache.retryOptions?.tags).toEqual(['experience-summary']);
  });

  it('serves a fresher degraded answer when GitHub is still down', async () => {
    cache.primary = partialPayload(
      new Date(NOW - 5 * 60 * 1000).toISOString(),
    );
    // Still failing. `GITHUB_TOKEN` unset is the same rejected promise a rate
    // limit produces, reached without pretending to be the network.
    delete process.env.GITHUB_TOKEN;

    const response = await GET_WITH(await import(ROUTE));
    const body = await response.json();

    // Degraded, and still not storable — but it is THIS minute's answer, not
    // the one the cache happened to be holding.
    expect(body.partial).toBe(true);
    expect(body.employment.months).toBeGreaterThan(0);
    expect(body.total).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.generatedAt).toBe(new Date(NOW).toISOString());
  });

  it('treats a payload with no usable timestamp as expired', async () => {
    // A malformed `generatedAt` has to fail towards a retry: the bucket already
    // bounds the cost at one call a minute, where the other default would pin a
    // degraded answer for the full ten minutes on a bad field.
    cache.primary = partialPayload('not-a-date');
    const fetchMock = vi.fn(async () => healthyPage());
    vi.stubGlobal('fetch', fetchMock);

    const body = await GET_WITH(await import(ROUTE)).then((r) => r.json());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body.partial).toBe(false);
  });
});

describe('experience-summary — answers the retry path must not touch', () => {
  it('serves a degraded answer inside the window without asking GitHub', async () => {
    // The other half of the bound. A partial answer IS allowed a short life;
    // retrying it on every request is the behaviour this design rules out.
    cache.primary = partialPayload(new Date(NOW - 5 * 1000).toISOString());
    const fetchMock = vi.fn(async () => healthyPage());
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET_WITH(await import(ROUTE));
    const body = await response.json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.changeFingerprint).toBe('sha256-cachedpartial0');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('never consults the retry entry for a complete answer, however old', async () => {
    // The complete answer's ten-minute window is untouched by all of this: it
    // is the primary entry's own TTL that expires it, not a per-request age
    // check, so an old-but-complete payload must be served as-is.
    cache.primary = completePayload(
      new Date(NOW - 9 * 60 * 1000).toISOString(),
    );
    const fetchMock = vi.fn(async () => healthyPage());
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET_WITH(await import(ROUTE));
    const body = await response.json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.changeFingerprint).toBe('sha256-cachedcomplete');
    expect(response.headers.get('cache-control')).toContain('s-maxage=600');
  });

  it('rejects a username it does not serve', async () => {
    // The allowlist runs before any of the cache reading, and a new branch in
    // the handler is exactly when that stops being obvious.
    cache.primary = partialPayload(
      new Date(NOW - 5 * 60 * 1000).toISOString(),
    );
    const { GET } = await import(ROUTE);

    expect((await GET(new Request(URL_FOR('someone-else')))).status).toBe(403);
    expect(
      (await GET(new Request('https://ma.codes/api/experience-summary'))).status,
    ).toBe(400);
  });
});
