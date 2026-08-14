import { NextResponse } from 'next/server';
import {
  computePortfolioSignal,
  buildMessage,
  buildSecondaryMessage,
  buildHeadline,
  WORK_STATES,
} from '@/utils/workSignal';
import { refineMessageWithAI } from '@/utils/workMessageAI';
import * as cache from '@/utils/workStatusCache';
import {
  getTrackedRepos,
  isTrackedRepo,
  nameWithOwnerOf,
} from '@/utils/workTrackedRepos';

// Multi-repo portfolio signal (issue #94). The repos this endpoint may
// report on live in the workTrackedRepos allow-list — never in env vars —
// so a misconfigured deployment can't widen the scope. One aliased
// GraphQL query covers every tracked repo per request (§3.2): GraphQL
// cost scales with `first:` caps, not with the number of aliases, so the
// query stays at a handful of rate-limit points regardless of N.

// Project boards (Projects v2) — issue #94 Phase 3. Every tracked repo
// may declare its user-level board via `projectNumber` in
// workTrackedRepos.js (the same allow-list that scopes the repo query).
//
// Boards are read ONE QUERY PER BOARD, all boards in flight concurrently.
// They used to share a single aliased query like the portfolio read, but
// unlike the portfolio query that shape does not hold up here: GraphQL
// *cost* scales with the `first:` caps (the aliased board query billed a
// flat 1 point), while *latency* scales with the number of items whose
// `content` has to be resolved. At 11 boards × up to 100 items the single
// query measured 4.8–8.7s against this route's 5s fetch ceiling, so it
// aborted more often than not and every board silently vanished from the
// signal together. Per-board queries measure ~1s each and ~2.0–2.4s wall
// concurrently — a ~2.6s margin under the ceiling — at 13 points instead
// of 1. That is the deliberate trade: a few more rate-limit points (still
// a fraction of the 5,000/hr budget, and now actually recorded via
// recordRateLimit) in exchange for a board signal that arrives at all.
// Splitting per board also buys failure isolation: one slow or broken
// board degrades to "no items from that board" instead of taking the
// whole board read down with it.
//
// Each board is paginated to completion rather than capped at one page.
// The old single-page `first: 100` silently truncated any board with more
// items (ma.codes 141, AfaaqX 169 at the time of writing) and Projects v2
// returns items in board order, not status order — so an "In Progress"
// card sitting past position 100 was invisible to the header.
//
// We read two columns per board:
//   - "In Progress" → drives the IN_PROGRESS state and current-work items.
//   - "Done" (within last 48h) → drives the SHIPPING state and the
//     "just shipped" rotating message.
// Items are grouped by their issue/PR's repository and attached to the
// matching tracked repo, so the roll-up in workSignal.js (already
// multi-repo) merges boards exactly like it merges repo activity. If the
// PAT lacks Projects: Read or the query fails for any reason, the route
// silently falls back to the repo-wide open-issues logic below.
const PROJECT_OWNER = 'MA1002643';
const IN_PROGRESS_STATUS = 'in progress';
const DONE_STATUS = 'done';
const SHIPPED_WINDOW_MS = 48 * 60 * 60 * 1000;

// "Pushes 24h" counter window. Also passed to GraphQL as the commit
// history `since:` bound so the query never pays for older history.
const PUSH_WINDOW_MS = 24 * 60 * 60 * 1000;

// meta.activityTrace: merged per-UTC-day commit counts across tracked
// repos for the header's ACTIVITY sparkline. 14 whole UTC-day buckets;
// the last bucket is today (partial). The trace walks EVERY branch head
// (refs/heads/*) per repo, not just the default branch, so feature-branch
// work registers before it merges — a squash-merged week no longer
// collapses into a single bar. Commits are deduped by oid per repo
// (mapRepoNode) because each branch's history contains the default-branch
// commits it forked from. Caps: 25 branches × 50 commits per branch; the
// whole portfolio query still measures ~2 rate-limit points (refs can't
// be ordered by recency, so the branch cap is generous). Overflow is
// flagged via `truncated`, never paginated.
const DAY_MS = 24 * 60 * 60 * 1000;
const TRACE_DAYS = 14;
const TRACE_BRANCH_CAP = 25;
const TRACE_COMMITS_PER_BRANCH = 50;

const GITHUB_API = 'https://api.github.com/graphql';
const TOKEN = process.env.GITHUB_TOKEN;
// Optional separate token for the Projects v2 query — see fetchProjectActivity.
// Falls back to the main token when not set so single-token setups still work.
// `||`, not `??`: env files routinely carry the var as an EMPTY string
// (GITHUB_PROJECT_TOKEN=""), and `??` would pass that through as a real
// value — the route then sends `Bearer ` and every board query silently
// 401s into the no-board fallback with nothing logged.
const PROJECT_TOKEN = process.env.GITHUB_PROJECT_TOKEN || process.env.GITHUB_TOKEN;

// Cap each GraphQL round-trip so a slow GitHub doesn't stall the handler
// for the entire function timeout — surface the failure to the catch in
// GET, which serves stale cache or the deterministic fallback.
//
// These are sized from measured latency, not guessed. A single 5s cap used
// to cover both queries and sat far too close to their real cost:
//   - the portfolio query measures 2.7–3.2s (13 repos, and the all-branch
//     activity trace alone can walk 25 branches × 50 commits per repo), so
//     5s left under 2s of headroom on a query GitHub routinely varies by
//     seconds — it tipped over the edge under any extra load.
//   - a single board page measures ~1s.
// Each therefore gets a ceiling proportional to its own weight. The two
// run concurrently, so the handler's worst case is the larger of them,
// and a breach still degrades to stale cache rather than an error page.
const PORTFOLIO_TIMEOUT_MS = 10000;
const BOARD_TIMEOUT_MS = 6000;

// Boards are fetched concurrently, but not all at once: the portfolio
// query shares the same origin and connection pool, and saturating it
// with a dozen simultaneous board requests measurably slowed the
// portfolio read. A small pool keeps board wall-time near its floor
// without crowding out the heavier query running alongside it.
const BOARD_CONCURRENCY = 5;

// Layered rate-limit defence (§4.2 / §5). Every portfolio query returns
// `rateLimit { cost remaining resetAt }` in the same response, so the
// route self-throttles instead of guessing:
//   remaining < 200 (soft) → skip AI refinement, reject privileged busts.
//   remaining < 50 (hard)  → stop calling GitHub entirely; serve cache
//                            until the budget window resets.
// Module-level like the in-memory cache: per-instance, reset on deploy.
const RATE_SOFT_FLOOR = 200;
const RATE_HARD_FLOOR = 50;
let rateGuard = { remaining: null, resetAt: null };

// Warn about a low soft-budget at most once per GitHub reset window.
// recordRateLimit runs on every successful fetch, so during the tail of a
// depleted window (with the client polling) an unguarded warn would repeat
// on every poll. Keyed on the window's resetAt: a new window's resetAt
// re-arms the warning. Sentinel start value guarantees the first warn fires
// even when resetAt is absent (null window key).
const SOFT_WARN_UNSET = Symbol('soft-warn-unset');
let softWarnedResetAt = SOFT_WARN_UNSET;

function recordRateLimit(rateLimit) {
  if (!rateLimit || typeof rateLimit.remaining !== 'number') return;
  const resetAtMs = rateLimit.resetAt ? Date.parse(rateLimit.resetAt) : NaN;
  rateGuard = {
    remaining: rateLimit.remaining,
    resetAt: Number.isNaN(resetAtMs) ? null : resetAtMs,
  };
  if (process.env.NODE_ENV !== 'production') {
    console.info(
      `work-status rateLimit: cost=${rateLimit.cost} remaining=${rateLimit.remaining} resetAt=${rateLimit.resetAt}`,
    );
  }
  if (typeof rateLimit.cost === 'number' && rateLimit.cost > 20) {
    console.warn(
      `work-status: GraphQL query cost ${rateLimit.cost} pts exceeds the 20-pt alert threshold — check TRACKED_REPOS size and 'first:' caps`,
    );
  }
  if (rateLimit.remaining < RATE_SOFT_FLOOR) {
    if (softWarnedResetAt !== rateGuard.resetAt) {
      softWarnedResetAt = rateGuard.resetAt;
      console.warn(
        `work-status: GitHub rate budget low (${rateLimit.remaining} pts remaining, resets ${rateLimit.resetAt}) — pausing AI refinement and privileged busts`,
      );
    }
  }
}

// The tighter of two `rateLimit { cost remaining resetAt }` reads. Both
// the portfolio and the board queries draw on the same hourly budget, so
// the guard should track whichever saw less of it left.
function lowerBudget(a, b) {
  if (!a || typeof a.remaining !== 'number') return b ?? null;
  if (!b || typeof b.remaining !== 'number') return a;
  return b.remaining < a.remaining ? b : a;
}

function rateGuardActive(floor) {
  if (typeof rateGuard.remaining !== 'number') return false;
  if (rateGuard.remaining >= floor) return false;
  // The budget window has rolled over — clear the guard and resume.
  if (rateGuard.resetAt && Date.now() >= rateGuard.resetAt) {
    rateGuard = { remaining: null, resetAt: null };
    return false;
  }
  return true;
}

async function fetchGitHubGraphQL(token, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(GITHUB_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      // Bypass any framework-level fetch cache; our in-memory cache is the
      // single source of truth and is invalidated on webhook delivery.
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const bustRequested = searchParams.get('bust') === '1';

  // Cache-bust is privileged: it forces a fresh GitHub fetch and would
  // otherwise let any unauthenticated caller amplify our outgoing API
  // traffic (potentially exhausting GitHub or OpenAI rate limits).
  // Vercel Cron Jobs automatically include `Authorization: Bearer
  // ${CRON_SECRET}` on the request, so the scheduled cron in vercel.json
  // still works once CRON_SECRET is set in the project's env vars.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') ?? '';
  const bustAuthorized =
    Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

  if (bustRequested && !bustAuthorized) {
    return NextResponse.json(
      { error: 'unauthorized cache bust' },
      { status: 401 },
    );
  }

  const bust = bustRequested && bustAuthorized;

  // Even authorized busts are refused while the GitHub budget is low —
  // a bust exists to force spending, which is exactly what the guard is
  // protecting against (§9.5).
  if (bust && rateGuardActive(RATE_SOFT_FLOOR)) {
    return NextResponse.json(
      { error: 'GitHub rate-limit guard active — bust rejected' },
      {
        status: 429,
        headers: { 'Cache-Control': 'private, no-store, must-revalidate' },
      },
    );
  }

  if (!bust) {
    const fresh = cache.read();
    if (fresh) return jsonResponse(fresh, 'HIT');
  }

  if (!TOKEN) {
    // Without a token we can't safely call the API. Return the deterministic
    // fallback so the header still renders something coherent.
    const payload = buildIdlePayload(
      'GitHub token not configured — falling back to maintenance mode.',
    );
    cache.write(payload);
    return jsonResponse(payload, 'FALLBACK', { bust });
  }

  // Hard floor: below RATE_HARD_FLOOR remaining points the route stops
  // calling GitHub entirely until the window resets — stale data beats
  // burning the last of the budget.
  if (rateGuardActive(RATE_HARD_FLOOR)) {
    console.warn(
      'work-status: hard rate-limit floor active — serving cache without fetching',
    );
    const stale = cache.readStale();
    const payload =
      stale ??
      buildIdlePayload('GitHub rate budget exhausted — waiting for reset.');
    return jsonResponse(payload, 'RATE_LIMITED', { bust });
  }

  try {
    // Portfolio query and project board query run in parallel. The board
    // is authoritative for IN_PROGRESS/SHIPPING when available; the
    // portfolio data always feeds the counts and popover breakdown.
    const [portfolio, projectActivity] = await Promise.all([
      fetchPortfolioActivity(getTrackedRepos()),
      fetchProjectActivity().catch((err) => {
        console.warn(
          'Project board unavailable, using fallback signal:',
          err?.message ?? err,
        );
        return null;
      }),
    ]);

    // Boards are now several queries rather than one aliased query, so
    // their spend is material and must reach the guard — previously only
    // the portfolio's rateLimit was recorded and board cost was invisible.
    // recordRateLimit overwrites the guard wholesale, so pick the tighter
    // of the two reads rather than letting call order decide.
    recordRateLimit(lowerBudget(portfolio.rateLimit, projectActivity?.rateLimit));

    // Attach each repo's board items (fetchProjectActivity groups items
    // by the underlying issue/PR's repository, lower-cased) so the
    // roll-up merges every board's signal, not just the primary repo's.
    const repos = portfolio.repos.map((repo) => {
      const boardItems =
        projectActivity?.byRepo?.[repo.nameWithOwner.toLowerCase()];
      return boardItems ? { ...repo, ...boardItems } : repo;
    });

    const signal = computePortfolioSignal({ repos });
    const baseMessage = buildMessage(signal);
    const secondaryMessage = buildSecondaryMessage(signal);
    const headline = buildHeadline(signal);

    // Soft floor: the deterministic template is free — skip the OpenAI
    // call while the GitHub budget is under pressure (§4.5).
    const softRateLimit = rateGuardActive(RATE_SOFT_FLOOR);
    const message = softRateLimit
      ? baseMessage
      : await refineMessageWithAI({ signal, fallback: baseMessage });

    const payload = {
      state: signal.state,
      headline,
      message,
      // Optional second message for Pattern D rotation. When non-null,
      // the client cycles between `message` and `secondaryMessage` every
      // ~10 seconds so both "what I'm working on" and "what I just
      // shipped" get airtime in the same header.
      secondaryMessage,
      meta: {
        // Summed portfolio totals — field names unchanged from the
        // single-repo payload so stale client builds keep working (§4.6).
        activePrs: signal.activePrs,
        activeIssues: signal.activeIssues,
        recentPushes: signal.recentPushes,
        topItems: signal.topItems,
        shippedItems: signal.shippedItems,
        recentlyShippedCount: signal.recentlyShippedCount,
        // Additive multi-repo fields powering the hover popovers.
        byRepo: signal.byRepo,
        breakdown: signal.breakdown,
        // 14-day commit sparkline for the header's ACTIVITY field.
        activityTrace: buildActivityTrace(repos, portfolio.traceSince),
        confidence: signal.confidence,
        lastUpdated: new Date().toISOString(),
        lastActivityAt: signal.lastActivityAt,
        // Soft warning for the client's adaptive polling — it backs off
        // to a slower cadence while the guard is active (§5).
        ...(softRateLimit ? { softRateLimit: true } : {}),
      },
    };

    cache.write(payload);
    return jsonResponse(payload, 'MISS', { bust });
  } catch (err) {
    console.error('work-status error:', err);
    // Serve stale cache if we have it — better than a broken header.
    const stale = cache.readStale();
    if (stale) {
      return jsonResponse(stale, 'STALE', { bust });
    }
    const payload = buildIdlePayload();
    return jsonResponse(payload, 'FALLBACK', { bust });
  }
}

// `bust` responses must NOT be stored by shared caches — otherwise a
// second `?bust=1` within the 30s s-maxage window would be served from
// the edge and never reach the origin, defeating the whole point of the
// bust. Normal responses keep the public/s-maxage caching so the edge
// shields the origin between polls.
const jsonResponse = (payload, cacheStatus, { bust = false } = {}) =>
  NextResponse.json(payload, {
    headers: {
      'Cache-Control': bust
        ? 'private, no-store, must-revalidate'
        : 'public, s-maxage=30, stale-while-revalidate=60',
      'X-Cache-Status': cacheStatus,
    },
  });

const EMPTY_BREAKDOWN = { prs: [], issues: [], pushes: [] };

const buildIdlePayload = (note) => {
  const signal = {
    state: WORK_STATES.IDLE,
    activePrs: 0,
    activeIssues: 0,
    recentPushes: 0,
    topItems: [],
    lastActivityAt: null,
    confidence: 0,
  };
  return {
    state: signal.state,
    headline: buildHeadline(signal),
    message: buildMessage(signal),
    meta: {
      activePrs: 0,
      activeIssues: 0,
      recentPushes: 0,
      topItems: [],
      byRepo: {},
      breakdown: EMPTY_BREAKDOWN,
      activityTrace: emptyActivityTrace(),
      confidence: 0,
      lastUpdated: new Date().toISOString(),
      lastActivityAt: null,
      ...(note ? { note } : {}),
    },
  };
};

// One aliased GraphQL query covering open PRs, open issues, recent
// default-branch commits, and the all-branch activity trace for EVERY
// tracked repo (§3.2). Aliases share a single HTTP round-trip and a
// single rate-limit read; `totalCount` on each connection gives true
// counts regardless of the 10-node pagination cap, which only bounds the
// popover lists. The pushes counter stays default-branch-only by design —
// only the ACTIVITY trace reads all branch heads.
function buildPortfolioQuery(repos) {
  const varDecls = repos
    .map((_, i) => `$r${i}Owner: String!, $r${i}Name: String!`)
    .join(', ');
  const aliases = repos
    .map(
      (_, i) =>
        `r${i}: repository(owner: $r${i}Owner, name: $r${i}Name) { ...RepoActivity }`,
    )
    .join('\n      ');

  return `
    query Portfolio($since: GitTimestamp!, $traceSince: GitTimestamp!, ${varDecls}) {
      rateLimit { cost remaining resetAt }
      ${aliases}
    }
    fragment RepoActivity on Repository {
      nameWithOwner
      pullRequests(states: OPEN, first: 10, orderBy: {field: UPDATED_AT, direction: DESC}) {
        totalCount
        nodes {
          number
          title
          createdAt
          updatedAt
          url
        }
      }
      issues(states: OPEN, first: 10, orderBy: {field: UPDATED_AT, direction: DESC}) {
        totalCount
        nodes {
          number
          title
          createdAt
          updatedAt
          url
        }
      }
      defaultBranchRef {
        target {
          ... on Commit {
            history(first: 30, since: $since) {
              totalCount
              nodes {
                committedDate
                messageHeadline
                abbreviatedOid
                url
              }
            }
          }
        }
      }
      refs(refPrefix: "refs/heads/", first: ${TRACE_BRANCH_CAP}) {
        totalCount
        nodes {
          target {
            ... on Commit {
              trace: history(first: ${TRACE_COMMITS_PER_BRANCH}, since: $traceSince) {
                totalCount
                nodes {
                  oid
                  committedDate
                }
              }
            }
          }
        }
      }
    }
  `;
}

const mapRepoNode = (repo, node) => {
  // 14-day all-branch trace (additive; computePortfolioSignal destructures
  // only the keys it knows, so these ride along inertly and can't shift
  // the signal). Dedupe by oid: every branch's history contains the
  // default-branch commits it forked from, so summing branch histories
  // would count main's commits once per branch. Dates only — the trace
  // needs day buckets, not commit detail. `traceTruncated` means commits
  // we never saw: more branches than the refs cap fetched, or a branch's
  // history hitting its node cap.
  const refsConn = node.refs ?? {};
  const seenTraceOids = new Set();
  const traceCommitDates = [];
  let traceTruncated =
    (refsConn.totalCount ?? 0) > (refsConn.nodes ?? []).length;
  for (const ref of refsConn.nodes ?? []) {
    const trace = ref?.target?.trace;
    if (!trace) continue;
    if ((trace.totalCount ?? 0) > (trace.nodes ?? []).length) {
      traceTruncated = true;
    }
    for (const commit of trace.nodes ?? []) {
      if (!commit?.oid || seenTraceOids.has(commit.oid)) continue;
      seenTraceOids.add(commit.oid);
      traceCommitDates.push(commit.committedDate);
    }
  }

  return {
    displayName: repo.displayName,
    nameWithOwner: node.nameWithOwner ?? nameWithOwnerOf(repo),
    pullRequests: (node.pullRequests?.nodes ?? []).map((pr) => ({
      number: pr.number,
      title: pr.title,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      url: pr.url,
      state: 'open',
    })),
    issues: (node.issues?.nodes ?? []).map((i) => ({
      number: i.number,
      title: i.title,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      url: i.url,
      state: 'open',
    })),
    commits: (node.defaultBranchRef?.target?.history?.nodes ?? []).map((c) => ({
      committedAt: c.committedDate,
      messageHeadline: c.messageHeadline,
      sha: c.abbreviatedOid,
      url: c.url,
    })),
    totalActivePrs: node.pullRequests?.totalCount ?? 0,
    totalActiveIssues: node.issues?.totalCount ?? 0,
    totalRecentPushes: node.defaultBranchRef?.target?.history?.totalCount ?? 0,
    traceCommitDates,
    traceTruncated,
  };
};

async function fetchPortfolioActivity(repos) {
  const since = new Date(Date.now() - PUSH_WINDOW_MS).toISOString();
  // Trace bound: UTC midnight opening the oldest of the 14 buckets, so
  // bucketing math in buildActivityTrace aligns exactly with the GraphQL
  // `since:` bound (UTC has no DST — integer division by DAY_MS is exact).
  const traceSinceDate = new Date(Date.now() - (TRACE_DAYS - 1) * DAY_MS);
  traceSinceDate.setUTCHours(0, 0, 0, 0);
  const traceSince = traceSinceDate.toISOString();
  const variables = { since, traceSince };
  repos.forEach((repo, i) => {
    variables[`r${i}Owner`] = repo.owner;
    variables[`r${i}Name`] = repo.name;
  });

  const response = await fetchGitHubGraphQL(
    TOKEN,
    { query: buildPortfolioQuery(repos), variables },
    PORTFOLIO_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}`);
  }

  const json = await response.json();

  // Partial-failure tolerance (§9.2): when one alias errors (repo renamed,
  // token scope, etc.) GitHub returns `null` for that alias plus an
  // `errors` array while the other aliases still resolve. Keep whatever
  // resolved; only fail the request when NO repo came back.
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    console.warn(
      'work-status GraphQL partial errors:',
      json.errors.map((e) => e?.message ?? 'unknown').join('; '),
    );
  }

  const results = [];
  repos.forEach((repo, i) => {
    const node = json.data?.[`r${i}`];
    if (!node) {
      console.warn(
        `work-status: no data for tracked repo ${nameWithOwnerOf(repo)} — skipping`,
      );
      return;
    }
    results.push(mapRepoNode(repo, node));
  });

  if (results.length === 0) {
    throw new Error(
      json.errors?.[0]?.message ?? 'no repository data returned',
    );
  }

  return { repos: results, rateLimit: json.data?.rateLimit ?? null, traceSince };
}

// Merged per-UTC-day commit counts across tracked repos, all branches,
// already deduped per repo by mapRepoNode. counts[0] is the oldest day
// (traceSince), counts[TRACE_DAYS - 1] is today (UTC, partial). `total`
// is the number of unique commits observed across fetched branch heads —
// summing per-branch GraphQL totalCounts would double-count shared
// history, so exactness now depends on `truncated`: when set, capped
// branches under-count their OLDEST buckets (history arrives newest-
// first) and uncounted branches may be missing entirely.
function buildActivityTrace(repos, sinceIso) {
  const sinceMs = Date.parse(sinceIso);
  const counts = new Array(TRACE_DAYS).fill(0);
  let total = 0;
  let truncated = false;
  for (const repo of repos) {
    const dates = repo.traceCommitDates ?? [];
    total += dates.length;
    if (repo.traceTruncated) truncated = true;
    for (const iso of dates) {
      const t = Date.parse(iso);
      if (Number.isNaN(t)) continue;
      const idx = Math.floor((t - sinceMs) / DAY_MS);
      if (idx >= 0 && idx < TRACE_DAYS) counts[idx] += 1;
    }
  }
  return { days: TRACE_DAYS, since: sinceIso, counts, total, truncated };
}

const emptyActivityTrace = () => {
  const start = new Date(Date.now() - (TRACE_DAYS - 1) * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  return {
    days: TRACE_DAYS,
    since: start.toISOString(),
    counts: new Array(TRACE_DAYS).fill(0),
    total: 0,
    truncated: false,
  };
};

// One board's worth of items, paginated to completion. `after: null` on
// the first page is the GraphQL spec's "start from the beginning", so the
// same document serves every page. Returns { nodes, rateLimit } — the
// rateLimit ride-along lets the caller feed real board spend into the
// same guard the portfolio query already updates, instead of the boards
// drawing down the budget invisibly.
//
// AUTH_FAILURE is a sentinel rather than a throw: a PAT without
// Projects: Read fails identically for every board, and that's a
// configuration state the caller reports once, not a per-board error.
const BOARD_PAGE_SIZE = 100;
// Safety stop so a runaway cursor can't loop forever. 5 × 100 items is
// well clear of the largest board today (169) with room to grow.
const BOARD_MAX_PAGES = 5;
const AUTH_FAILURE = Symbol('projects-auth-failure');

const BOARD_ITEM_FIELDS = `
  content {
    __typename
    ... on Issue {
      number
      title
      url
      createdAt
      updatedAt
      closedAt
      state
      repository { nameWithOwner }
    }
    ... on PullRequest {
      number
      title
      url
      createdAt
      updatedAt
      closedAt
      state
      repository { nameWithOwner }
    }
  }
  status: fieldValueByName(name: "Status") {
    ... on ProjectV2ItemFieldSingleSelectValue { name }
  }
`;

// $number is a real GraphQL variable now that each board gets its own
// query — no interpolation of board numbers into the document at all.
const BOARD_QUERY = `
  query($login: String!, $number: Int!, $after: String) {
    rateLimit { cost remaining resetAt }
    user(login: $login) {
      projectV2(number: $number) {
        items(first: ${BOARD_PAGE_SIZE}, after: $after) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes { ${BOARD_ITEM_FIELDS} }
        }
      }
    }
  }
`;

async function fetchBoardItems(boardNumber) {
  const nodes = [];
  let rateLimit = null;
  let after = null;

  for (let page = 0; page < BOARD_MAX_PAGES; page += 1) {
    const response = await fetchGitHubGraphQL(
      PROJECT_TOKEN,
      {
        query: BOARD_QUERY,
        variables: { login: PROJECT_OWNER, number: boardNumber, after },
      },
      BOARD_TIMEOUT_MS,
    );

    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404
    ) {
      return AUTH_FAILURE;
    }
    if (!response.ok) {
      throw new Error(`Projects v2 API ${response.status}`);
    }

    const json = await response.json();
    if (json.errors) {
      const msg = (json.errors[0]?.message ?? '').toLowerCase();
      if (
        msg.includes('scope') ||
        msg.includes('permission') ||
        msg.includes('forbidden')
      ) {
        return AUTH_FAILURE;
      }
      throw new Error(json.errors[0]?.message ?? 'Projects v2 GraphQL error');
    }

    // Every page reports the budget; the last one read is the freshest.
    if (json.data?.rateLimit) rateLimit = json.data.rateLimit;

    const conn = json.data?.user?.projectV2?.items;
    // A board number that doesn't resolve (deleted/renumbered board) comes
    // back as a null projectV2 with no error — treat it as an empty board
    // rather than a failure, so one stale projectNumber in the allow-list
    // can't take the rest of the signal down.
    if (!conn) break;

    nodes.push(...(conn.nodes ?? []));
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;

    if (page === BOARD_MAX_PAGES - 1) {
      console.warn(
        `work-status: board ${boardNumber} still had pages after ${BOARD_MAX_PAGES} × ${BOARD_PAGE_SIZE} items — raise BOARD_MAX_PAGES`,
      );
    }
  }

  return { nodes, rateLimit };
}

// Reads every tracked Projects v2 board (issue #94 Phase 3) — one
// paginated query per board, all boards concurrently — and returns
// { byRepo, rateLimit }. byRepo maps a lower-cased nameWithOwner →
//   - inProgressItems: items in the "In Progress" status column
//   - shippedItems: items in the "Done" column whose underlying issue/PR
//                   was closed within SHIPPED_WINDOW_MS (last 48h). Older
//                   Done items don't qualify as "just shipped" and are
//                   silently dropped.
// map covering only TRACKED repos — an item whose issue lives outside the
// allow-list is dropped, so a board can never widen the header's scope.
// Board numbers come from `projectNumber` in workTrackedRepos.js.
// Returns null when no board is configured, or when EVERY board failed —
// including the auth case (PAT missing Projects: Read) — so the caller
// falls back to the repo-wide signal. A partial failure is not fatal: the
// boards that did resolve still contribute, and the ones that didn't are
// logged individually. Returns { byRepo: {} } if boards are reachable but
// the tracked columns are empty.
async function fetchProjectActivity() {
  const boardNumbers = [
    ...new Set(
      getTrackedRepos()
        .map((repo) => repo.projectNumber)
        .filter(Number.isInteger),
    ),
  ];
  if (boardNumbers.length === 0) return null;

  // Bounded fan-out: BOARD_CONCURRENCY workers draining a shared queue,
  // writing each result back at its board's own index so the output order
  // is stable regardless of which worker finished first.
  const settled = new Array(boardNumbers.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(BOARD_CONCURRENCY, boardNumbers.length) },
      async () => {
        while (next < boardNumbers.length) {
          const index = next;
          next += 1;
          const boardNumber = boardNumbers[index];
          try {
            settled[index] = await fetchBoardItems(boardNumber);
          } catch (err) {
            console.warn(
              `work-status: board ${boardNumber} unavailable —`,
              err?.message ?? err,
            );
          }
        }
      },
    ),
  );

  const authFailures = settled.filter((r) => r === AUTH_FAILURE).length;
  const boards = settled.filter((r) => r && r !== AUTH_FAILURE);

  if (boards.length === 0) {
    // Every board failed. Auth is the common, actionable case and is worth
    // naming explicitly — it means the PAT is missing Projects: Read.
    if (authFailures === boardNumbers.length) {
      console.warn(
        'work-status: Projects v2 unreadable for every board — check the PAT has Projects: Read',
      );
    }
    return null;
  }
  if (boards.length < boardNumbers.length) {
    console.warn(
      `work-status: ${boardNumbers.length - boards.length}/${boardNumbers.length} project boards unavailable — signal built from the rest`,
    );
  }

  // Report the tightest budget any board saw, so the guard reacts to the
  // real remaining allowance rather than the most optimistic page.
  const rateLimit = boards
    .map((b) => b.rateLimit)
    .filter((r) => r && typeof r.remaining === 'number')
    .reduce((lowest, r) => (!lowest || r.remaining < lowest.remaining ? r : lowest), null);

  const nowMs = Date.now();
  const byRepo = {};
  const bucketFor = (key) =>
    (byRepo[key] ??= { inProgressItems: [], shippedItems: [] });

  for (const board of boards) {
    for (const item of board.nodes) {
      const c = item?.content;
      if (!c) continue;
      if (c.__typename !== 'Issue' && c.__typename !== 'PullRequest') continue;
      // Case-insensitive like every other repo membership check: GitHub is
      // case-preserving in payloads, so a repo re-case must not drop items.
      // Only tracked repos may receive items — a board card pointing at an
      // untracked repo is dropped, keeping the allow-list authoritative.
      const repoKey = c.repository?.nameWithOwner?.toLowerCase();
      if (!repoKey || !isTrackedRepo(repoKey)) continue;

      // `status` is the aliased fieldValueByName(name: "Status") — the
      // only field the signal needs, so the query skips the full
      // fieldValues subtree (a ~20× node saving per item, which is what
      // keeps a whole board's page inside the 5s fetch timeout).
      if (!item.status?.name) continue;
      const statusName = item.status.name.toLowerCase();

      // `url` + `createdAt` make the record self-contained (the full
      // ActivityItem shape minus repo tags, which the roll-up adds) —
      // board items must not depend on the capped per-repo breakdown
      // lists for Focus-link resolution or age labels, because an item
      // outside a repo's 10 most-recently-updated has no entry there.
      const baseRecord = {
        type: c.__typename === 'Issue' ? 'issue' : 'pr',
        number: c.number,
        title: c.title,
        url: c.url,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };

      if (statusName === IN_PROGRESS_STATUS) {
        // In-progress items must be open — closed items in this column
        // are usually stale and skip into Done by themselves.
        if (c.state && c.state !== 'OPEN') continue;
        bucketFor(repoKey).inProgressItems.push(baseRecord);
      } else if (statusName === DONE_STATUS) {
        // Use closedAt as the "moved to Done" proxy. If the item has no
        // closedAt (rare — Done item that's still open), treat it as not
        // recent. Items closed > 48h ago are silently dropped.
        const closed = c.closedAt ? Date.parse(c.closedAt) : null;
        if (!closed || nowMs - closed > SHIPPED_WINDOW_MS) continue;
        bucketFor(repoKey).shippedItems.push({ ...baseRecord, closedAt: c.closedAt });
      }
    }
  }

  for (const bucket of Object.values(byRepo)) {
    bucket.inProgressItems.sort((a, b) => {
      const da = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const db = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return db - da;
    });
    // Most recently shipped first.
    bucket.shippedItems.sort(
      (a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt),
    );
  }

  return { byRepo, rateLimit };
}
