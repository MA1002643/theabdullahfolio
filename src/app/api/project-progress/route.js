import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { projectsData } from "@/app/data";
import { PROJECT_DATA_VERSION } from "@/lib/projectDataVersion";
import { TRACKED_REPOS, nameWithOwnerOf } from "@/utils/workTrackedRepos";
import { envPositiveMs } from "../_utils/env";

// Live per-project delivery telemetry for the about page's Project Progress
// popup (issue #48). Counts come from each project's Projects v2 BOARD — the
// per-column item counts (Backlog / Ready / In progress / … / Done) — NOT
// from the repo's issue list. The board is the delivery source of truth:
// it includes PRs and draft items the issue list never sees, and its "Done"
// column is what "complete" actually means on these boards (verified against
// the live ma.codes board: 138 items across Backlog 19 / Ready 3 /
// In progress 3 / In review 0 / Done 113, where the repo issue list says
// only 69 issues, 47 closed).
//
// Board numbers come from `projectNumber` in workTrackedRepos.js — the SAME
// join the maintenance header uses — keyed by each project's `repo` from
// data.js. One file (workTrackedRepos) owns the repo→board mapping for both
// surfaces, so they can never disagree about which board belongs to whom.
// TRACKED_REPOS is imported directly, not via getTrackedRepos(): the
// MULTI_REPO_HEADER kill-switch scopes the HEADER, and must not silently
// untrack ten of the popup's eleven boards.

// This handler takes no request input, which makes it eligible for static
// prerendering in Next 14 — the build machine would execute the GitHub fetch
// and bake its result (or, tokenless, the fallback payload) into the bundle
// until the first revalidation. Pinning `force-dynamic` keeps evaluation at
// request time, where `unstable_cache` + the CDN headers own freshness —
// same convention as /api/work-status and /api/daily-warmup.
export const dynamic = "force-dynamic";

const GITHUB_API = "https://api.github.com/graphql";
const TOKEN = process.env.GITHUB_TOKEN;

// 12 hours — the "at least twice daily" contract. Server cache (unstable_cache)
// and the CDN s-maxage below share this number; the client polls at the same
// interval so no layer asks for data more often than another will produce it.
const REVALIDATE_SECONDS = 12 * 60 * 60;

// Ceiling for the WHOLE sync (all pagination rounds share one abort timer).
// Same rationale (and env knob discipline) as /api/github-stats: stay
// comfortably under the Hobby 10 s function limit so a slow upstream serves
// the static fallback instead of hanging the function.
const GITHUB_TIMEOUT_MS = envPositiveMs(process.env.GITHUB_TIMEOUT_MS, 8000);

// Items per board per page — GitHub's max. The largest live board (AfaaqX,
// 169 items) needs two rounds; every round fetches the next page of EVERY
// still-unfinished board in one batched request, so total requests per sync
// is ceil(largest board / 100), not per-board.
const ITEMS_PER_PAGE = 100;

// Pagination-round backstop: 5 rounds × 100 = 500 items per board, ~3× the
// largest live board. A board that still has pages after this is truncated
// LOUDLY (console.warn below) — never a silent cap.
const MAX_PAGE_ROUNDS = 5;

// Column names (lower-cased) whose items count as delivered — the
// completion numerator. Every live board's terminal column is literally
// "Done"; the synonyms guard a future board template change.
const DONE_STATUS_NAMES = new Set(["done", "complete", "completed", "shipped"]);

// Only `owner/name` shapes in GitHub's allowed character set may be used for
// the board join / owner extraction. `repo` values are developer-controlled
// constants from data.js, so a mismatch is a typo, not an attack — the
// offending project just degrades to "Not tracked".
const REPO_SHAPE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const CACHE_HEADERS = {
  // stale-while-revalidate: a visitor landing after the 12 h window gets the
  // stale payload instantly while the CDN refreshes in the background —
  // that background refresh is the second guaranteed daily sync even on
  // low-traffic days. stale-if-error keeps the popup populated for a day if
  // GitHub is down.
  "Cache-Control": `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=21600, stale-if-error=86400`,
};

// Payload shape marker, checked by useProjectProgress before hydrating a
// stored snapshot: bumping it orphans every issue-era (v1) localStorage
// last-good, which carries fields this UI no longer renders.
const PAYLOAD_SCHEMA_VERSION = 2;

// repo (lower-cased owner/name) → user-level Projects v2 board number.
const BOARD_NUMBER_BY_REPO = new Map(
  TRACKED_REPOS.filter((r) => Number.isInteger(r.projectNumber)).map((r) => [
    nameWithOwnerOf(r).toLowerCase(),
    r.projectNumber,
  ]),
);

const boardNumberFor = (repo) =>
  repo && REPO_SHAPE.test(repo)
    ? BOARD_NUMBER_BY_REPO.get(repo.toLowerCase()) ?? null
    : null;

// Base descriptor every payload variant shares — identity fields straight
// from data.js plus an empty board. The live path overwrites the board
// fields; the untracked/fallback paths ship it as-is with `tracked: false`,
// which the popup renders as "sync unavailable" rather than a misleading 0%.
const untrackedProject = (p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  repo: p.repo ?? null,
  private: Boolean(p.private),
  // Board columns in the BOARD'S own order, [{ name, count }] — each board
  // defines its own set (Todo/In Progress/Done vs Backlog/Ready/…/Done), so
  // the popup renders whatever the board actually says instead of forcing
  // three fixed buckets.
  columns: [],
  totalItems: 0,
  doneItems: 0,
  completionPercent: 0,
  // Public boards only (ProjectV2.public, checked live) — a link to a
  // private board 404s for every visitor, the data.js no-dead-links rule.
  boardUrl: null,
  tracked: false,
});

// Category breakdown is derivable from static data alone — no GitHub involved
// — so it's computed once here and included on BOTH the live payload and the
// degraded fallback: the popup's "By category" section never goes dark even
// when the sync is. Sorted count-desc to match the about card's split bar, so
// the two surfaces read in the same order with the same lead colour.
const CATEGORY_BREAKDOWN = (() => {
  const counts = projectsData.reduce((acc, p) => {
    const key = p.category || "Other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
})();

// Static skeleton of the payload — everything except the live board counts.
// Doubles as the GET handler's degraded fallback when GitHub is unreachable:
// `overallCompletion: null` (unknown, NOT zero — the same "couldn't measure
// isn't zero" distinction the experience split draws) and `_fallback: true`
// so the client keeps its own last-good instead of downgrading.
const buildFallbackPayload = () => ({
  projects: projectsData.map(untrackedProject),
  categoryBreakdown: CATEGORY_BREAKDOWN,
  totalProjects: projectsData.length,
  overallCompletion: null,
  totalItems: 0,
  doneItems: 0,
  trackedCount: 0,
  lastSynced: null,
  dataVersion: PROJECT_DATA_VERSION,
  schemaVersion: PAYLOAD_SCHEMA_VERSION,
  _fallback: true,
});

// One page of one board, as a GraphQL alias. Board meta (status options,
// visibility, url, totalCount) rides only the FIRST page; later rounds fetch
// bare status names. `number` is a frozen integer from workTrackedRepos and
// `cursor` a GitHub-issued opaque string through JSON.stringify, so the
// document can't be malformed by interpolation.
const boardAlias = ({ number, cursor }) => `
  b${number}: projectV2(number: ${number}) {
    ${cursor
      ? ""
      : `public
    url
    field(name: "Status") {
      ... on ProjectV2SingleSelectField { options { name } }
    }`}
    items(first: ${ITEMS_PER_PAGE}${cursor ? `, after: ${JSON.stringify(cursor)}` : ""}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        status: fieldValueByName(name: "Status") {
          ... on ProjectV2ItemFieldSingleSelectValue { name }
        }
      }
    }
  }`;

async function fetchProjectProgress() {
  if (!TOKEN) {
    // Same fail-fast as /api/github-stats: surface the real cause instead of
    // letting a `Bearer undefined` 401 masquerade as a board-level failure.
    throw new Error("Project progress: GITHUB_TOKEN env var is not set");
  }

  const tracked = projectsData.filter((p) => {
    if (!p.repo) return false;
    if (boardNumberFor(p.repo) != null) return true;
    console.warn(
      `Project progress: no Projects v2 board for "${p.repo}" on "${p.name}" ` +
        "(missing/malformed repo or no projectNumber in workTrackedRepos.js) — treating as untracked.",
    );
    return false;
  });

  // Accumulator per board number: status-name → count, plus board meta from
  // the first page. `noStatus` counts items with an unset Status field —
  // they exist on the board, so dropping them would understate totals.
  const boards = new Map(
    tracked.map((p) => [
      boardNumberFor(p.repo),
      {
        owner: p.repo.split("/")[0],
        counts: new Map(),
        noStatus: 0,
        options: [],
        totalItems: 0,
        url: null,
        public: false,
        failed: false,
      },
    ]),
  );

  // ONE abort budget for every round — pagination must not multiply the
  // request ceiling past the Hobby function limit.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);

  try {
    // pending: board number → cursor (undefined = first page). Each round
    // batches the next page of every unfinished board into one request, so
    // rounds-per-sync is ceil(largest-board / 100), currently 2.
    let pending = new Map([...boards.keys()].map((n) => [n, undefined]));

    for (let round = 0; round < MAX_PAGE_ROUNDS && pending.size > 0; round += 1) {
      // Boards are user-level, so aliases nest under their owner's user()
      // field — grouped in case the portfolio ever spans two accounts.
      const byOwner = new Map();
      for (const [number, cursor] of pending) {
        const { owner } = boards.get(number);
        if (!byOwner.has(owner)) byOwner.set(owner, []);
        byOwner.get(owner).push({ number, cursor });
      }
      const query = `query ProjectProgress { ${[...byOwner]
        .map(
          ([owner, list], i) =>
            `u${i}: user(login: ${JSON.stringify(owner)}) { ${list
              .map(boardAlias)
              .join("\n")} }`,
        )
        .join("\n")} }`;

      const res = await fetch(GITHUB_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Project progress: GraphQL request failed (HTTP ${res.status})`);
      }
      const json = await res.json();

      // Field-level errors (board renumbered/deleted, PAT missing Projects
      // read on one board) arrive alongside a partial data block whose
      // failing alias is null. Don't throw: the other boards' counts are
      // still good; the null alias degrades that one project to "Not
      // tracked" below. Only a missing data block entirely is a real failure.
      if (!json?.data) {
        throw new Error(json?.errors?.[0]?.message || "Project progress: GraphQL query failed");
      }
      if (json.errors?.length) {
        console.warn(
          "Project progress: partial GraphQL errors:",
          json.errors.map((e) => e.message).join(" | "),
        );
      }

      const nodesByBoard = new Map();
      for (const userNode of Object.values(json.data)) {
        if (!userNode) continue;
        for (const [alias, boardNode] of Object.entries(userNode)) {
          nodesByBoard.set(Number(alias.slice(1)), boardNode);
        }
      }

      const nextPending = new Map();
      for (const [number] of pending) {
        const acc = boards.get(number);
        const node = nodesByBoard.get(number);
        if (!node) {
          acc.failed = true;
          continue;
        }
        if (node.field?.options) {
          acc.options = node.field.options.map((o) => o.name);
          acc.url = node.url ?? null;
          acc.public = Boolean(node.public);
        }
        acc.totalItems = node.items?.totalCount ?? acc.totalItems;
        for (const item of node.items?.nodes ?? []) {
          const name = item?.status?.name;
          if (name) acc.counts.set(name, (acc.counts.get(name) || 0) + 1);
          else acc.noStatus += 1;
        }
        if (node.items?.pageInfo?.hasNextPage) {
          nextPending.set(number, node.items.pageInfo.endCursor);
        }
      }
      pending = nextPending;
    }

    for (const [number] of pending) {
      console.warn(
        `Project progress: board ${number} still has pages after ${MAX_PAGE_ROUNDS} rounds — counts truncated at ${MAX_PAGE_ROUNDS * ITEMS_PER_PAGE} items.`,
      );
    }
  } finally {
    clearTimeout(timer);
  }

  const progressByRepo = new Map(
    tracked.map((p) => {
      const acc = boards.get(boardNumberFor(p.repo));
      if (!acc || acc.failed) return [p.id, null];

      // Columns in the board's own order — INCLUDING empty ones, exactly as
      // the board renders them — with counted-but-unlisted statuses (a
      // renamed option mid-sync) and unset-status items appended so every
      // item on the board is accounted for somewhere.
      const listed = new Set(acc.options);
      const columns = [
        ...acc.options.map((name) => ({ name, count: acc.counts.get(name) || 0 })),
        ...[...acc.counts.keys()]
          .filter((name) => !listed.has(name))
          .map((name) => ({ name, count: acc.counts.get(name) })),
        ...(acc.noStatus > 0 ? [{ name: "No status", count: acc.noStatus }] : []),
      ];
      const totalItems = acc.totalItems;
      const doneItems = columns
        .filter((c) => DONE_STATUS_NAMES.has(c.name.toLowerCase()))
        .reduce((sum, c) => sum + c.count, 0);

      return [
        p.id,
        {
          columns,
          totalItems,
          doneItems,
          completionPercent: totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0,
          boardUrl: acc.public ? acc.url : null,
        },
      ];
    }),
  );

  const projects = projectsData.map((p) => {
    const live = progressByRepo.get(p.id);
    if (!live) return untrackedProject(p);
    return { ...untrackedProject(p), ...live, tracked: true };
  });

  // Overall completion is item-WEIGHTED — total Done over total board items
  // across every tracked board — not a plain mean of the percentages, so a
  // 169-item programme can't be averaged away by a 36-item one. Boards with
  // zero items contribute nothing to either side.
  const trackedWithItems = projects.filter((p) => p.tracked && p.totalItems > 0);
  const totalItems = trackedWithItems.reduce((sum, p) => sum + p.totalItems, 0);
  const doneItems = trackedWithItems.reduce((sum, p) => sum + p.doneItems, 0);

  return {
    projects,
    categoryBreakdown: CATEGORY_BREAKDOWN,
    totalProjects: projectsData.length,
    overallCompletion: totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0,
    totalItems,
    doneItems,
    trackedCount: trackedWithItems.length,
    lastSynced: new Date().toISOString(),
    dataVersion: PROJECT_DATA_VERSION,
    schemaVersion: PAYLOAD_SCHEMA_VERSION,
  };
}

// Persistent 12 h cache — the same layer /api/github-stats uses (survives
// serverless instance recycling). The tag allows a future webhook/cron to
// force a refresh without waiting out the TTL. Key parts: the schema epoch
// ("v2" — the board-based payload), PROJECT_DATA_VERSION so any projectsData
// change mints a fresh entry on the next deploy, and the repo→board join so
// renumbering a board in workTrackedRepos.js does too — the data cache
// survives deployments, so without these a payload built from the OLD
// mapping would keep serving for up to 12 h after the new one ships.
const BOARD_JOIN = projectsData.map((p) => boardNumberFor(p.repo) ?? "-").join(",");
const getCachedProjectProgress = unstable_cache(
  fetchProjectProgress,
  ["project-progress-v2", PROJECT_DATA_VERSION, BOARD_JOIN],
  { revalidate: REVALIDATE_SECONDS, tags: ["project-progress"] },
);

export async function GET() {
  // No query parameters by design: the board list comes from static
  // projectsData + workTrackedRepos, so there is nothing for a caller to
  // vary — no cache-key pollution or token-exhaustion vector to guard
  // against.
  try {
    const data = await getCachedProjectProgress();
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (error) {
    // Total upstream failure. The category breakdown and project identities
    // are static, so serve those with every project untracked — the popup
    // still opens with real structure, shows "sync unavailable" per project,
    // and the client's last-good cache (which `_fallback` tells it to
    // prefer) fills in percentages where a previous visit had them.
    console.error("Project progress fetch failed, serving static fallback:", error);
    return NextResponse.json(buildFallbackPayload(), {
      headers: { ...CACHE_HEADERS, "X-Cache-Status": "FALLBACK" },
    });
  }
}
