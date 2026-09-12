import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── A failed GitHub call must not discard a good employment figure ──────────
// `/api/experience-summary` answers with two independent halves: `employment`,
// a pure derivation over `journeyData` that cannot fail, and `personalProjects`,
// which needs GitHub. The builder used to throw when the GitHub half came back
// rejected, so the handler returned HTTP 500 and the client got NOTHING — while
// a correct, already-computed employment figure sat in the discarded scope, and
// while the client had carried an "Unavailable" branch for a null
// `personalProjects` the whole time.
//
// These cases pin the partial answer AND the three things that make returning
// one safe rather than merely possible: the total must not be published as a
// number, the response must not be storable by shared caches, and a healthy
// response must be completely unaffected.
//
// GitHub is failed by leaving `GITHUB_TOKEN` unset — the module reads it at
// import time and `fetchOwnedRepos` throws on a missing token, which is the
// same rejected promise a rate limit or a 5xx produces, reached without
// pretending to be the network.

// `unstable_cache` memoises by argument across the whole module, which would
// make the second test in a file read the first one's answer. Identity here so
// each case exercises the builder it is about.
vi.mock('next/cache', () => ({
  unstable_cache: (fn) => fn,
}));

const ROUTE = '@/app/api/experience-summary/route';
const URL_FOR = (username) =>
  `https://ma.codes/api/experience-summary?username=${username}`;

/** The allowed username, resolved the way the route resolves it. */
const USERNAME = process.env.NEXT_PUBLIC_GITHUB_USERNAME || 'MA1002643';

describe('experience-summary — GitHub down', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers 200 with the employment half instead of 500', async () => {
    const { GET } = await import(ROUTE);
    const response = await GET(new Request(URL_FOR(USERNAME)));

    // The regression in one line: this was 500.
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.personalProjects).toBeNull();
    expect(body.partial).toBe(true);
    // The half that cannot fail is present and real, not a placeholder.
    expect(body.employment).toBeTruthy();
    expect(body.employment.months).toBeGreaterThan(0);
    expect(body.employment.roles.length).toBeGreaterThan(0);
  });

  it('publishes no total rather than one missing the personal half', async () => {
    const { GET } = await import(ROUTE);
    const body = await GET(new Request(URL_FOR(USERNAME))).then((r) =>
      r.json(),
    );

    // `total.months` is what the /about years card counts up to. A sum of the
    // employment side alone is not a smaller number, it is a wrong one with
    // nothing marking it as incomplete — so the field is absent instead.
    expect(body.total).toBeNull();
    // Specifically NOT the employment figure wearing the total's name.
    expect(body.total?.months).not.toBe(body.employment.months);
  });

  it('keeps a partial answer out of shared caches', async () => {
    const { GET } = await import(ROUTE);
    const response = await GET(new Request(URL_FOR(USERNAME)));

    // The healthy headers would park this at the CDN for s-maxage=600 plus
    // five minutes of stale-while-revalidate, so one rate-limited call would
    // outlive GitHub's recovery by a quarter of an hour. They would also evict
    // a complete payload that `stale-if-error` was still serving.
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('still rejects a username it does not serve', async () => {
    const { GET } = await import(ROUTE);

    // The degraded path must not become a way around the allowlist — the
    // checks run before any of it.
    expect((await GET(new Request(URL_FOR('someone-else')))).status).toBe(403);
    expect(
      (await GET(new Request('https://ma.codes/api/experience-summary'))).status,
    ).toBe(400);
  });
});

describe('experience-summary — GitHub healthy', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GITHUB_TOKEN = 'test-token-not-a-credential';

    // One page of owned repos, in the shape the route's GraphQL query asks for.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            user: {
              repositories: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    name: 'newer',
                    createdAt: '2022-06-01T00:00:00Z',
                    url: 'https://github.com/x/newer',
                  },
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
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_TOKEN;
  });

  it('is untouched by the degraded path', async () => {
    const { GET } = await import(ROUTE);
    const response = await GET(new Request(URL_FOR(USERNAME)));
    const body = await response.json();

    expect(response.status).toBe(200);
    // The flag exists but is false, and the total is a real object again.
    expect(body.partial).toBe(false);
    expect(body.personalProjects).toBeTruthy();
    expect(body.personalProjects.firstRepoDate).toBe('2020-01-01');
    expect(body.total).toBeTruthy();
    expect(body.total.months).toBe(
      body.personalProjects.months + body.employment.months,
    );
    // And a complete answer is cacheable on the normal terms — the headers
    // that make `stale-if-error` able to cover a later outage.
    expect(response.headers.get('cache-control')).toContain('s-maxage=600');
    expect(response.headers.get('cache-control')).toContain(
      'stale-if-error=86400',
    );
  });
});
