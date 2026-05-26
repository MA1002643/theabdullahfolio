import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { formatDuration, monthsBetween } from "@/utils/experience/dateMath";
import { parseExperienceFromPdf } from "@/utils/experience/pdfExperienceParser";

// Node runtime required: `node:fs` for the PDF read, pdf-parse's CJS
// build for parsing. Same pin convention as every other crypto/fs route
// in this repo — explicit so a stray move to Edge can't silently break
// bundling.
export const runtime = "nodejs";

// Cache the combined GitHub + PDF payload for 10 minutes. Originally
// 24h because the inputs change monthly at most, but the modal now
// renders a live list of owned repos (rename/create/delete) so the
// TTL has to be short enough that those operations propagate to the
// UI within minutes. 10 min matches /api/github-stats and keeps the
// daily fetch volume per visitor in line with the other endpoint.
// PDF parse is still cheap relative to the GraphQL fan-out, so the
// shorter TTL doesn't meaningfully increase server cost.
const EXPERIENCE_REVALIDATE_SECONDS = 10 * 60;
const EXPERIENCE_CACHE_TAG = "experience-summary";

// Hard cap on owned-repo pagination. GitHub returns 100 per page, so
// 10 pages covers up to 1,000 owned non-fork repos — comfortably above
// any realistic personal account. Above this we stop paging and the
// list reflects approximately the most-recent 1,000 repos.
const MAX_OWNED_REPO_PAGES = 10;

// Edge / CDN cache window. Mirrors the github-stats route's headers so
// the about page can request both endpoints on mount and have them
// share TTL semantics. `stale-if-error` gives a full day of grace if
// the upstream chain (GitHub + PDF parse) starts failing.
const RESPONSE_CACHE_HEADERS = {
  "Cache-Control":
    "public, s-maxage=600, stale-while-revalidate=300, stale-if-error=86400",
};

const GITHUB_API = "https://api.github.com/graphql";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_TIMEOUT_MS =
  Number(process.env.GITHUB_TIMEOUT_MS) || 8000;

// Restrict by username for the same reason `/api/github-stats` does —
// without an allowlist, any caller varying `?username=` would trigger a
// fresh expensive computation against the shared token and pollute
// `unstable_cache` with junk keys.
const ALLOWED_USERNAME = (
  process.env.NEXT_PUBLIC_GITHUB_USERNAME || "MA1002643"
).toLowerCase();

// Resolve `public/<file>` to a path the function can read at runtime.
// On Vercel, `public/` is bundled into the deployment under the project
// root, so `process.cwd()` is the right anchor — works in dev, on
// Vercel, and in self-hosted Node alike.
const RESUME_PDF_PATH = path.join(
  process.cwd(),
  "public",
  "Muhammad_Abdullah_CV.pdf",
);

// Stable JSON serializer: sorts object keys recursively so two
// structurally equal payloads always hash to the same digest. Arrays
// preserve order because role order is meaningful (sorted by date).
// Used only for the change-fingerprint — never for response shaping,
// where insertion order matches the spec's documented payload.
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(",")}}`;
}

// Truncated SHA-256 of the content-relevant payload fields. 16 hex
// chars (64 bits) is overkill collision-resistance for a UI diff
// signal but keeps the wire payload compact. Excludes `generatedAt`
// (time-based, would change every call) and `changeFingerprint` itself
// (would otherwise depend on its own output).
function buildFingerprint(payload) {
  const { generatedAt, changeFingerprint, ...content } = payload;
  const hex = crypto
    .createHash("sha256")
    .update(stableStringify(content))
    .digest("hex");
  return `sha256-${hex.slice(0, 16)}`;
}

// Single-call GraphQL wrapper used by the owned-repos pagination loop.
// Each call gets its own AbortController + timeout so a stalled fetch
// can't hold the serverless function past its budget. Extracted so the
// loop body stays focused on pagination logic.
async function githubGraphQL(query, variables) {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN not set");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
  try {
    const res = await fetch(GITHUB_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    if (json.errors) {
      throw new Error(json.errors[0]?.message ?? "GraphQL error");
    }
    return json?.data;
  } finally {
    clearTimeout(timer);
  }
}

// Fetch every owned, non-fork repository the account has, paginated and
// ordered newest-first. `ownerAffiliations: OWNER` excludes contributor
// / member repos; `isFork: false` excludes forks (those weren't created
// by this account). Returns `{ name, createdAt, url }` records in DESC
// order so the modal can render newest-first; the earliest createdAt is
// always the last element. Bounded by MAX_OWNED_REPO_PAGES so a malformed
// pageInfo can't infinite-loop.
async function fetchOwnedRepos(username) {
  const query = `
    query OwnedRepos($username: String!, $after: String) {
      user(login: $username) {
        repositories(
          first: 100
          after: $after
          ownerAffiliations: OWNER
          isFork: false
          orderBy: { field: CREATED_AT, direction: DESC }
        ) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            name
            createdAt
            url
          }
        }
      }
    }
  `;
  const repos = [];
  let cursor = null;
  for (let page = 0; page < MAX_OWNED_REPO_PAGES; page++) {
    const data = await githubGraphQL(query, { username, after: cursor });
    const conn = data?.user?.repositories;
    if (!conn) break;
    for (const node of conn.nodes ?? []) {
      if (!node?.name || !node?.createdAt) continue;
      repos.push({
        name: node.name,
        createdAt: node.createdAt,
        url: node.url ?? null,
      });
    }
    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return repos;
}

// Per-side error tolerance: if GitHub fails we still return employment;
// if the PDF fails we still return personal projects. Only when both
// fail do we surface a 500 to the caller. Each side logs its own
// failure so on-call doesn't have to correlate timestamps.
async function buildExperienceSummary(username) {
  const now = new Date();

  // Run both fetches in parallel — they're independent and each has
  // its own timeout, so the slower one bounds wall-clock.
  const [githubResult, pdfResult] = await Promise.allSettled([
    fetchOwnedRepos(username),
    fs.readFile(RESUME_PDF_PATH).then((buf) => parseExperienceFromPdf(buf)),
  ]);

  let personalProjects = null;
  if (githubResult.status === "fulfilled" && githubResult.value?.length > 0) {
    // Repos are ordered DESC by createdAt (see fetchOwnedRepos), so the
    // last element is the oldest — that's the anchor for the months
    // calculation. The full list is exposed to the client so the modal
    // can render every repo with its creation date; including it in
    // the response also folds rename/create/delete events into the
    // payload's `changeFingerprint` (so Phase 5's banner will announce
    // a "new repo detected" change naturally without bespoke wiring).
    const repos = githubResult.value;
    const earliest = new Date(repos[repos.length - 1].createdAt);
    const months = Math.max(0, monthsBetween(earliest, now));
    personalProjects = {
      firstRepoDate: earliest.toISOString().slice(0, 10),
      months,
      display: formatDuration(months),
      repos,
    };
  } else if (githubResult.status === "rejected") {
    console.warn(
      "experience-summary: GitHub owned-repos lookup failed:",
      githubResult.reason?.message ?? githubResult.reason,
    );
  }

  let employment = null;
  if (pdfResult.status === "fulfilled") {
    const roles = pdfResult.value?.roles ?? [];
    const months = roles.reduce((sum, r) => sum + r.months, 0);
    employment = {
      months,
      display: formatDuration(months),
      roles,
    };
  } else {
    console.warn(
      "experience-summary: resume PDF parse failed:",
      pdfResult.reason?.message ?? pdfResult.reason,
    );
  }

  if (!personalProjects && !employment) {
    // Both sides failed — let the caller serve an error rather than
    // synthesise a misleading "0 months" total.
    throw new Error("Both GitHub and PDF sources failed");
  }

  const totalMonths =
    (personalProjects?.months ?? 0) + (employment?.months ?? 0);

  const payload = {
    generatedAt: now.toISOString(),
    personalProjects,
    employment,
    total: {
      months: totalMonths,
      display: formatDuration(totalMonths),
    },
  };
  payload.changeFingerprint = buildFingerprint(payload);
  return payload;
}

// `unstable_cache` keys by the function args. We pass the canonical
// (lowercase) username so the cache key is stable regardless of how the
// allowlist check arrived at it. Same defensive pattern as
// `getCachedGithubStats`.
const getCachedExperienceSummary = unstable_cache(
  async (username) => buildExperienceSummary(username),
  ["experience-summary"],
  {
    revalidate: EXPERIENCE_REVALIDATE_SECONDS,
    tags: [EXPERIENCE_CACHE_TAG],
  },
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "Missing 'username' query parameter." },
      { status: 400 },
    );
  }
  if (username.toLowerCase() !== ALLOWED_USERNAME) {
    return NextResponse.json(
      { error: "Username not allowed" },
      { status: 403 },
    );
  }

  try {
    const data = await getCachedExperienceSummary(ALLOWED_USERNAME);
    return NextResponse.json(data, { headers: RESPONSE_CACHE_HEADERS });
  } catch (error) {
    console.error("experience-summary fetch failed:", error);
    return NextResponse.json(
      { error: "Failed to build experience summary" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
