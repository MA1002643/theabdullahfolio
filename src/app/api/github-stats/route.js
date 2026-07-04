import { AsyncLocalStorage } from "node:async_hooks";
import { parseGitHubText } from "@/utils/emoji";
import { calculateRank } from "@/utils/rankCalculator";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import fallbackStats from "@/data/github-stats-fallback.json";

// Pin to Node so `node:async_hooks` (used by the shared-deadline
// AsyncLocalStorage below) and any future Node-only API stay available.
// Matches the convention in /api/repo-refresh and /api/work-status — every
// route that touches a Node built-in pins this explicitly so a future move
// to Edge can't silently break bundling.
export const runtime = "nodejs";

const GITHUB_API = "https://api.github.com/graphql";
const TOKEN = process.env.GITHUB_TOKEN;
const REVALIDATE_SECONDS = 10 * 60;
const MOST_ACTIVE_REPO_REVALIDATE_SECONDS = 24 * 60 * 60;
// Per-request ceiling for GraphQL calls. Must stay strictly below the
// serverless function timeout (10 s on Hobby, 60 s on Pro) so even a single
// slow GitHub response can't push the route past the platform limit; the
// default of 8 s gives ~2 s of headroom on Hobby for response parsing and
// the rest of the handler. Tunable via `GITHUB_TIMEOUT_MS` for Pro plans
// where the budget is larger. When the abort fires, the call throws and
// the outer GET catch serves the bundled fallback — far better than a hung
// function whose 24h cache traps the next day of users behind an empty
// payload. Note: with pagination, multiple sequential calls can each
// consume up to this much time, so the cap should also respect
// roughly: TIMEOUT × expected pages ≤ function budget.
const GITHUB_TIMEOUT_MS = Number(process.env.GITHUB_TIMEOUT_MS) || 8000;
// Cumulative wall-clock budget across all GitHub calls in a single
// `findMostActiveRepo` / `getAllLanguages` invocation. Per-call timeouts
// alone aren't enough: with `MAX_REPO_PAGES = 10` and an 8 s per-call
// ceiling, the theoretical worst case is 80 s, which would blow past the
// Hobby 10 s function limit and force the route into the bundled fallback
// for the next stale-if-error window. This bound puts a hard upper limit
// on time spent paginating, regardless of per-page latency. Default 9 s
// keeps ~1 s of headroom under Hobby; raise via env on Pro/Enterprise
// where the function budget is larger.
const MAX_TOTAL_GITHUB_MS =
  Number(process.env.GITHUB_OVERALL_TIMEOUT_MS) || 9000;

// Request-scoped wall-clock budget covering the *entire* cold-miss chain —
// `findMostActiveRepo` then `getAllLanguages` + `fetchGitHubStats` in
// parallel. Per-helper budgets alone aren't enough: two sequential helpers
// at MAX_TOTAL_GITHUB_MS each could blow past Hobby's 10 s function limit.
// The daily /api/repo-refresh cron is the worst case — it intentionally
// invalidates both unstable_cache layers and forces the full chain.
// Default 9 s keeps total wall-clock under Hobby's 10 s even on a full cold
// miss; raise via env on Pro/Enterprise where the function budget is larger.
const GITHUB_OVERALL_BUDGET_MS =
  Number(process.env.GITHUB_OVERALL_BUDGET_MS) || 9000;

// AsyncLocalStorage propagates the request deadline through every helper
// and through `unstable_cache`'s cache-miss invocation without polluting
// function signatures or cache keys (a `deadline` param would force a fresh
// key on every request and defeat the cache entirely). On cache hit no
// helper runs, so the store is never consulted.
const deadlineStore = new AsyncLocalStorage();

// Returns the milliseconds remaining under the tightest active budget. When
// a request deadline is set on the current async context, the helper-local
// `fallbackMs` is still honored as a co-equal ceiling — bumping
// GITHUB_OVERALL_BUDGET_MS on a Pro plan must not silently override a
// helper's own MAX_TOTAL_GITHUB_MS. When no deadline is in flight (tests,
// ad-hoc scripts), only the local fallback applies.
function remainingBudget(fallbackMs) {
  const store = deadlineStore.getStore();
  if (!store) return Math.max(0, fallbackMs);
  return Math.max(0, Math.min(store.deadline - Date.now(), fallbackMs));
}

// Single GitHub GraphQL entry point. Every call in this module goes through
// here so the `GITHUB_TIMEOUT_MS` ceiling applies uniformly. Without this
// centralization, a slow upstream on the languages or stats path could stall
// the function past its serverless time budget while the most-active-repo
// path (which used to be the only one with a timeout) returned cleanly.
// Returns the GraphQL `data` block so each caller can destructure the
// fields it needs; throws on aborted/timed-out requests, on auth/HTTP-level
// failures (401, 403, 5xx), on GraphQL field-level errors, and on a missing
// `user` field (every query in this module is user-rooted).
async function githubGraphQL(query, variables, timeoutMs) {
  // Fail fast if the token is missing. Without this, the fetch sends
  // `Authorization: Bearer undefined`, GitHub returns 401 "Bad credentials",
  // and the downstream "User not found" branch buries the actual root
  // cause. Surfacing the real problem here saves debugging time.
  if (!TOKEN) {
    throw new Error("GitHub stats: GITHUB_TOKEN env var is not set");
  }

  // `timeoutMs` lets paginating callers tighten the per-call ceiling to a
  // budget they computed locally; omitting it picks `GITHUB_TIMEOUT_MS`.
  // Either way we cap by the shared request deadline so a single-shot
  // caller (`fetchGitHubStats`, the initial findMostActiveRepo query) and
  // an explicit-budget caller both honor the cross-helper ceiling without
  // having to thread the deadline through their signatures. Without the
  // outer Math.min, a stale default parameter would silently override the
  // deadline — the precise bug that motivated this rewrite.
  const baseTimeout = timeoutMs ?? GITHUB_TIMEOUT_MS;
  const effectiveTimeout = Math.min(baseTimeout, remainingBudget(baseTimeout));
  // Short-circuit when the budget is already exhausted. `setTimeout(..., 0)`
  // queues the abort as a macrotask, so without this we'd still kick off a
  // fetch that opens a TCP/TLS connection before the immediate abort fires.
  // Throwing a `DOMException` named "AbortError" matches the shape `fetch`
  // produces on a real abort, so the paginated callers' existing
  // `err?.name === "AbortError"` catch path preserves partial results
  // unchanged.
  if (effectiveTimeout <= 0) {
    throw new DOMException(
      "GitHub stats: request budget exhausted before call",
      "AbortError"
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);
  try {
    const res = await fetch(GITHUB_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    // Read the body as text once, then attempt to parse it as JSON. Reading
    // as text first lets us keep a copy of the raw bytes for diagnostics
    // when parsing fails (you can't re-read a consumed Response body).
    // Non-2xx responses still return JSON for most GitHub error cases (401
    // Bad credentials, 403 rate limit, 502 upstream unavailable, etc.) but
    // those have shape `{message: "..."}`, not the GraphQL `{data, errors}`
    // shape — distinguish on `res.ok` so the surfaced error names the
    // actual HTTP failure instead of "User not found", which buries the
    // root cause.
    const rawBody = await res.text();
    // `parseSucceeded` distinguishes "JSON.parse threw" from "body was
    // literally the JSON value `null`" (which parses successfully). Without
    // this distinction the parse-failure branch below would false-positive
    // on a valid `null` body and false-negative on `JSON.parse(rawBody) === null`.
    let json;
    let parseSucceeded = false;
    try {
      json = JSON.parse(rawBody);
      parseSucceeded = true;
    } catch {
      // Handled below — branches on `parseSucceeded`.
    }

    if (!res.ok) {
      const detail = json?.message || `HTTP ${res.status} ${res.statusText}`;
      throw new Error(`GitHub stats: GraphQL request failed (${detail})`);
    }
    // 2xx response but the body wasn't JSON — most commonly an HTML error
    // page from an intermediate proxy, a Cloudflare challenge, or a
    // captive-portal redirect that returned 200. Surface the root cause
    // with a body snippet so the fallback logs are actually diagnosable
    // instead of silently misreporting "User not found".
    if (!parseSucceeded) {
      const snippet = rawBody.slice(0, 200).replace(/\s+/g, " ").trim();
      const truncated = rawBody.length > 200 ? "…" : "";
      throw new Error(
        `GitHub stats: GraphQL response was not valid JSON (HTTP ${res.status}, body: "${snippet}${truncated}")`
      );
    }
    if (json?.errors) {
      throw new Error(json.errors[0]?.message || "GitHub GraphQL query failed");
    }
    if (!json?.data?.user) throw new Error("User not found");
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}
// Hard cap on owned-repo pagination. Each page = 100 repos, so 10 pages
// covers any realistic account (≤ 1,000 owned non-fork repos). Above this
// we stop paging and log a warning — the contribution loops still see those
// extra repos (via the *ContributionsByRepository fields, which GitHub caps
// at 100 each), so the missing tier is only the soft history-depth boost.
const MAX_REPO_PAGES = 10;

// Cap on how many repos each language exposes in its per-repo breakdown
// (the Most Used Languages card's hover popover). Keeps the payload compact
// — the popover only needs the top contributors, and the breakdown is
// sorted biggest-first so the cap drops only the long tail of tiny shares.
const MAX_REPOS_PER_LANGUAGE = 12;

// Derive the set of `owner/name` keys (lowercased) to skip when picking the
// "most active" feature repo. The GitHub profile-README repo — the one whose
// owner AND name both match the username — is always excluded, because every
// push there is a meta-edit of the about page itself and would otherwise
// artificially dominate the activity score. Keying by `owner/name` (not just
// `name`) means an unrelated repo with a coincidentally matching name owned
// by someone else is still scored normally.
const mostActiveRepoExclude = (username) => {
  const u = username.toLowerCase();
  return new Set([`${u}/${u}`]);
};

// The "most active repository" selection is far more expensive than the rest
// of the stats (it pages contribution breakdowns + per-repo commit history) and
// changes slowly, so it gets its own cache layer with a 24-hour TTL. The
// display-data cache continues to refresh every 10 minutes.
const getCachedMostActiveRepo = unstable_cache(
  async (username) => findMostActiveRepo(username),
  ["most-active-repo"],
  {
    revalidate: MOST_ACTIVE_REPO_REVALIDATE_SECONDS,
    tags: ["github-stats", "most-active-repo"],
  }
);

// Aggregated GitHub fetcher wrapped in Next's persistent data cache. The
// repo name is resolved by the scoring algorithm before each fresh fetch and
// cached separately at a 24-hour TTL — the display data still refreshes every
// 10 minutes against whatever repo the algorithm last picked.
const getCachedGithubStats = unstable_cache(
  async (username) => {
    const mostActiveRepo = await getCachedMostActiveRepo(username);
    const [languages, stats] = await Promise.all([
      getAllLanguages(username),
      fetchGitHubStats(
        username,
        mostActiveRepo?.owner ?? null,
        mostActiveRepo?.name ?? null,
        mostActiveRepo?.activityScore ?? 0
      ),
    ]);
    // Top 10 per issue #18 (the reference top-langs widget uses
    // langs_count=10). The change-detection fingerprint is computed
    // CLIENT-side from this list (useLanguagesUpdateSignal → languagesDiff),
    // not shipped on the payload: deriving it on the client keeps it working
    // on the bundled fallback too and guarantees the two sides can't drift,
    // so there's no server-provided `languagesFingerprint` field to carry.
    let topLanguages = languages.slice(0, 10);

    // Languages-only degradation guard. When the languages GraphQL aborts
    // mid-fetch, `getAllLanguages` returns [] (indistinguishable from a
    // genuinely empty account — which can't happen on this single-user,
    // language-bearing site). Caching and serving that empty list would
    // blank the Most Used Languages card for any visitor without a
    // client-side last-good snapshot, and the 10-min TTL would lock that
    // empty state in. So substitute the bundled snapshot's languages and
    // flag it: the client treats `languagesFallback` languages as a soft
    // default — used to populate a cold card, but never preferred over the
    // visitor's OWN (possibly fresher) localStorage last-good. The stats
    // half succeeded independently, so this stays a partial substitution,
    // distinct from the GET handler's whole-payload `_fallback`.
    let languagesFallback = false;
    if (topLanguages.length === 0) {
      const snapshot = Array.isArray(fallbackStats.languages)
        ? fallbackStats.languages.slice(0, 10)
        : [];
      if (snapshot.length > 0) {
        topLanguages = snapshot;
        languagesFallback = true;
      }
    }

    return {
      languages: topLanguages,
      // Only present (and true) on the substituted path — omitted entirely
      // on the normal path so a successful fetch's payload is byte-identical
      // to before.
      ...(languagesFallback ? { languagesFallback: true } : {}),
      stats,
    };
  },
  // Key suffix bumped to v2 when each language gained `privateRepos` (count +
  // combined share of private/fork/archived usage) and the crawl started
  // including forks. Without the bump, a stale v1 entry — fork-less totals, no
  // private aggregate — would keep serving for a TTL window after deploy.
  // Mirrors the github-skills route's key-versioning discipline. The TAG stays
  // "github-stats" so webhook-driven revalidation keeps working unchanged.
  ["github-stats-v2"],
  { revalidate: REVALIDATE_SECONDS, tags: ["github-stats"] }
);

const CACHE_HEADERS = {
  "Cache-Control": `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=300, stale-if-error=86400`,
};

// The only username this endpoint will serve. Pinning to the site owner's
// account closes a token/rate-limit exhaustion vector: without this guard, any
// caller varying `?username=` triggers a fresh, expensive GraphQL chain (paged
// repo languages + most-active scoring + repo detail fetch) against the
// shared GITHUB_TOKEN and pollutes `unstable_cache` with junk entries.
const ALLOWED_USERNAME = (
  process.env.NEXT_PUBLIC_GITHUB_USERNAME || "MA1002643"
).toLowerCase();

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "Missing 'username' query parameter." },
      { status: 400 }
    );
  }

  // GitHub usernames are case-insensitive, so normalize before comparing.
  if (username.toLowerCase() !== ALLOWED_USERNAME) {
    return NextResponse.json(
      { error: "Username not allowed" },
      { status: 403 }
    );
  }

  // Pass the canonical (lowercase) form downstream so callers can't multiply
  // the `unstable_cache` entries by varying input casing (`MA1002643` vs
  // `ma1002643` vs `Ma1002643`). `unstable_cache` hashes its function args
  // into the cache key — without this normalization the allowlist would let
  // a single approved user trigger N fresh GraphQL rebuilds, partially
  // defeating the token/rate-limit-exhaustion protection that gating by
  // username was supposed to provide.
  try {
    // Establish the request-scoped deadline once so every GraphQL call in
    // the cold-miss chain (findMostActiveRepo → getAllLanguages + fetch-
    // GitHubStats) shares a single wall-clock budget. Cache hits skip past
    // the helpers entirely and never consult the store.
    const deadline = Date.now() + GITHUB_OVERALL_BUDGET_MS;
    const data = await deadlineStore.run({ deadline }, () =>
      getCachedGithubStats(ALLOWED_USERNAME)
    );
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (error) {
    // Total upstream failure (rate limit, network, GraphQL error). Serve the
    // bundled snapshot so the about page never renders empty stat cards.
    console.error("GitHub stats fetch failed, serving fallback:", error);
    return NextResponse.json(
      { ...fallbackStats, _fallback: true },
      {
        headers: {
          ...CACHE_HEADERS,
          "X-Cache-Status": "FALLBACK",
        },
      }
    );
  }
}

async function getAllLanguages(username) {
  // ALL owned repos count toward the language totals: public + private,
  // forks + archived (no isFork/isArchived filter — a public fork/archived
  // repo lists like any other repo in the breakdown; a private one folds into
  // the private aggregate below). OWNER-only affiliation keeps other people's
  // (and orgs') repos out — same disclosure rationale as /api/github-skills.
  // `isPrivate` routes each repo's bytes into the public per-repo breakdown
  // or the count-only private bucket.
  const query = `
    query($username: String!, $after: String) {
      user(login: $username) {
        repositories(
          first: 100,
          after: $after,
          ownerAffiliations: OWNER
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            name
            url
            isPrivate
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges {
                size
                node {
                  name
                  color
                }
              }
            }
          }
        }
      }
    }
  `;

  let hasNextPage = true;
  let endCursor = null;
  const languageStats = {};

  // Bounded pagination — two independent stop conditions:
  //   1. MAX_REPO_PAGES — covers up to ~1,000 owned repos (10 × 100). Stops
  //      a long-tailed account or a malformed pageInfo loop from making
  //      infinite calls.
  //   2. MAX_TOTAL_GITHUB_MS — overall wall-clock budget. Even with the
  //      page cap, MAX_REPO_PAGES × GITHUB_TIMEOUT_MS (10 × 8 s = 80 s)
  //      exceeds typical serverless function limits. The wall-clock check
  //      ensures we exit before the platform kills the function, leaving
  //      time for response serialization and the route's own try/catch
  //      to serve the bundled fallback if needed.
  let pages = 0;
  const startTime = Date.now();
  while (hasNextPage && pages < MAX_REPO_PAGES) {
    // Defer to the shared request deadline when one is set (the GET handler
    // always sets one); otherwise fall back to the helper-local budget so
    // direct callers without a deadline in flight stay bounded.
    const remaining = remainingBudget(MAX_TOTAL_GITHUB_MS - (Date.now() - startTime));
    if (remaining <= 0) {
      console.warn(
        `getAllLanguages: overall budget exhausted after ${pages} pages; tail repos excluded from language totals.`
      );
      hasNextPage = false;
      break;
    }
    // Cap each page's per-call timeout to whatever budget is left so a slow
    // upstream near the end of the loop can't push total time past
    // MAX_TOTAL_GITHUB_MS — the prior code only gated *before* starting a
    // call, leaving an 8 s tail every iteration.
    const perCallTimeout = Math.min(GITHUB_TIMEOUT_MS, remaining);
    let data;
    try {
      data = await githubGraphQL(
        query,
        { username, after: endCursor },
        perCallTimeout
      );
    } catch (err) {
      // Distinguish budget-driven abort from real errors so partial results
      // are preserved on the former and the latter still propagate to the
      // route's bundled-fallback path.
      if (err?.name === "AbortError") {
        console.warn(
          `getAllLanguages: page ${pages + 1} aborted at ${perCallTimeout}ms cap (overall budget exhausted); partial results retained.`
        );
        hasNextPage = false;
        break;
      }
      throw err;
    }
    const repoData = data.user.repositories;
    const repos = repoData.nodes;

    // Aggregate sizes — overall per language AND per-repo. The per-repo map
    // lets each language expose the breakdown of which repos contribute its
    // bytes (the Most Used Languages card's hover popover). Keyed by repo
    // name; each entry also keeps the repo URL for the popover's links.
    //
    // Disclosure safety: a PRIVATE repo's name must never reach this public,
    // CDN-cached payload (same rule as /api/github-skills). Private repos'
    // bytes still count — into `privateSize` plus a name Set used only to
    // COUNT distinct private repos per language; the names are dropped when
    // the payload is built below ("N private repositories" + combined share).
    for (const repo of repos) {
      const isPrivate = Boolean(repo.isPrivate);
      for (const { size, node } of repo.languages.edges) {
        if (!languageStats[node.name]) {
          languageStats[node.name] = {
            size: 0,
            color: node.color,
            repos: {},
            privateSize: 0,
            privateNames: new Set(),
          };
        }
        const entry = languageStats[node.name];
        entry.size += size;
        if (!repo.name) continue;
        if (isPrivate) {
          entry.privateSize += size;
          entry.privateNames.add(repo.name);
        } else {
          if (!entry.repos[repo.name]) {
            entry.repos[repo.name] = { size: 0, url: repo.url ?? null };
          }
          entry.repos[repo.name].size += size;
        }
      }
    }

    hasNextPage = repoData.pageInfo.hasNextPage;
    endCursor = repoData.pageInfo.endCursor;
    pages += 1;
  }
  if (hasNextPage) {
    console.warn(
      `getAllLanguages: stopped paging at ${MAX_REPO_PAGES} pages. Language totals reflect approximately the first ${MAX_REPO_PAGES * 100} owned repos; tail repos are excluded.`
    );
  }

  const totalSize = Object.values(languageStats).reduce(
    (sum, lang) => sum + lang.size,
    0
  );

  // Zero-total fast path: a brand-new account with no code in any owned repo,
  // or an account whose repos all register a language with size 0, would
  // otherwise produce `NaN%` (0 / 0) or `Infinity%` (size / 0). Returning an
  // empty array is the truthful representation — "we have no language
  // signal" — and lets the consumer skip the language card entirely instead
  // of rendering rows with broken numerics.
  if (totalSize === 0) {
    return [];
  }

  // Sort and convert to percentage. Each language also carries its per-repo
  // breakdown: for every PUBLIC repo that contains the language, the share of
  // THAT language's bytes contributed by the repo (so the per-repo percentages
  // sum to ~100% within the language). Sorted biggest-first and capped to keep
  // the payload compact. Private usage ships as `privateRepos` — a bare COUNT
  // of distinct private repos plus their COMBINED share of the language's
  // bytes; names never leave this function. Omitted entirely when a language
  // has no private usage, so such rows stay byte-identical to before. The
  // popover renders it as one "N private repositories" row pinned to the top.
  return Object.entries(languageStats)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([language, info]) => ({
      language,
      color: info.color,
      size: info.size,
      percentage: ((info.size / totalSize) * 100).toFixed(2), // 2 decimal places
      repos: Object.entries(info.repos || {})
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, MAX_REPOS_PER_LANGUAGE)
        .map(([name, r]) => ({
          name,
          url: r.url,
          percentage:
            info.size > 0 ? ((r.size / info.size) * 100).toFixed(2) : "0.00",
        })),
      ...(info.privateNames.size > 0
        ? {
            privateRepos: {
              count: info.privateNames.size,
              percentage:
                info.size > 0
                  ? ((info.privateSize / info.size) * 100).toFixed(2)
                  : "0.00",
            },
          }
        : {}),
    }));
}

async function fetchGitHubStats(username, repoOwner, repoName, activityScore = 0) {
  // `hasRepo` gates the `repository` field via @include. When false, the
  // placeholder owner/name strings are never resolved against GitHub —
  // GraphQL still needs non-null values to satisfy the `String!` variable
  // contract, but @include(if: false) short-circuits before evaluation.
  const hasRepo = Boolean(repoOwner && repoName);
  const query = `
    query ($username: String!, $repoOwner: String!, $repoName: String!, $hasRepo: Boolean!) {
      user(login: $username) {
        name
        login
        createdAt
        followers { totalCount }
        repositories(first: 100, ownerAffiliations: OWNER) {
          nodes { name stargazerCount }
        }
        contributionsCollection {
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          totalRepositoriesWithContributedCommits
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount } }
          }
        }
      }
      repository(owner: $repoOwner, name: $repoName) @include(if: $hasRepo) {
        name
        # nameWithOwner (e.g. "vercel/next.js") is the disambiguation key
        # used by computeRepoDiff. Without it, two different repos that
        # happen to share a leaf name across different owners (e.g.
        # "acme/next.js" and "vercel/next.js") look identical to the diff
        # algorithm and a repo-switch wouldn't trigger the update banner.
        # NOTE: do not use backticks in this comment — the surrounding
        # template literal would terminate early and break the build.
        nameWithOwner
        description
        stargazerCount
        forkCount
        pushedAt
        watchers { totalCount }
        primaryLanguage { name color }
        issues(states: OPEN) { totalCount }
        closedIssues: issues(states: CLOSED) { totalCount }
        pullRequests(states: OPEN) { totalCount }
        mergedPRs: pullRequests(states: MERGED) { totalCount }
        defaultBranchRef {
          target {
            ... on Commit {
              history(first: 1) { totalCount }
            }
          }
        }
      }
    }
  `;

  const data = await githubGraphQL(query, {
    username,
    // When hasRepo is false these are inert placeholders that satisfy
    // GraphQL's String! contract but never get resolved.
    repoOwner: repoOwner || username,
    repoName: repoName || username,
    hasRepo,
  });
  const user = data.user;

  // today
  const today = new Date().toISOString().split("T")[0];
  const currentYear = new Date().getFullYear();

  // Helper to format dates
  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    const showYear = date.getFullYear() !== currentYear;
    const options = { month: "short", day: "numeric", ...(showYear && { year: "numeric" }) };
    return date.toLocaleDateString("en-US", options);
  };

  // Total stars
  const totalStars = user.repositories.nodes.reduce(
    (sum, repo) => sum + repo.stargazerCount,
    0
  );

  const {
    totalCommitContributions: commits,
    totalPullRequestContributions: prs,
    totalIssueContributions: issues,
    totalRepositoriesWithContributedCommits: contributedTo,
    contributionCalendar,
  } = user.contributionsCollection;

  const followers = user.followers.totalCount;
  const totalContributions = contributionCalendar.totalContributions;

  // Compute streaks
  const { currentStreak, longestStreak } = computeStreaks(contributionCalendar);

  // Streak endpoints are formatted with the year ALWAYS present, unlike the
  // general `formatDate` (which drops the year for the current year). The
  // resulting `dateRange` string is what `streakFingerprint`/`computeStreakDiff`
  // compare across polls to detect a "dates changed" event, so it must shift
  // ONLY when the underlying dates do. With the conditional-year `formatDate`, a
  // streak that crosses a New Year boundary reformats at midnight on Jan 1 —
  // "Dec 30 - Present" → "Dec 30, 2025 - Present" — a purely presentational
  // change the diff would mis-read as a real date move and surface as a false
  // "dates changed" banner. (This complements pinning `end` to `today` in
  // `computeStreaks`, which guards the daily midnight shift; this guards the
  // yearly one.) Affects the current streak's start and any current-year longest
  // streak's start/end alike.
  const formatStreakDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    // Pin to UTC. The input is a date-only `YYYY-MM-DD` string, which
    // `new Date(...)` parses as UTC midnight; without `timeZone: "UTC"`,
    // `toLocaleDateString` renders in the RUNTIME's local zone, so a function
    // deployed behind UTC would shift the day back one ("Dec 30" → "Dec 29")
    // and a function ahead of it forward. That makes the emitted `dateRange`
    // depend on deploy region and reintroduces the very fingerprint
    // instability this stable formatter exists to remove.
    return date.toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Replace today's date with "Present" & format
  const formatStreakRange = (start, end) => {
    if (!start || !end) return "No data";
    const displayEnd = end === today ? "Present" : formatStreakDate(end);
    return `${formatStreakDate(start)} - ${displayEnd}`;
  };

  // Rank calculation
  const { level, percentile } = calculateRank({
    all_commits: true,
    commits,
    prs,
    issues,
    reviews: 0,
    repos: contributedTo,
    stars: totalStars,
    followers,
  });

  const repo = data.repository;

  return {
    user: {
      username: user.login,
      name: user.name,
      createdAt: formatDate(user.createdAt),
    },
    stats: {
      commits,
      prs,
      issues,
      contributedTo,
      followers,
      stars: totalStars,
      totalContributions,
      level,
      percentile,
    },
    streaks: {
      totalContributions: {
        // Real calendar total (was hardcoded to 250) so the count-up and the
        // change-diff in the Current Streak card reflect actual activity.
        value: totalContributions,
        // Use the UTC-pinned `formatStreakDate` (not `formatDate`) for the
        // window start: the calendar day is a date-only `YYYY-MM-DD` parsed as
        // UTC midnight, so the conditional-TZ `formatDate` would render it one
        // day off depending on the deploy region. This range is excluded from
        // the streak fingerprint, so it's a display-stability fix only — but it
        // keeps the shown start day region-independent and consistent with the
        // streak rows below.
        dateRange: `${formatStreakDate(
          contributionCalendar.weeks[0].contributionDays[0].date
        )} - Present`,
      },
      currentStreak: {
        value: currentStreak.days,
        dateRange:
          currentStreak.days > 0
            ? formatStreakRange(currentStreak.start, currentStreak.end)
            : "No current streak",
      },
      longestStreak: {
        value: longestStreak.days,
        dateRange:
          longestStreak.days > 0
            ? formatStreakRange(longestStreak.start, longestStreak.end)
            : "No streak found",
      },
    },
    repo: repo
      ? {
        name: repo.name,
        // Stable disambiguating identifier ("owner/name", lowercased by
        // convention — though GitHub returns it case-preserved). Used by
        // `computeRepoDiff` to detect a true repo switch even when two
        // different repos share a leaf name under different owners.
        nameWithOwner: repo.nameWithOwner,
        description: parseGitHubText(repo.description || "No description"),
        language: repo.primaryLanguage?.name || "Unknown",
        languageColor: repo.primaryLanguage?.color || "#999999",
        stars: repo.stargazerCount,
        forks: repo.forkCount,
        watchers: repo.watchers?.totalCount || 0,
        openIssues: repo.issues?.totalCount || 0,
        closedIssues: repo.closedIssues?.totalCount || 0,
        openPRs: repo.pullRequests?.totalCount || 0,
        mergedPRs: repo.mergedPRs?.totalCount || 0,
        commitCount: repo.defaultBranchRef?.target?.history?.totalCount || 0,
        pushedAt: formatDate(repo.pushedAt),
        activityScore,
      }
      : null,
  };
}

// Scores every repository the user has contributed to in the last year by
// weighting commits, issues, PRs, reviews, and overall history depth — picks
// the highest-scoring repo as the one to feature on the about page. Wrapped in
// its own 24-hour cache layer since this query is expensive (paged contribution
// breakdowns + per-repo commit history) and changes slowly.
async function findMostActiveRepo(username) {
  // Initial query: contributions in full + first page of owned repos.
  // GitHub caps `*ContributionsByRepository` at maxRepositories: 100 with no
  // cursor available, so contributions cannot be paged — that's a platform
  // limit. `repositories` does expose pageInfo, so we paginate it below.
  const initialQuery = `
    query FindMostActiveRepo($username: String!, $after: String) {
      user(login: $username) {
        contributionsCollection {
          commitContributionsByRepository(maxRepositories: 100) {
            repository { name owner { login } }
            contributions { totalCount }
          }
          issueContributionsByRepository(maxRepositories: 100) {
            repository { name owner { login } }
            contributions { totalCount }
          }
          pullRequestContributionsByRepository(maxRepositories: 100) {
            repository { name owner { login } }
            contributions { totalCount }
          }
          pullRequestReviewContributionsByRepository(maxRepositories: 100) {
            repository { name owner { login } }
            contributions { totalCount }
          }
        }
        repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false) {
          pageInfo { hasNextPage endCursor }
          nodes {
            name
            owner { login }
            defaultBranchRef {
              target {
                ... on Commit {
                  history(first: 1) { totalCount }
                }
              }
            }
          }
        }
      }
    }
  `;

  // Cursor-only query for subsequent repo pages — skips the (expensive,
  // already-fetched) contributions block so each extra page only costs the
  // owned-repos slice.
  const reposPageQuery = `
    query FindMostActiveRepoReposPage($username: String!, $after: String!) {
      user(login: $username) {
        repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false) {
          pageInfo { hasNextPage endCursor }
          nodes {
            name
            owner { login }
            defaultBranchRef {
              target {
                ... on Commit {
                  history(first: 1) { totalCount }
                }
              }
            }
          }
        }
      }
    }
  `;

  // Track wall-clock from before the initial call so the budget covers the
  // expensive contributions query too — not just pagination follow-ups.
  // Pass the budget-capped timeout to the initial call so the entire
  // function's worst-case wall-clock is `MAX_TOTAL_GITHUB_MS`, not
  // `GITHUB_TIMEOUT_MS + MAX_TOTAL_GITHUB_MS`. An abort here unwinds
  // findMostActiveRepo cleanly — no partial state worth preserving without
  // the initial contributions block.
  const startTime = Date.now();
  const initialData = await githubGraphQL(
    initialQuery,
    { username, after: null },
    Math.min(GITHUB_TIMEOUT_MS, remainingBudget(MAX_TOTAL_GITHUB_MS))
  );
  const user = initialData.user;

  // Collect every owned repo across pages so the history-depth tie-breaker
  // covers users with >100 repos. For accounts with ≤100 repos the loop is
  // skipped and the function still completes in a single round-trip.
  // Two independent stop conditions:
  //   - MAX_REPO_PAGES: defends against malformed pageInfo (hasNextPage
  //     stuck true, endCursor unchanged) and legitimate >1,000-repo
  //     accounts.
  //   - MAX_TOTAL_GITHUB_MS: overall wall-clock budget. Page cap alone
  //     allows MAX_REPO_PAGES × GITHUB_TIMEOUT_MS (10 × 8 s = 80 s) worst
  //     case, well past typical serverless function limits — this check
  //     ensures we exit early enough to leave room for response serializa-
  //     tion and the route's bundled-fallback path.
  const ownedRepos = [...user.repositories.nodes];
  let { hasNextPage, endCursor } = user.repositories.pageInfo;
  let pages = 1;
  while (hasNextPage && pages < MAX_REPO_PAGES) {
    // Same shared-deadline-with-local-fallback pattern as getAllLanguages.
    const remaining = remainingBudget(MAX_TOTAL_GITHUB_MS - (Date.now() - startTime));
    if (remaining <= 0) {
      console.warn(
        `findMostActiveRepo: overall budget exhausted after ${pages} pages (${ownedRepos.length} repos); remaining pages skipped.`
      );
      hasNextPage = false;
      break;
    }
    // Cap per-call timeout to the remaining overall budget — see the matching
    // pattern in getAllLanguages for the rationale.
    const perCallTimeout = Math.min(GITHUB_TIMEOUT_MS, remaining);
    let pageData;
    try {
      pageData = await githubGraphQL(
        reposPageQuery,
        { username, after: endCursor },
        perCallTimeout
      );
    } catch (err) {
      if (err?.name === "AbortError") {
        console.warn(
          `findMostActiveRepo: page ${pages + 1} aborted at ${perCallTimeout}ms cap (overall budget exhausted); ${ownedRepos.length} repos retained.`
        );
        hasNextPage = false;
        break;
      }
      throw err;
    }
    ownedRepos.push(...pageData.user.repositories.nodes);
    ({ hasNextPage, endCursor } = pageData.user.repositories.pageInfo);
    pages += 1;
  }
  if (hasNextPage) {
    console.warn(
      `findMostActiveRepo: stopped paging owned repos at ${MAX_REPO_PAGES} pages (${ownedRepos.length} repos). History-depth boost will not apply to repos beyond this point; contribution-based scoring is unaffected.`
    );
  }

  const excludeSet = mostActiveRepoExclude(username);
  // Key entries by `owner/name` (lowercased) so the same repo accumulates
  // score across contribution categories, and so two repos that happen to
  // share a name under different owners stay distinct.
  const scoreByRepo = new Map();
  const addScore = (repo, weight, count) => {
    const name = repo?.name;
    const owner = repo?.owner?.login;
    if (!name || !owner || !count) return;
    const key = `${owner.toLowerCase()}/${name.toLowerCase()}`;
    if (excludeSet.has(key)) return;
    const prev = scoreByRepo.get(key);
    if (prev) {
      prev.score += weight * count;
    } else {
      scoreByRepo.set(key, { name, owner, score: weight * count });
    }
  };

  // Weight tiers, from highest signal to lowest:
  //   5 — PRs authored & PR reviews: the highest-effort engineering acts.
  //   4 — commits: substantive but commonplace.
  //   3 — issues: meaningful engagement but lower craft.
  //   1 — ambient owned-repo history (added below, soft tie-breaker).
  for (const c of user.contributionsCollection.commitContributionsByRepository) {
    addScore(c.repository, 4, c.contributions.totalCount);
  }
  for (const c of user.contributionsCollection.issueContributionsByRepository) {
    addScore(c.repository, 3, c.contributions.totalCount);
  }
  for (const c of user.contributionsCollection.pullRequestContributionsByRepository) {
    addScore(c.repository, 5, c.contributions.totalCount);
  }
  for (const c of user.contributionsCollection.pullRequestReviewContributionsByRepository) {
    addScore(c.repository, 5, c.contributions.totalCount);
  }
  // Tie-breaker: log-scaled boost from each owned repo's total commit history
  // — but only for repos that already accrued contribution score above. Two
  // independent constraints:
  //
  //   1. Gate on `scoreByRepo.has(key)`. Without this, a dormant deep-history
  //      repo (zero recent activity, thousands of legacy commits) adds its
  //      raw commit count to its score and trivially outranks a genuinely
  //      active repo — directly contradicting the "most active" intent.
  //   2. log10(commits + 1) scaling. Raw counts let history dominate
  //      contribution scoring too: 5,000 historical commits × weight 1
  //      (5,000) buries 50 recent commits × weight 4 (200). Log10 collapses
  //      the range so a 1,000-commit history adds ~3 and a 10,000-commit
  //      history adds ~4 — small enough to function as a tie-breaker
  //      between similarly-active candidates rather than the dominant term.
  //
  // `ownedRepos` covers every owned, non-fork repo across pages, so users
  // with >100 repos still get the tie-breaker signal where it applies.
  for (const repo of ownedRepos) {
    const name = repo?.name;
    const owner = repo?.owner?.login;
    if (!name || !owner) continue;
    const key = `${owner.toLowerCase()}/${name.toLowerCase()}`;
    if (!scoreByRepo.has(key)) continue;
    const commits = repo.defaultBranchRef?.target?.history?.totalCount || 0;
    if (commits <= 0) continue;
    addScore(repo, 1, Math.log10(commits + 1));
  }

  // No qualifying activity is a valid state (fresh fork-user with no recent
  // contributions). Return null instead of throwing so the endpoint can still
  // serve user/stats/streaks payloads and the repo card renders empty,
  // instead of forcing the whole response into the unrelated bundled fallback.
  if (scoreByRepo.size === 0) {
    return null;
  }

  let best = null;
  for (const entry of scoreByRepo.values()) {
    if (!best || entry.score > best.score) {
      best = entry;
    }
  }

  return { name: best.name, owner: best.owner, activityScore: best.score };
}

function computeStreaks(contributionCalendar) {
  const today = new Date().toISOString().slice(0, 10);

  // GitHub returns the FULL current week, so the calendar is padded with the
  // remaining (future) days of this week at contributionCount 0. Left in, those
  // trailing zero-days close the running streak before the loop ends AND make
  // the array's last element a future date — which is exactly why the current
  // streak was stuck at 0: the loop hit "tomorrow" (count 0), closed the streak
  // with end = today, and the ongoing-streak tail was never reached. Dropping
  // everything after today makes the array end on the real "today".
  const days = contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .filter((d) => d.date <= today);

  // --- Longest streak: scan forward, tracking each run's high-water mark. ---
  let longestStreak = { days: 0, start: null, end: null };
  let runStart = null;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    const { date, contributionCount } = days[i];
    if (contributionCount > 0) {
      if (run === 0) runStart = date;
      run++;
      if (run > longestStreak.days)
        longestStreak = { days: run, start: runStart, end: date };
    } else {
      run = 0;
    }
  }

  // --- Current streak: walk BACKWARD from the most recent day. ---
  // An empty TODAY does not break the streak — the day isn't over yet, so the
  // user may still contribute — so skip an empty today and continue from
  // yesterday. A gap older than that means the streak is genuinely broken.
  let currentStreak = { days: 0, start: null, end: null };
  let i = days.length - 1;
  const skippedEmptyToday =
    i >= 0 && days[i].date === today && days[i].contributionCount === 0;
  if (skippedEmptyToday) {
    i--; // today not contributed yet — don't count it, but don't break on it
  }
  if (i >= 0 && days[i].contributionCount > 0) {
    // Keep `end` at TODAY when the only skipped day is an empty today: the
    // streak is still ongoing (the day just isn't over yet). Pinning it to
    // yesterday's date would make `formatStreakRange` drop the "Present" label
    // AND shift `currentStreak.dateRange` at every midnight rollover, which
    // `streakFingerprint` would read as a real change and fire a false banner.
    const end = skippedEmptyToday ? today : days[i].date;
    let start = end;
    let count = 0;
    while (i >= 0 && days[i].contributionCount > 0) {
      start = days[i].date;
      count++;
      i--;
    }
    currentStreak = { days: count, start, end };
  }

  return { currentStreak, longestStreak };
}

