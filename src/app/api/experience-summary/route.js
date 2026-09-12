import crypto from "node:crypto";

import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { safeBearerEqual } from "../_utils/cronAuth";
import { envPositiveMs } from "../_utils/env";
import { journeyData } from "@/app/data";
import { formatDuration, monthsBetween } from "@/utils/experience/dateMath";
import { employmentFromJourney } from "@/utils/experience/journeyEmployment";

// Node runtime required: `node:crypto` for the payload fingerprint. Same pin
// convention as every other crypto route in this repo — explicit so a stray
// move to Edge can't silently break bundling.
export const runtime = "nodejs";

// Cache the payload for 10 minutes. Originally 24h because the inputs change
// monthly at most, but the modal now renders a live list of owned repos
// (rename/create/delete) so the TTL has to be short enough that those
// operations propagate to the UI within minutes. 10 min matches
// /api/github-stats and keeps the daily fetch volume per visitor in line with
// the other endpoint. The GraphQL fan-out is now the only cost behind a miss —
// the employment half is a derivation over a static import.
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
// GitHub starts failing.
const RESPONSE_CACHE_HEADERS = {
  "Cache-Control":
    "public, s-maxage=600, stale-while-revalidate=300, stale-if-error=86400",
};

const GITHUB_API = "https://api.github.com/graphql";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Per-call ceiling. Must stay strictly below the serverless function
// timeout (10 s on Hobby, 60 s on Pro). Same env var as `/api/github-stats`
// so a single override raises both routes for Pro/Enterprise.
const GITHUB_TIMEOUT_MS = envPositiveMs(process.env.GITHUB_TIMEOUT_MS, 8000);
// Cumulative wall-clock budget across the entire owned-repos pagination.
// Per-call timeouts alone aren't enough: with `MAX_OWNED_REPO_PAGES = 10`
// and an 8 s per-call ceiling, the theoretical worst case is 80 s — well
// past Hobby's 10 s function limit. This bound is the hard upper limit on
// time spent paginating; if it fires we return whatever repos we managed
// to collect (partial) rather than throw, so the modal still gets the
// newest entries. Default 9 s keeps the function well under Hobby's
// 10 s budget even on a cold miss. Same env var name as `/api/github-stats`
// so a Pro/Enterprise override raises both routes together.
const GITHUB_OVERALL_BUDGET_MS = envPositiveMs(
  process.env.GITHUB_OVERALL_BUDGET_MS,
  9000,
);

// Restrict by username for the same reason `/api/github-stats` does —
// without an allowlist, any caller varying `?username=` would trigger a
// fresh expensive computation against the shared token and pollute
// `unstable_cache` with junk keys.
const ALLOWED_USERNAME = (
  process.env.NEXT_PUBLIC_GITHUB_USERNAME || "MA1002643"
).toLowerCase();

// Employment used to come from a runtime parse of the CV PDF, which is why
// this file once carried a candidate-path walk, a pdfjs parse, and a 4 s
// timeout wrapped around them. It is now derived from `journeyData` — the same
// array /journey renders — by `employmentFromJourney`, which documents the
// reasoning: one source for both pages, and a UNION of overlapping roles
// rather than a sum. All three PDF helpers went with it. They existed only to
// feed this figure, and keeping them would have paid a pdfjs cold start on
// every cache miss for a value nothing reads.
//
// The CV has not stopped mattering — it is a deliberately-indexed public
// document (#32 W1b). It is just checked in the right place now:
// tests/unit/cvJourneyConsistency.test.js parses it at test time and fails if
// it disagrees with this array, so the document cannot drift away from the
// site without CI saying so.

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
  // `pdfStatus` / `_pdfDiagnosticInternal` were excluded here too, so a
  // flapping PDF error could not flip the fingerprint on every poll and trip
  // the client's change banner spuriously. Neither field exists any more.
  const { generatedAt, changeFingerprint, ...content } = payload;
  const hex = crypto
    .createHash("sha256")
    .update(stableStringify(content))
    .digest("hex");
  return `sha256-${hex.slice(0, 16)}`;
}

// Single-call GraphQL wrapper used by the owned-repos pagination loop.
// Each call gets its own AbortController + timeout so a stalled fetch
// can't hold the serverless function past its budget. The paginating
// caller threads a per-call ceiling derived from its remaining wall-
// clock budget so a single slow GitHub response can't consume the
// entire `GITHUB_OVERALL_BUDGET_MS` on the first page.
async function githubGraphQL(query, variables, timeoutMs = GITHUB_TIMEOUT_MS) {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN not set");
  }
  // Short-circuit when the budget is already exhausted. `setTimeout(..., 0)`
  // queues the abort as a macrotask, so without this we'd still kick off
  // a fetch that opens a TCP/TLS connection before the immediate abort
  // fires. AbortError name matches the shape `fetch` produces, so the
  // pagination loop's existing AbortError catch handles it uniformly.
  if (timeoutMs <= 0) {
    throw new DOMException(
      "experience-summary: GitHub call budget exhausted",
      "AbortError",
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
// always the last element.
//
// Two safety nets:
//   - `MAX_OWNED_REPO_PAGES` — hard page ceiling so a malformed
//     `pageInfo` can't infinite-loop.
//   - `GITHUB_OVERALL_BUDGET_MS` — wall-clock budget. Each call's
//     per-call timeout is capped at `min(GITHUB_TIMEOUT_MS, remaining
//     budget)`, and if the budget is exhausted between pages we break
//     and return whatever was collected. Partial results are far
//     better than a thrown error: the catch in `buildExperienceSummary`
//     would drop the entire personal-projects panel, and the 10-min
//     `unstable_cache` would lock that state in until the next TTL.
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
  const deadline = Date.now() + GITHUB_OVERALL_BUDGET_MS;
  const repos = [];
  let cursor = null;
  for (let page = 0; page < MAX_OWNED_REPO_PAGES; page++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      console.warn(
        `experience-summary: wall-clock budget exhausted after page ${page} ` +
          `(${repos.length} repos collected) — returning partial result`,
      );
      break;
    }
    // Cap per-call timeout at the remaining budget so a single slow
    // call can't push the loop past the overall deadline.
    const perCallTimeout = Math.min(GITHUB_TIMEOUT_MS, remaining);
    try {
      const data = await githubGraphQL(
        query,
        { username, after: cursor },
        perCallTimeout,
      );
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
    } catch (err) {
      // Timeout / abort mid-pagination — keep what we have, log, and
      // exit. Any other error (auth, GraphQL field error) is fatal and
      // bubbles up so the outer `Promise.allSettled` can flag the
      // GitHub side as failed.
      if (err?.name === "AbortError" && repos.length > 0) {
        console.warn(
          `experience-summary: page ${page} aborted (timeout) — ` +
            `returning ${repos.length} repos collected so far`,
        );
        break;
      }
      throw err;
    }
  }
  return repos;
}

// GitHub is now the ONLY fallible source. Employment comes from a static
// import, so the two-sided error tolerance this function used to carry —
// either source may fail, only a double failure is a 500 — collapsed to one
// side. There is no longer a failure mode that empties the employment half.
async function buildExperienceSummary(username) {
  const now = new Date();

  const [githubResult] = await Promise.allSettled([fetchOwnedRepos(username)]);

  // `personalProjects` is reserved as `null` for exactly one meaning: the
  // GitHub source FAILED (rejected). A successful response with an empty
  // repo list is a genuine "owns nothing yet" result, not a failure, so it
  // returns an explicit empty object (months 0, repos []). This mirrors the
  // employment side ({ months: 0, roles: [] } on a successful-but-empty
  // resume parse) and lets the client key its "Unavailable" treatment off
  // `null` without misreporting a zero-repo account as a load failure.
  let personalProjects = null;
  if (githubResult.status === "fulfilled") {
    // Repos are ordered DESC by createdAt (see fetchOwnedRepos), so the
    // last element is the oldest — that's the anchor for the months
    // calculation. The full list is exposed to the client so the modal
    // can render every repo with its creation date; including it in
    // the response also folds rename/create/delete events into the
    // payload's `changeFingerprint` (so Phase 5's banner will announce
    // a "new repo detected" change naturally without bespoke wiring).
    const repos = githubResult.value ?? [];
    if (repos.length > 0) {
      const earliest = new Date(repos[repos.length - 1].createdAt);
      const months = Math.max(0, monthsBetween(earliest, now));
      personalProjects = {
        firstRepoDate: earliest.toISOString().slice(0, 10),
        months,
        display: formatDuration(months),
        repos,
      };
    } else {
      personalProjects = {
        firstRepoDate: null,
        months: 0,
        display: formatDuration(0),
        repos: [],
      };
    }
  } else if (githubResult.status === "rejected") {
    console.warn(
      "experience-summary: GitHub owned-repos lookup failed:",
      githubResult.reason?.message ?? githubResult.reason,
    );
  }

  // A pure derivation over a static import, so unlike the GitHub side it
  // cannot fail and `employment` is never null. The client's "Unavailable"
  // branch keys off null and is now unreachable for this half — left in place
  // deliberately rather than deleted, since it costs nothing and is the
  // correct rendering if this ever becomes fallible again.
  //
  // `now` is threaded in rather than read inside, so the employment span and
  // the personal-projects span are measured against the SAME instant and the
  // two halves of the bar cannot straddle a month boundary and disagree.
  const employment = employmentFromJourney(journeyData, now);

  if (!personalProjects) {
    // The only remaining total failure. This used to require BOTH sources to
    // fail; with employment derived locally, GitHub is the whole risk.
    throw new Error("GitHub source failed");
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
    // `pdfStatus` and `_pdfDiagnosticInternal` used to sit here, carrying the
    // PDF read/parse failure: a publicly-safe `{ message, code }` and a
    // CRON_SECRET-gated detail with cwd and the probed paths. Both went with
    // the PDF read itself — there is no longer a filesystem access on this
    // path to diagnose.
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
    // Internal-only fields reach the response ONLY when the caller presents a
    // bearer matching CRON_SECRET (the same secret `/api/repo-refresh` uses).
    // Anyone else gets them stripped, and the authenticated branch is
    // `no-store` so the CDN never caches an internal-detail payload and hands
    // it to a later anonymous visitor.
    //
    // There are none today — `_pdfDiagnosticInternal` went with the PDF read
    // it described. The gate is kept: it is the seam any future internal field
    // slots into, and removing a security control for tidiness is a bad trade.
    // It now strips every `_`-prefixed key rather than one named field, so a
    // field added later is gated by default instead of by remembering to.
    const publicData = Object.fromEntries(
      Object.entries(data).filter(([key]) => !key.startsWith("_")),
    );
    const internalOnly = Object.fromEntries(
      Object.entries(data).filter(([key]) => key.startsWith("_")),
    );
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    const isAuthorizedDebug =
      cronSecret && safeBearerEqual(authHeader, cronSecret);

    if (isAuthorizedDebug) {
      return NextResponse.json(
        { ...publicData, ...internalOnly },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(publicData, { headers: RESPONSE_CACHE_HEADERS });
  } catch (error) {
    console.error("experience-summary fetch failed:", error);
    return NextResponse.json(
      { error: "Failed to build experience summary" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
