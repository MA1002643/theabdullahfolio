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
  //   IDLE           — fallthrough: nothing active. Includes both "no
  //                    activity at all" and "activity > 48h ago but
  //                    nothing currently open" — both correctly read as
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
      (recentPushes.length > 0 ? 0.3 : 0),
    0,
    1,
  );

  return {
    state,
    activePrs: prCount,
    activeIssues: issueCount,
    recentPushes: recentPushes.length,
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

const truncateTitle = (title) => {
  if (!title) return '';
  const trimmed = title.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
};

export const __testing = { FALLBACK_MESSAGE, HEADLINES };
