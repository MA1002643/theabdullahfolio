import { NextResponse } from 'next/server';
import {
  computeWorkSignal,
  buildMessage,
  buildSecondaryMessage,
  buildHeadline,
  WORK_STATES,
} from '@/utils/workSignal';
import { refineMessageWithAI } from '@/utils/workMessageAI';
import * as cache from '@/utils/workStatusCache';

// Hard-pinned per spec section 2.2 — this endpoint must NEVER report
// activity from any other repo, even if env vars are misconfigured.
const REPO_OWNER = 'MA1002643';
const REPO_NAME = 'theabdullahfolio';
const REPO_FULL_NAME = `${REPO_OWNER}/${REPO_NAME}`;

// Project board (Projects v2) at github.com/users/MA1002643/projects/3.
// We read two columns:
//   - "In Progress" → drives the IN_PROGRESS state and current-work items.
//   - "Done" (within last 48h) → drives the SHIPPING state and the
//     "just shipped" rotating message.
// If the PAT lacks Projects: Read or the query fails for any reason, the
// route silently falls back to the repo-wide open-issues logic below.
const PROJECT_OWNER = 'MA1002643';
const PROJECT_NUMBER = 3;
const IN_PROGRESS_STATUS = 'in progress';
const DONE_STATUS = 'done';
const SHIPPED_WINDOW_MS = 48 * 60 * 60 * 1000;

const GITHUB_API = 'https://api.github.com/graphql';
const TOKEN = process.env.GITHUB_TOKEN;
// Optional separate token for the Projects v2 query — see fetchProjectInProgress.
// Falls back to the main token when not set so single-token setups still work.
const PROJECT_TOKEN = process.env.GITHUB_PROJECT_TOKEN ?? process.env.GITHUB_TOKEN;

// Cap each GraphQL round-trip so a slow GitHub doesn't stall the handler
// for the entire function timeout — surface the failure to the catch in
// GET, which serves stale cache or the deterministic fallback.
const GITHUB_TIMEOUT_MS = 5000;

async function fetchGitHubGraphQL(token, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
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
    return jsonResponse(payload, 'FALLBACK');
  }

  try {
    // Project board query is authoritative when available; fall back to
    // repo-wide open issues if the PAT lacks Projects: Read or the query
    // returns no in-progress items. Run both in parallel — even when the
    // project succeeds, the repo data feeds the counts and recent-commit
    // detection.
    const [raw, projectActivity] = await Promise.all([
      fetchRepoActivity(),
      fetchProjectActivity().catch((err) => {
        console.warn(
          'Project board unavailable, using fallback signal:',
          err?.message ?? err,
        );
        return null;
      }),
    ]);

    const inProgressItems = projectActivity?.inProgressItems ?? null;
    const shippedItems = projectActivity?.shippedItems ?? null;

    const signal = computeWorkSignal({
      ...raw,
      inProgressItems,
      shippedItems,
    });
    const baseMessage = buildMessage(signal);
    const secondaryMessage = buildSecondaryMessage(signal);
    const headline = buildHeadline(signal);

    const message = await refineMessageWithAI({
      signal,
      fallback: baseMessage,
    });

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
        activePrs: signal.activePrs,
        activeIssues: signal.activeIssues,
        recentPushes: signal.recentPushes,
        topItems: signal.topItems,
        shippedItems: signal.shippedItems,
        recentlyShippedCount: signal.recentlyShippedCount,
        confidence: signal.confidence,
        lastUpdated: new Date().toISOString(),
        lastActivityAt: signal.lastActivityAt,
      },
    };

    cache.write(payload);
    return jsonResponse(payload, 'MISS');
  } catch (err) {
    console.error('work-status error:', err);
    // Serve stale cache if we have it — better than a broken header.
    const stale = cache.readStale();
    if (stale) {
      return jsonResponse(stale, 'STALE');
    }
    const payload = buildIdlePayload();
    return jsonResponse(payload, 'FALLBACK');
  }
}

const jsonResponse = (payload, cacheStatus) =>
  NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      'X-Cache-Status': cacheStatus,
    },
  });

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
      confidence: 0,
      lastUpdated: new Date().toISOString(),
      lastActivityAt: null,
      ...(note ? { note } : {}),
    },
  };
};

// Single GraphQL query covering open PRs, open issues, and recent commits
// on the default branch. Smaller than three round-trips and stays within
// the strict scope rule (one repo only).
async function fetchRepoActivity() {
  // totalCount on the connections gives the true count regardless of how
  // many nodes we paginate. We still only fetch 10 detailed nodes per
  // collection because they're only used for "top items" in the message
  // and for the most-recent timestamp.
  const query = `
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        pullRequests(states: OPEN, first: 10, orderBy: {field: UPDATED_AT, direction: DESC}) {
          totalCount
          nodes {
            number
            title
            updatedAt
            isDraft
          }
        }
        issues(states: OPEN, first: 10, orderBy: {field: UPDATED_AT, direction: DESC}) {
          totalCount
          nodes {
            number
            title
            updatedAt
            labels(first: 5) { nodes { name } }
          }
        }
        defaultBranchRef {
          target {
            ... on Commit {
              history(first: 100) {
                nodes {
                  oid
                  committedDate
                  messageHeadline
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetchGitHubGraphQL(TOKEN, {
    query,
    variables: { owner: REPO_OWNER, name: REPO_NAME },
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(json.errors[0]?.message ?? 'GraphQL error');
  }

  const repo = json.data?.repository;
  if (!repo) throw new Error('repository not found');

  const pullRequests = (repo.pullRequests?.nodes ?? []).map((pr) => ({
    number: pr.number,
    title: pr.title,
    updatedAt: pr.updatedAt,
    state: 'open',
    isDraft: pr.isDraft,
  }));

  const issues = (repo.issues?.nodes ?? []).map((i) => ({
    number: i.number,
    title: i.title,
    updatedAt: i.updatedAt,
    state: 'open',
    labels: (i.labels?.nodes ?? []).map((l) => l.name),
  }));

  const commits = (repo.defaultBranchRef?.target?.history?.nodes ?? []).map(
    (c) => ({
      oid: c.oid,
      committedAt: c.committedDate,
      message: c.messageHeadline,
    }),
  );

  return {
    pullRequests,
    issues,
    commits,
    totalActivePrs: repo.pullRequests?.totalCount ?? pullRequests.length,
    totalActiveIssues: repo.issues?.totalCount ?? issues.length,
  };
}

// Reads the user's Projects v2 board and returns:
//   - inProgressItems: items in the "In Progress" status column
//   - shippedItems: items in the "Done" column whose underlying issue/PR
//                   was closed within SHIPPED_WINDOW_MS (last 48h). Older
//                   Done items don't qualify as "just shipped" and are
//                   silently dropped.
// Returns null on auth failure (PAT missing Projects: Read) so the caller
// can fall back to the repo-wide signal. Returns { inProgressItems: [],
// shippedItems: [] } if the board is reachable but both columns are empty.
async function fetchProjectActivity() {
  const query = `
    query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          items(first: 100) {
            nodes {
              content {
                __typename
                ... on Issue {
                  number
                  title
                  updatedAt
                  closedAt
                  state
                  repository { nameWithOwner }
                }
                ... on PullRequest {
                  number
                  title
                  updatedAt
                  closedAt
                  state
                  repository { nameWithOwner }
                }
              }
              fieldValues(first: 20) {
                nodes {
                  __typename
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field {
                      ... on ProjectV2SingleSelectField { name }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetchGitHubGraphQL(PROJECT_TOKEN, {
    query,
    variables: { login: PROJECT_OWNER, number: PROJECT_NUMBER },
  });

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Projects v2 API ${response.status}`);
  }

  const json = await response.json();
  if (json.errors) {
    const msg = (json.errors[0]?.message ?? '').toLowerCase();
    if (msg.includes('scope') || msg.includes('permission') || msg.includes('forbidden')) {
      return null;
    }
    throw new Error(json.errors[0]?.message ?? 'Projects v2 GraphQL error');
  }

  const project = json.data?.user?.projectV2;
  if (!project) return null;

  const nowMs = Date.now();
  const items = project.items?.nodes ?? [];
  const inProgressItems = [];
  const shippedItems = [];

  for (const item of items) {
    const c = item?.content;
    if (!c) continue;
    if (c.__typename !== 'Issue' && c.__typename !== 'PullRequest') continue;
    if (c.repository?.nameWithOwner !== REPO_FULL_NAME) continue;

    const status = (item.fieldValues?.nodes ?? []).find(
      (v) =>
        v?.__typename === 'ProjectV2ItemFieldSingleSelectValue' &&
        v?.field?.name?.toLowerCase() === 'status',
    );
    if (!status?.name) continue;
    const statusName = status.name.toLowerCase();

    const baseRecord = {
      type: c.__typename === 'Issue' ? 'issue' : 'pr',
      number: c.number,
      title: c.title,
      updatedAt: c.updatedAt,
    };

    if (statusName === IN_PROGRESS_STATUS) {
      // In-progress items must be open — closed items in this column
      // are usually stale and skip into Done by themselves.
      if (c.state && c.state !== 'OPEN') continue;
      inProgressItems.push(baseRecord);
    } else if (statusName === DONE_STATUS) {
      // Use closedAt as the "moved to Done" proxy. If the item has no
      // closedAt (rare — Done item that's still open), treat it as not
      // recent. Items closed > 48h ago are silently dropped.
      const closed = c.closedAt ? Date.parse(c.closedAt) : null;
      if (!closed || nowMs - closed > SHIPPED_WINDOW_MS) continue;
      shippedItems.push({ ...baseRecord, closedAt: c.closedAt });
    }
  }

  inProgressItems.sort((a, b) => {
    const da = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const db = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return db - da;
  });

  // Most recently shipped first.
  shippedItems.sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt));

  return { inProgressItems, shippedItems };
}
