import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

// Live metadata for the ONE repository this site is built from — the footer's
// "View this project on GitHub" CTA renders a tiny git graph and an honest
// terminal caption ("main · N commits · pushed <rel>"), and this route feeds
// the real numbers. Deliberately distinct from /api/github-stats, whose `repo`
// field is the algorithmically-chosen *most active* repo (may be any repo). The
// CTA is specifically about theabdullahfolio, so it gets its own tiny, pinned
// fetch rather than hoping the scoring happens to pick this repo.
//
// Pinned to a single owner/name (no query params) so there's no cache-key
// surface to abuse — every caller gets the same cached payload. Node runtime
// for parity with the other GitHub routes. Fails soft: any upstream problem
// (missing token, rate limit, network) serves the bundled snapshot so the CTA
// always shows a plausible, intentional caption instead of a blank.
export const runtime = "nodejs";

const GITHUB_API = "https://api.github.com/graphql";
const TOKEN = process.env.GITHUB_TOKEN;
const REVALIDATE_SECONDS = 10 * 60;
const GITHUB_TIMEOUT_MS = Number(process.env.GITHUB_TIMEOUT_MS) || 8000;

// The repository the footer CTA points at. Owner mirrors the github-stats
// route's username default; the repo name is overridable so a fork can retarget
// without a code change.
const OWNER = process.env.NEXT_PUBLIC_GITHUB_USERNAME || "MA1002643";
const REPO = process.env.NEXT_PUBLIC_PROJECT_REPO || "theabdullahfolio";

// Last-resort snapshot. Served whenever the live fetch can't complete so the
// CTA never renders an empty caption. `pushedAt: null` makes the client omit
// the relative-time chip rather than invent a stale one; the branch/commit
// figures are conservative real values that read as intentional.
const FALLBACK = {
  nameWithOwner: `${OWNER}/${REPO}`,
  defaultBranch: "main",
  commits: null,
  stars: null,
  pushedAt: null,
  _fallback: true,
};

const CACHE_HEADERS = {
  "Cache-Control": `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=300, stale-if-error=86400`,
};

// Single GraphQL round-trip: default branch name + total commit count on it,
// stars, and last-push timestamp. One call, no pagination — the repo detail is
// cheap and changes slowly.
const getCachedProjectRepo = unstable_cache(
  async () => {
    if (!TOKEN) {
      throw new Error("project-repo: GITHUB_TOKEN env var is not set");
    }

    const query = `
      query ($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          nameWithOwner
          stargazerCount
          pushedAt
          defaultBranchRef {
            name
            target {
              ... on Commit {
                history(first: 1) { totalCount }
              }
            }
          }
        }
      }
    `;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
    try {
      const res = await fetch(GITHUB_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables: { owner: OWNER, name: REPO } }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `project-repo: GraphQL request failed (HTTP ${res.status}) ${body.slice(0, 120)}`
        );
      }
      const json = await res.json();
      if (json?.errors) {
        throw new Error(json.errors[0]?.message || "project-repo: query failed");
      }
      const repo = json?.data?.repository;
      if (!repo) throw new Error("project-repo: repository not found");

      return {
        nameWithOwner: repo.nameWithOwner,
        defaultBranch: repo.defaultBranchRef?.name || "main",
        commits: repo.defaultBranchRef?.target?.history?.totalCount ?? null,
        stars: repo.stargazerCount ?? null,
        pushedAt: repo.pushedAt || null,
      };
    } finally {
      clearTimeout(timer);
    }
  },
  // OWNER/REPO are folded into the key because the cached value depends on
  // them but the fn takes no args (so unstable_cache's arg-hash can't capture
  // them). Without this, a fork that retargets NEXT_PUBLIC_PROJECT_REPO /
  // NEXT_PUBLIC_GITHUB_USERNAME could be served the previous repo's payload
  // from Next's persistent cache until the TTL/cron revalidation fires.
  ["project-repo-v1", OWNER, REPO],
  // Sharing the "github-stats" tag means the daily /api/repo-refresh cron
  // invalidates this cache too — free, coordinated refresh — while the 10-min
  // TTL keeps it current between cron runs.
  { revalidate: REVALIDATE_SECONDS, tags: ["github-stats", "project-repo"] }
);

export async function GET() {
  try {
    const data = await getCachedProjectRepo();
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("project-repo fetch failed, serving fallback:", error);
    return NextResponse.json(FALLBACK, {
      headers: { ...CACHE_HEADERS, "X-Cache-Status": "FALLBACK" },
    });
  }
}
