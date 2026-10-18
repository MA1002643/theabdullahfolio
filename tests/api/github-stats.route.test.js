import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { githubStatsPayload } from '../support/fixtures/api.js';
import { server } from '../support/msw/server.js';
import { freshSecret } from '../helpers/secrets.js';

// GET /api/github-stats against a fake GitHub (issue #92, L4).
//
// The route makes up to four kinds of GraphQL call (most-active-repo scoring,
// its repo paging, language paging, the stats query) inside one shared time
// budget, and promises the About page it will NEVER answer empty: any upstream
// failure serves the bundled snapshot instead. MSW plays GitHub, dispatching on
// the operation each request carries, so the route's real fetch, JSON handling
// and error paths all run.

vi.mock('next/cache', () => ({ unstable_cache: (fn) => fn }));

const GRAPHQL = 'https://api.github.com/graphql';
const USER = 'MA1002643';
const TOKEN = freshSecret('gh');
const TODAY = '2026-09-28';

/** A week of contributions ending today: the last three days non-zero. */
function calendar() {
  const counts = [0, 1, 2, 0, 3, 4, 5];
  const days = counts.map((contributionCount, i) => {
    const d = new Date(`${TODAY}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (counts.length - 1 - i));
    return { date: d.toISOString().slice(0, 10), contributionCount };
  });
  return { totalContributions: 15, weeks: [{ contributionDays: days }] };
}

const repoRef = (name, owner = USER) => ({ repository: { name, owner: { login: owner } } });

/** GitHub's answer to each operation the route sends. */
const fakeGitHub = {
  mostActive: () => ({
    data: {
      user: {
        contributionsCollection: {
          // The profile-README repo (owner === name) scores highest and must
          // still be skipped: every push there is a meta-edit of the About page.
          commitContributionsByRepository: [
            { ...repoRef(USER), contributions: { totalCount: 500 } },
            { ...repoRef('theabdullahfolio'), contributions: { totalCount: 40 } },
            { ...repoRef('side-project'), contributions: { totalCount: 10 } },
          ],
          issueContributionsByRepository: [],
          pullRequestContributionsByRepository: [
            { ...repoRef('side-project'), contributions: { totalCount: 2 } },
          ],
          pullRequestReviewContributionsByRepository: [],
        },
        repositories: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            { name: 'theabdullahfolio', owner: { login: USER }, defaultBranchRef: { target: { history: { totalCount: 900 } } } },
          ],
        },
      },
    },
  }),
  languages: (after) => ({
    data: {
      user: {
        repositories: after
          ? {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                { name: 'secret-app', url: null, isPrivate: true, languages: { edges: [{ size: 1000, node: { name: 'TypeScript', color: '#3178c6' } }] } },
              ],
            }
          : {
              pageInfo: { hasNextPage: true, endCursor: 'page-2' },
              nodes: [
                {
                  name: 'theabdullahfolio',
                  url: 'https://github.com/MA1002643/theabdullahfolio',
                  isPrivate: false,
                  languages: {
                    edges: [
                      { size: 6000, node: { name: 'JavaScript', color: '#f1e05a' } },
                      { size: 2000, node: { name: 'CSS', color: '#563d7c' } },
                    ],
                  },
                },
                { name: 'side-project', url: 'https://github.com/MA1002643/side-project', isPrivate: false, languages: { edges: [{ size: 1000, node: { name: 'TypeScript', color: '#3178c6' } }] } },
              ],
            },
      },
    },
  }),
  stats: () => ({
    data: {
      user: {
        name: 'Muhammad Abdullah',
        login: USER,
        createdAt: '2019-03-01T00:00:00Z',
        followers: { totalCount: 12 },
        repositories: { nodes: [{ name: 'a', stargazerCount: 7 }, { name: 'b', stargazerCount: 3 }] },
        contributionsCollection: {
          totalCommitContributions: 420,
          totalPullRequestContributions: 30,
          totalIssueContributions: 9,
          totalRepositoriesWithContributedCommits: 6,
          contributionCalendar: calendar(),
        },
      },
      repository: {
        name: 'theabdullahfolio',
        nameWithOwner: `${USER}/theabdullahfolio`,
        description: 'Portfolio :rocket:',
        stargazerCount: 5,
        forkCount: 1,
        pushedAt: `${TODAY}T10:00:00Z`,
        watchers: { totalCount: 2 },
        primaryLanguage: { name: 'JavaScript', color: '#f1e05a' },
        issues: { totalCount: 3 },
        closedIssues: { totalCount: 90 },
        pullRequests: { totalCount: 1 },
        mergedPRs: { totalCount: 70 },
        defaultBranchRef: { target: { history: { totalCount: 900 } } },
      },
    },
  }),
};

/** One MSW handler that routes each GraphQL operation to its fake answer. */
function githubHandler({ record, override } = {}) {
  return http.post(GRAPHQL, async ({ request }) => {
    const { query, variables } = await request.json();
    const op = /FindMostActiveRepo\(/.test(query)
      ? 'mostActive'
      : /languages\(first: 10/.test(query)
        ? 'languages'
        : 'stats';
    record?.({ op, variables, authorization: request.headers.get('authorization') });
    const custom = override?.(op, variables);
    if (custom) return custom;
    return HttpResponse.json(fakeGitHub[op](variables?.after));
  });
}

let logs;
let savedToken;
beforeEach(() => {
  savedToken = process.env.GITHUB_TOKEN;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  logs = [];
  for (const level of ['error', 'warn']) {
    vi.spyOn(console, level).mockImplementation((...args) => logs.push(args.map(String).join(' ')));
  }
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (savedToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = savedToken;
});

/** The route reads GITHUB_TOKEN at import, so each case imports a fresh copy. */
async function loadRoute({ token = TOKEN } = {}) {
  if (token) process.env.GITHUB_TOKEN = token;
  else delete process.env.GITHUB_TOKEN;
  vi.resetModules();
  return import('@/app/api/github-stats/route');
}

const get = (query = `?username=${USER}`) => new Request(`https://ma.codes/api/github-stats${query}`);

describe('request gate', () => {
  it('requires a username (400)', async () => {
    const { GET } = await loadRoute();
    expect((await GET(get(''))).status).toBe(400);
  });

  it('serves only the site owner, case-insensitively (403 otherwise)', async () => {
    const { GET } = await loadRoute();
    expect((await GET(get('?username=someone-else'))).status).toBe(403);
    server.use(githubHandler());
    expect((await GET(get(`?username=${USER.toLowerCase()}`))).status).toBe(200);
  });
});

describe('live path', () => {
  it('authenticates every call with the token', async () => {
    const { GET } = await loadRoute();
    const calls = [];
    server.use(githubHandler({ record: (c) => calls.push(c) }));
    await GET(get());
    expect(calls.length).toBeGreaterThanOrEqual(4);
    calls.forEach((c) => expect(c.authorization).toBe(`Bearer ${TOKEN}`));
  });

  it('assembles the payload the About page renders', async () => {
    const { GET } = await loadRoute();
    server.use(githubHandler());
    const res = await GET(get());
    const body = await res.json();

    expect(res.headers.get('cache-control')).toMatch(/s-maxage=600/);
    expect(body._fallback).toBeUndefined();
    expect(body.stats.user).toEqual({ username: USER, name: 'Muhammad Abdullah', createdAt: 'Mar 1, 2019' });
    expect(body.stats.stats).toMatchObject({
      commits: 420,
      prs: 30,
      issues: 9,
      contributedTo: 6,
      followers: 12,
      stars: 10,
      totalContributions: 15,
    });
    expect(body.stats.stats.level).toMatch(/^(S|A\+|A|A-|B\+|B|B-|C\+|C)$/);
    expect(body.stats.streaks.currentStreak.value).toBe(3);
    expect(body.stats.streaks.currentStreak.dateRange).toBe('Sep 26, 2026 - Present');
    expect(body.stats.streaks.longestStreak.value).toBe(3);
    expect(body.stats.repo).toMatchObject({
      nameWithOwner: `${USER}/theabdullahfolio`,
      description: 'Portfolio 🚀', // :shortcodes: rendered
      mergedPRs: 70,
      commitCount: 900,
    });
  });

  it('never picks the profile-README repo as "most active", however busy it is', async () => {
    const { GET } = await loadRoute();
    const stats = [];
    server.use(githubHandler({ record: (c) => c.op === 'stats' && stats.push(c.variables) }));
    await GET(get());
    // 500 commits there vs 40 on the portfolio, and the portfolio still wins.
    expect(stats[0]).toMatchObject({ repoOwner: USER, repoName: 'theabdullahfolio', hasRepo: true });
  });

  it('pages languages, ranks them by bytes, and folds private repos into a count', async () => {
    const { GET } = await loadRoute();
    const pages = [];
    server.use(githubHandler({ record: (c) => c.op === 'languages' && pages.push(c.variables.after) }));
    const { languages } = await (await GET(get())).json();

    expect(pages).toEqual([null, 'page-2']);
    expect(languages.map((l) => l.language)).toEqual(['JavaScript', 'CSS', 'TypeScript']);
    const total = languages.reduce((sum, l) => sum + Number(l.percentage), 0);
    expect(total).toBeCloseTo(100, 1);
    const ts = languages.find((l) => l.language === 'TypeScript');
    // One public repo listed by name; the private one only as a count.
    expect(ts.repos.map((r) => r.name)).toEqual(['side-project']);
    expect(ts.privateRepos).toEqual({ count: 1, percentage: '50.00' });
    expect(JSON.stringify(languages)).not.toContain('secret-app');
  });

  it('substitutes the snapshot languages (and says so) when that half alone comes back empty', async () => {
    const { GET } = await loadRoute();
    server.use(
      githubHandler({
        override: (op) =>
          op === 'languages'
            ? HttpResponse.json({ data: { user: { repositories: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } })
            : null,
      }),
    );
    const body = await (await GET(get())).json();
    expect(body.languagesFallback).toBe(true);
    expect(body.languages).toEqual(githubStatsPayload().languages.slice(0, 10));
    expect(body._fallback).toBeUndefined(); // the stats half is still live
  });
});

describe('never empty: every upstream failure serves the snapshot', () => {
  const expectFallback = async (res) => {
    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache-status')).toBe('FALLBACK');
    const body = await res.json();
    expect(body._fallback).toBe(true);
    expect(body.stats).toEqual(githubStatsPayload().stats);
  };

  it('with no token configured, without calling GitHub at all', async () => {
    const { GET } = await loadRoute({ token: null });
    // No handler registered: a request would fail the suite outright.
    await expectFallback(await GET(get()));
    expect(logs.join('\n')).toMatch(/GITHUB_TOKEN env var is not set/);
  });

  it.each([
    ['401 bad credentials', () => HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }), /Bad credentials/],
    ['403 rate limit', () => HttpResponse.json({ message: 'API rate limit exceeded' }, { status: 403 }), /rate limit/],
    ['502 upstream', () => new HttpResponse('bad gateway', { status: 502 }), /HTTP 502/],
    ['a 200 HTML captive portal', () => new HttpResponse('<html>Sign in to Wi-Fi</html>', { status: 200 }), /not valid JSON/],
    ['GraphQL field errors', () => HttpResponse.json({ errors: [{ message: 'Something went wrong' }] }), /Something went wrong/],
    ['a network failure', () => HttpResponse.error(), /fetch failed|Failed to fetch|network/i],
  ])('on %s, with the cause logged and the token redacted', async (_label, reply, cause) => {
    const { GET } = await loadRoute();
    server.use(http.post(GRAPHQL, reply));
    await expectFallback(await GET(get()));
    const logged = logs.join('\n');
    expect(logged).toMatch(cause);
    expect(logged).not.toContain(TOKEN);
  });
});
