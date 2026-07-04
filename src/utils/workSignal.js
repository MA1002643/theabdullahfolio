// Pure logic for converting GitHub repo activity into a `workSignal` object
// and a user-friendly status message. No network or I/O — the API route
// supplies raw GitHub data and consumes the result. Keeping this module
// side-effect free makes it trivially testable and lets the AI refiner
// (workMessageAI.js) fall back to deterministic output if the LLM call
// fails or is disabled.

export const WORK_STATES = Object.freeze({
  SHIPPING: 'shipping',
  LIVE: 'live',
  IN_PROGRESS: 'in_progress',
  PLANNING: 'planning',
  IDLE: 'idle',
});

const HOUR_MS = 60 * 60 * 1000;
const LIVE_WINDOW_MS = 2 * HOUR_MS;

const safeDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const mostRecent = (...dates) =>
  dates.filter(Boolean).reduce(
    (max, d) => (max === null || d > max ? d : max),
    null,
  );

// Computes the workSignal from raw GitHub data already filtered to the
// MA1002643/theabdullahfolio repo. The shape mirrors the spec section 3.2
// so callers can render directly without re-deriving.
//
// `pullRequests` and `issues` are detailed node arrays (capped by the
// caller's GraphQL `first:` argument) used for top-item selection and
// most-recent timestamps. `totalActivePrs` / `totalActiveIssues` are the
// true counts from the GraphQL `totalCount` field — preferred for the
// displayed counters because the node arrays are paginated.
//
// `inProgressItems`: when supplied (i.e. the project board query
// succeeded), this is the authoritative source for the IN_PROGRESS state
// and topItems. A non-empty array forces state to IN_PROGRESS (unless
// SHIPPING or LIVE wins) and replaces topItems with the column entries.
// `null` means "project data unavailable, use the fallback flow"; an
// empty array means "the column is reachable but currently empty".
//
// `shippedItems`: items moved to the Done column whose underlying issue
// or PR was closed within the last 48h. When non-empty, the state takes
// precedence over IN_PROGRESS/LIVE — a recent ship is the strongest
// signal of "what's happening now". The Pattern D rotation alternates
// between "currently working" and "just shipped" messages.
export function computeWorkSignal({
  pullRequests = [],
  issues = [],
  commits = [],
  totalActivePrs,
  totalActiveIssues,
  totalRecentPushes,
  inProgressItems = null,
  shippedItems = null,
  now = new Date(),
} = {}) {
  const nowMs = now.getTime();

  const activePrs = pullRequests.filter((pr) => pr.state === 'open');
  const activeIssues = issues.filter((i) => i.state === 'open');

  const prCount = totalActivePrs ?? activePrs.length;
  const issueCount = totalActiveIssues ?? activeIssues.length;

  const recentPushes = commits.filter((c) => {
    const d = safeDate(c.committedAt);
    return d && nowMs - d.getTime() <= 24 * HOUR_MS;
  });

  // Like the PR/issue totals, prefer the GraphQL `history(since:).totalCount`
  // when the caller supplies it — the node array is capped by `first:` so a
  // very active day would otherwise under-count.
  const pushCount = totalRecentPushes ?? recentPushes.length;

  const lastPrUpdate = mostRecent(
    ...activePrs.map((pr) => safeDate(pr.updatedAt)),
  );
  const lastIssueUpdate = mostRecent(
    ...activeIssues.map((i) => safeDate(i.updatedAt)),
  );
  const lastCommit = mostRecent(
    ...commits.map((c) => safeDate(c.committedAt)),
  );

  const lastActivity = mostRecent(lastPrUpdate, lastIssueUpdate, lastCommit);

  const hasRecentCommit = lastCommit && nowMs - lastCommit.getTime() <= LIVE_WINDOW_MS;
  const hasRecentPrOrIssue =
    (lastPrUpdate && nowMs - lastPrUpdate.getTime() <= LIVE_WINDOW_MS) ||
    (lastIssueUpdate && nowMs - lastIssueUpdate.getTime() <= LIVE_WINDOW_MS);

  const hasProjectInProgress =
    Array.isArray(inProgressItems) && inProgressItems.length > 0;
  const hasRecentlyShipped =
    Array.isArray(shippedItems) && shippedItems.length > 0;

  // Precedence (top to bottom — first match wins):
  //   SHIPPING       — Done items closed in last 48h (most concrete signal)
  //   LIVE           — any commit / PR / issue update in last 2h
  //   IN_PROGRESS    — project In Progress column has cards, OR open PRs
  //   PLANNING       — only open issues, no PRs / project cards
  //   IDLE           — fallthrough: no recent activity in the 2h LIVE
  //                    window and nothing currently open (no in-progress
  //                    project cards, open PRs, or open issues), i.e.
  //                    "no work in flight right now".
  let state;
  if (hasRecentlyShipped) {
    state = WORK_STATES.SHIPPING;
  } else if (hasRecentCommit || hasRecentPrOrIssue) {
    state = WORK_STATES.LIVE;
  } else if (hasProjectInProgress || prCount > 0) {
    state = WORK_STATES.IN_PROGRESS;
  } else if (issueCount > 0) {
    state = WORK_STATES.PLANNING;
  } else {
    state = WORK_STATES.IDLE;
  }

  // Project-board items are authoritative when present — they reflect the
  // user's "In Progress" column directly. Fall back to PR-then-issue
  // ordering only when the column is empty/unavailable.
  const topItems = hasProjectInProgress
    ? inProgressItems.slice(0, 3).map((item) => ({
        type: item.type,
        number: item.number,
        title: item.title,
      }))
    : [
        ...activePrs.slice(0, 2).map((pr) => ({
          type: 'pr',
          number: pr.number,
          title: pr.title,
        })),
        ...activeIssues.slice(0, 2).map((i) => ({
          type: 'issue',
          number: i.number,
          title: i.title,
        })),
      ].slice(0, 3);

  // Confidence reflects how many independent signals agree. Used by the UI
  // to pick a transition direction (rising vs falling) when state changes.
  const confidence = clamp(
    (hasProjectInProgress ? 0.5 : 0) +
      (prCount > 0 ? 0.3 : 0) +
      (issueCount > 0 ? 0.1 : 0) +
      (pushCount > 0 ? 0.3 : 0),
    0,
    1,
  );

  return {
    state,
    activePrs: prCount,
    activeIssues: issueCount,
    recentPushes: pushCount,
    topItems,
    shippedItems: hasRecentlyShipped
      ? shippedItems.slice(0, 3).map((item) => ({
          type: item.type,
          number: item.number,
          title: item.title,
          closedAt: item.closedAt,
        }))
      : [],
    lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
    confidence,
    projectInProgressCount: hasProjectInProgress ? inProgressItems.length : 0,
    recentlyShippedCount: hasRecentlyShipped ? shippedItems.length : 0,
  };
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// ── Portfolio roll-up (issue #94) ────────────────────────────────────────
//
// Aggregates per-repo activity into a single portfolio-wide signal. Each
// entry in `repos` is one tracked repo's raw GitHub data:
//
//   {
//     displayName, nameWithOwner,
//     pullRequests: [{ number, title, createdAt, updatedAt, url, state }],
//     issues:       [{ number, title, createdAt, updatedAt, url, state }],
//     commits:      [{ committedAt, messageHeadline, sha, url }],
//     totalActivePrs, totalActiveIssues, totalRecentPushes,
//     inProgressItems?, shippedItems?,   // project-board items, if any
//   }
//
// The portfolio state is the highest-precedence state across all repos
// (SHIPPING > LIVE > IN_PROGRESS > PLANNING > IDLE — same ordering as the
// single-repo signal), counts are summed totals, and `breakdown` carries
// the per-item lists that power the header's hover popovers.

// Strongest signal first — index = precedence rank.
const STATE_PRECEDENCE = Object.freeze([
  WORK_STATES.SHIPPING,
  WORK_STATES.LIVE,
  WORK_STATES.IN_PROGRESS,
  WORK_STATES.PLANNING,
  WORK_STATES.IDLE,
]);

// Popover lists are capped server-side so the payload stays small; the
// displayed counter still uses the summed totalCounts, and the client
// renders "+ X more" for anything beyond the cap.
const BREAKDOWN_LIMIT = 20;

// Issues are capped PER REPO instead: the popover renders them as
// collapsible per-project sections, so every tracked repo must keep its
// own complete slice — a shared global cap would silently drop whole
// repos once enough projects are tracked (N repos × 10 > 20). Mirrors
// the GraphQL `first: 10` cap; the payload stays bounded by N × 10.
const PER_REPO_ISSUE_LIMIT = 10;

const byMostRecent = (key) => (a, b) => {
  const da = safeDate(a[key])?.getTime() ?? 0;
  const db = safeDate(b[key])?.getTime() ?? 0;
  return db - da;
};

export function computePortfolioSignal({ repos = [], now = new Date() } = {}) {
  const perRepo = repos.map((repo) => ({
    repo,
    signal: computeWorkSignal({
      pullRequests: repo.pullRequests,
      issues: repo.issues,
      commits: repo.commits,
      totalActivePrs: repo.totalActivePrs,
      totalActiveIssues: repo.totalActiveIssues,
      totalRecentPushes: repo.totalRecentPushes,
      inProgressItems: repo.inProgressItems ?? null,
      shippedItems: repo.shippedItems ?? null,
      now,
    }),
  }));

  const state = perRepo.reduce((strongest, { signal }) => {
    const rank = STATE_PRECEDENCE.indexOf(signal.state);
    return rank < STATE_PRECEDENCE.indexOf(strongest) ? signal.state : strongest;
  }, WORK_STATES.IDLE);

  const activePrs = sumBy(perRepo, (r) => r.signal.activePrs);
  const activeIssues = sumBy(perRepo, (r) => r.signal.activeIssues);
  const recentPushes = sumBy(perRepo, (r) => r.signal.recentPushes);
  const projectInProgressCount = sumBy(
    perRepo,
    (r) => r.signal.projectInProgressCount,
  );
  const recentlyShippedCount = sumBy(
    perRepo,
    (r) => r.signal.recentlyShippedCount,
  );

  const byRepo = Object.fromEntries(
    perRepo.map(({ repo, signal }) => [
      repo.displayName,
      {
        activePrs: signal.activePrs,
        activeIssues: signal.activeIssues,
        recentPushes: signal.recentPushes,
      },
    ]),
  );

  // Flat, repo-tagged item lists for the popovers (§4.2 ActivityItem).
  // `createdAt` drives the live "how long ago" label on the client, so
  // the lists are sorted by it — the freshest item leads its group.
  const tagPrIssue = (repo, type) => (node) => ({
    repo: repo.displayName,
    nameWithOwner: repo.nameWithOwner,
    type,
    number: node.number,
    title: node.title,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    url: node.url,
  });

  const nowMs = now.getTime();
  const breakdown = {
    prs: perRepo
      .flatMap(({ repo }) => (repo.pullRequests ?? []).map(tagPrIssue(repo, 'pr')))
      .sort(byMostRecent('createdAt'))
      .slice(0, BREAKDOWN_LIMIT),
    // Issues stay grouped by repo (tracked-repo order) rather than being
    // interleaved into one global most-recent list: the popover shows one
    // collapsible section per project, each holding that repo's 10 most
    // recently updated open issues (the GraphQL orderBy), displayed
    // newest-created first — the same createdAt ordering the flat list
    // used before the accordion.
    issues: perRepo.flatMap(({ repo }) =>
      (repo.issues ?? [])
        .map(tagPrIssue(repo, 'issue'))
        .sort(byMostRecent('createdAt'))
        .slice(0, PER_REPO_ISSUE_LIMIT),
    ),
    pushes: perRepo
      .flatMap(({ repo }) =>
        (repo.commits ?? [])
          .filter((c) => {
            const d = safeDate(c.committedAt);
            return d && nowMs - d.getTime() <= 24 * HOUR_MS;
          })
          .map((c) => ({
            repo: repo.displayName,
            nameWithOwner: repo.nameWithOwner,
            type: 'push',
            sha: c.sha,
            title: c.messageHeadline,
            createdAt: c.committedAt,
            url: c.url,
          })),
      )
      .sort(byMostRecent('createdAt'))
      .slice(0, BREAKDOWN_LIMIT),
  };

  // Project-board topItems stay authoritative when any repo has them
  // (Phase 1: only the primary repo feeds the board). Otherwise fall back
  // to the same PR-then-issue ordering as the single-repo signal, drawn
  // from the whole portfolio. The issue picks use their own globally
  // most-recent sort — breakdown.issues is grouped per repo, so its first
  // two entries would always come from whichever repo happens to lead the
  // tracked list rather than the freshest across the portfolio.
  const freshestIssues = perRepo
    .flatMap(({ repo }) => (repo.issues ?? []).map(tagPrIssue(repo, 'issue')))
    .sort(byMostRecent('createdAt'));

  const boardEntry = perRepo.find(
    ({ signal }) => signal.projectInProgressCount > 0,
  );
  const topItems = boardEntry
    ? boardEntry.signal.topItems
    : [
        ...breakdown.prs.slice(0, 2).map((item) => ({
          type: 'pr',
          number: item.number,
          title: item.title,
        })),
        ...freshestIssues.slice(0, 2).map((item) => ({
          type: 'issue',
          number: item.number,
          title: item.title,
        })),
      ].slice(0, 3);

  const shippedItems = perRepo
    .flatMap(({ signal }) => signal.shippedItems)
    .sort(byMostRecent('closedAt'))
    .slice(0, 3);

  const lastActivity = mostRecent(
    ...perRepo.map(({ signal }) => safeDate(signal.lastActivityAt)),
  );

  const confidence = clamp(
    (projectInProgressCount > 0 ? 0.5 : 0) +
      (activePrs > 0 ? 0.3 : 0) +
      (activeIssues > 0 ? 0.1 : 0) +
      (recentPushes > 0 ? 0.3 : 0),
    0,
    1,
  );

  return {
    state,
    activePrs,
    activeIssues,
    recentPushes,
    topItems,
    shippedItems,
    byRepo,
    breakdown,
    lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
    confidence,
    projectInProgressCount,
    recentlyShippedCount,
  };
}

const sumBy = (list, pick) => list.reduce((total, item) => total + pick(item), 0);

// Deterministic message templates. Always available — used as the
// baseline output, and as the fallback when AI refinement is disabled
// or fails. Kept short and non-technical per spec section 10.
const HEADLINES = {
  [WORK_STATES.SHIPPING]: 'Just shipped',
  [WORK_STATES.LIVE]: 'Live development in progress',
  [WORK_STATES.IN_PROGRESS]: 'Work in progress',
  [WORK_STATES.PLANNING]: 'Planning the next improvements',
  [WORK_STATES.IDLE]: 'Maintenance ongoing',
};

const FALLBACK_MESSAGE =
  'New features are being released very soon. This website is actively under development.';

export function buildMessage(signal) {
  const {
    state,
    activePrs,
    activeIssues,
    recentPushes,
    topItems,
    shippedItems = [],
    projectInProgressCount = 0,
    recentlyShippedCount = 0,
  } = signal;

  if (state === WORK_STATES.IDLE) {
    return FALLBACK_MESSAGE;
  }

  if (state === WORK_STATES.SHIPPING) {
    return shippingMessage(recentlyShippedCount, shippedItems);
  }

  if (state === WORK_STATES.LIVE) {
    if (recentPushes > 0 && topItems.length > 0) {
      return `Live update: shipping changes right now${describeTop(topItems)}.`;
    }
    if (recentPushes > 0) {
      return 'Live update: shipping new changes to this website right now.';
    }
    return `Active work happening right now${describeTop(topItems)}.`;
  }

  if (state === WORK_STATES.IN_PROGRESS) {
    // Project board is the authoritative signal when present — phrase the
    // message around what's actually in the In Progress column rather than
    // generic open-PR/issue counts.
    if (projectInProgressCount > 0) {
      return `Actively working on ${pluralize(projectInProgressCount, 'task')}${describeTop(topItems)}.`;
    }
    if (activePrs > 0 && activeIssues > 0) {
      return `Work in progress on ${pluralize(activePrs, 'pull request')} and ${pluralize(activeIssues, 'open task')}${describeTop(topItems)}.`;
    }
    if (activePrs > 0) {
      return `Work in progress on ${pluralize(activePrs, 'pull request')}${describeTop(topItems)}.`;
    }
    if (activeIssues > 0) {
      return `Work in progress on ${pluralize(activeIssues, 'open task')}${describeTop(topItems)}.`;
    }
    // Defensive: with the current state precedence, IN_PROGRESS implies at
    // least one of {projectInProgressCount, activePrs} is > 0, so this
    // line is unreachable. Kept so any future precedence shift can't
    // surface "0 open tasks" to users.
    return 'Work is in progress on this website.';
  }

  if (state === WORK_STATES.PLANNING) {
    return `Planning the next improvements${describeTop(topItems)}.`;
  }

  return FALLBACK_MESSAGE;
}

// Secondary message for the Pattern D rotation. Returns null when there's
// no second story worth rotating to. The client cycles between the
// primary `message` and this `secondaryMessage` every ~10 seconds.
export function buildSecondaryMessage(signal) {
  const { state, topItems, projectInProgressCount = 0 } = signal;

  // Only rotate when SHIPPING is active AND there's also active work.
  // Other states either don't have a meaningful "and also" story, or the
  // primary message already covers everything.
  if (state !== WORK_STATES.SHIPPING) return null;
  if (projectInProgressCount === 0) return null;
  if (!topItems || topItems.length === 0) return null;

  return `Actively working on ${pluralize(projectInProgressCount, 'task')}${describeTop(topItems)}.`;
}

const shippingMessage = (count, shippedItems) => {
  if (!shippedItems || shippedItems.length === 0) {
    return `Just shipped ${pluralize(count, 'update')} to this website.`;
  }
  const first = shippedItems[0];
  if (count > 1) {
    return `Just shipped #${first.number} ${truncateTitle(first.title)} (and ${count - 1} more).`;
  }
  return `Just shipped #${first.number} ${truncateTitle(first.title)}.`;
};

export function buildHeadline(signal) {
  return HEADLINES[signal.state] ?? HEADLINES[WORK_STATES.IDLE];
}

const pluralize = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const describeTop = (topItems) => {
  if (!topItems || topItems.length === 0) return '';
  const first = topItems[0];
  return ` — currently focused on #${first.number} ${truncateTitle(first.title)}`;
};

// Despite the name (kept for call-site stability), this no longer
// truncates — the maintenance-header message paragraph now wraps to as
// many lines as it needs, and the user wants the full GitHub issue / PR
// title visible. `.trim()` still normalises stray leading/trailing
// whitespace from upstream sources.
const truncateTitle = (title) => {
  if (!title) return '';
  return title.trim();
};

export const __testing = { FALLBACK_MESSAGE, HEADLINES };
