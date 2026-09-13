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

// ── Fulfilled is not the same as complete ───────────────────────────────────
// Pagination runs NEWEST-FIRST, so the oldest repositories are on the last
// pages — and `firstRepoDate` / `months` are read off the last element. When a
// later page timed out, `fetchOwnedRepos` kept what it had and returned an
// ordinary array, which is the right call (a throw would drop the whole panel
// and `unstable_cache` would hold that for ten minutes). What was wrong is that
// nothing carried the fact: the caller could not tell "all pages fetched" from
// "some pages fetched", so it published `partial: false` and a `total` anchored
// on the oldest repo it HAPPENED to see.
//
// That undercount is systematic, not a random sample — it always shortens the
// span, and always by dropping the repos that define it.
describe('experience-summary — pagination cut short', () => {
  /** A GitHub page whose `hasNextPage` invites another request. */
  const page = (nodes, hasNextPage, endCursor = 'cursor-1') => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        user: { repositories: { pageInfo: { hasNextPage, endCursor }, nodes } },
      },
    }),
  });

  const NEWER = {
    name: 'newer',
    createdAt: '2024-01-01T00:00:00Z',
    url: 'https://github.com/x/newer',
  };

  beforeEach(() => {
    vi.resetModules();
    process.env.GITHUB_TOKEN = 'test-token-not-a-credential';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_TOKEN;
  });

  it('reports partial when a later page aborts', async () => {
    // First page succeeds and says there is more; the second aborts the way a
    // timeout does. `fetchOwnedRepos` keeps page one and stops.
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        if (call === 1) return page([NEWER], true);
        throw new DOMException('The operation was aborted.', 'AbortError');
      }),
    );

    const { GET } = await import(ROUTE);
    const response = await GET(new Request(URL_FOR(USERNAME)));
    const body = await response.json();

    expect(response.status).toBe(200);
    // The repos we did get are still returned — the panel is not dropped.
    expect(body.personalProjects.repos).toHaveLength(1);
    // But the list is flagged, and the payload no longer claims completeness.
    expect(body.personalProjects.complete).toBe(false);
    expect(body.partial).toBe(true);
    // The undercount specifically: `months` here is anchored on 2024, because
    // whatever predates it was on the page that never arrived. Publishing that
    // as the headline is the bug, so the headline is withheld.
    expect(body.total).toBeNull();
    // And an incomplete answer must not be cached as though it were whole.
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('reports partial when the page ceiling is reached', async () => {
    // Every page says there is another. The loop stops at
    // MAX_OWNED_REPO_PAGES with `hasNextPage` still true — fulfilled, and
    // definitely not all of them.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page([NEWER], true)),
    );

    const { GET } = await import(ROUTE);
    const body = await GET(new Request(URL_FOR(USERNAME))).then((r) => r.json());

    expect(body.personalProjects.complete).toBe(false);
    expect(body.partial).toBe(true);
    expect(body.total).toBeNull();
  });

  it('treats an empty first page that aborted as incomplete, not as "owns nothing"', async () => {
    // The zero-repo branch reaches the same place an abort on page one does,
    // and they are not the same statement: one is a real empty account, the
    // other is a request that never got an answer.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page([], true)),
    );

    const { GET } = await import(ROUTE);
    const body = await GET(new Request(URL_FOR(USERNAME))).then((r) => r.json());

    expect(body.personalProjects.repos).toEqual([]);
    expect(body.personalProjects.complete).toBe(false);
    expect(body.partial).toBe(true);
  });

  it('marks a genuinely complete single page complete', async () => {
    // The control. Without it the three cases above pass on a flag that is
    // simply always false.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page([NEWER], false, null)),
    );

    const { GET } = await import(ROUTE);
    const body = await GET(new Request(URL_FOR(USERNAME))).then((r) => r.json());

    expect(body.personalProjects.complete).toBe(true);
    expect(body.partial).toBe(false);
    expect(body.total).toBeTruthy();
  });
});
