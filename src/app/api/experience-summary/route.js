import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { safeBearerEqual } from "../_utils/cronAuth";
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

// Reads an env value, parses it as a Number, and returns it only when
// it's a finite positive number. Anything else (missing, NaN, ≤0,
// Infinity) falls back to the default. Using `Number(env) || fallback`
// is NOT sufficient: it would only catch the falsy results (0, NaN),
// letting a negative value through and forcing immediate budget
// exhaustion at every call, or an `Infinity` through and disabling the
// budget entirely.
function envPositiveMs(envValue, fallback) {
  const n = Number(envValue);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

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

// Resolve `public/<file>` to a path the function can read at runtime.
// On Vercel, `public/` is bundled into the deployment under the
// project root *when* `outputFileTracingIncludes` lists the file in
// `next.config.mjs`. `process.cwd()` is normally the right anchor —
// but on some deployment shapes Next stages traced files under a
// nested directory and `process.cwd()` doesn't always point at it,
// so we try a handful of candidate paths in order and surface the
// one that worked (or the full failure list) in production logs.
const RESUME_PDF_FILENAME = "Muhammad_Abdullah_CV.pdf";
const RESUME_PDF_CANDIDATES = [
  // 1. Standard: <function-root>/public/<file>. Works locally and on
  //    Vercel when outputFileTracingIncludes has staged the file at
  //    the expected location.
  path.join(process.cwd(), "public", RESUME_PDF_FILENAME),
  // 2. Some Next/Vercel builds end up with cwd one level up from the
  //    traced project root; try the project subdirectory.
  path.join(process.cwd(), "theabdullahfolio", "public", RESUME_PDF_FILENAME),
  // 3. Bare filename in cwd — last-resort if Vercel places traced
  //    assets flat in the function root rather than under `public/`.
  path.join(process.cwd(), RESUME_PDF_FILENAME),
];

// Read the resume PDF by walking the candidate list in order. Logs
// `process.cwd()` and every probed path on first call so production
// logs make it obvious which path was used (or which were attempted)
// when the bundle layout differs from the local one. The error thrown
// on total failure carries the full attempt list so the caller can
// surface it in the response payload for remote diagnosis without
// needing Vercel CLI access.
async function readResumePdfBuffer() {
  const attempts = [];
  for (const candidate of RESUME_PDF_CANDIDATES) {
    try {
      const buf = await fs.readFile(candidate);
      console.log(
        `experience-summary: resume PDF found at "${candidate}" (${buf.length} bytes, cwd=${process.cwd()})`,
      );
      return buf;
    } catch (err) {
      attempts.push(`${candidate} -> ${err?.code ?? err?.message ?? "unknown"}`);
    }
  }
  // Detailed cwd + attempts go on properties, NOT in the public message
  // string — see the diagnostic gating below for why. The server-side
  // console.warn in buildExperienceSummary picks them up via those props.
  const error = new Error("Resume PDF not readable");
  error.code = "RESUME_PDF_NOT_FOUND";
  error.attempts = attempts;
  throw error;
}

// Wall-clock cap on the PDF read + parse path. pdfjs-dist's first
// initialization on a cold function instance can be slow (a few
// hundred ms easily), and parse work on top of it. Without a cap, a
// pathological slow parse could push the function past its platform
// timeout and fail the whole request — taking the GitHub side down
// with it. 4 s is generous against observed local timings.
const PDF_PARSE_TIMEOUT_MS = envPositiveMs(
  process.env.PDF_PARSE_TIMEOUT_MS,
  4000,
);

// Read the resume PDF and parse it, bounded by PDF_PARSE_TIMEOUT_MS.
// The timeout side of the race rejects with code "PDF_PARSE_TIMEOUT"
// so the caller's diagnostic code can distinguish "file missing" from
// "parse took too long".
//
// The timer handle is cleared in `finally` once the race settles — same
// discipline as the sibling `/api/github-stats` route's
// AbortController + setTimeout pattern. Without it, on the common path
// where the parse wins the `setTimeout` stays pending for the full
// PDF_PARSE_TIMEOUT_MS, keeping the serverless instance's event loop
// alive (or delaying freeze) for up to 4 s after every successful
// request. `Promise.race` doesn't cancel the loser, so clearing the
// timer is the only thing that stops the dangling timer.
async function readAndParseResumeWithTimeout() {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          Object.assign(
            new Error(
              `Resume PDF parse exceeded ${PDF_PARSE_TIMEOUT_MS}ms budget`,
            ),
            { code: "PDF_PARSE_TIMEOUT" },
          ),
        ),
      PDF_PARSE_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([
      (async () => {
        const buf = await readResumePdfBuffer();
        return parseExperienceFromPdf(buf);
      })(),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

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
  // `pdfStatus` and `_pdfDiagnosticInternal` are excluded too —
  // they're diagnostic noise, and including them would let a
  // flapping PDF error flip the fingerprint on every poll and
  // trigger the client's change banner spuriously.
  const {
    generatedAt,
    changeFingerprint,
    pdfStatus,
    _pdfDiagnosticInternal,
    ...content
  } = payload;
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

// Per-side error tolerance: if GitHub fails we still return employment;
// if the PDF fails we still return personal projects. Only when both
// fail do we surface a 500 to the caller. Each side logs its own
// failure so on-call doesn't have to correlate timestamps.
async function buildExperienceSummary(username) {
  const now = new Date();

  // Run both fetches in parallel — they're independent and each has
  // its own timeout, so the slower one bounds wall-clock. PDF side is
  // routed through `readAndParseResumeWithTimeout` so a slow pdfjs
  // init or a missing file produces a typed error (code
  // RESUME_PDF_NOT_FOUND / PDF_PARSE_TIMEOUT) instead of hanging the
  // function past its platform timeout and dropping the GitHub side.
  const [githubResult, pdfResult] = await Promise.allSettled([
    fetchOwnedRepos(username),
    readAndParseResumeWithTimeout(),
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
  // Split the PDF failure into two shapes:
  //   - `pdfStatus`: safe to expose publicly. Just the short error
  //     message and a coarse code like "RESUME_PDF_NOT_FOUND" /
  //     "PDF_PARSE_TIMEOUT". Carries enough signal to know which
  //     failure mode we hit without leaking the filesystem layout.
  //   - `pdfDiagnosticInternal`: full detail including cwd and the
  //     per-candidate attempt list. Logged to console.warn (visible
  //     in Vercel logs) and only echoed back to the caller when the
  //     request presents a bearer matching CRON_SECRET — same secret
  //     the cron / repo-refresh use, so the deployment owner can
  //     remotely diagnose without Vercel CLI but no public visitor
  //     ever sees the paths.
  let pdfStatus = null;
  let pdfDiagnosticInternal = null;
  if (pdfResult.status === "fulfilled") {
    const roles = pdfResult.value?.roles ?? [];
    const months = roles.reduce((sum, r) => sum + r.months, 0);
    employment = {
      months,
      display: formatDuration(months),
      roles,
    };
  } else {
    const reason = pdfResult.reason;
    pdfStatus = {
      message: reason?.message ?? String(reason),
      code: reason?.code ?? null,
    };
    pdfDiagnosticInternal = {
      ...pdfStatus,
      attempts: reason?.attempts ?? null,
      cwd: process.cwd(),
    };
    console.warn(
      "experience-summary: resume PDF parse failed:",
      pdfDiagnosticInternal,
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
    // Public-safe PDF failure signal. Just `{ message, code }` — no
    // filesystem paths, no cwd. Knowing which failure mode hit
    // ("RESUME_PDF_NOT_FOUND" vs "PDF_PARSE_TIMEOUT") is enough for a
    // visitor to interpret the empty employment side without exposing
    // server runtime layout. Excluded from `changeFingerprint` so a
    // flapping error can't churn the fingerprint and trip the client
    // banner.
    pdfStatus,
    // Full diagnostic (cwd + per-candidate attempts). Held in the
    // cached payload so an authenticated caller can read it
    // consistently, BUT stripped out of the response for any caller
    // without the CRON_SECRET bearer (see GET handler below). Leading
    // underscore is the convention for "do not expose without
    // gating" in this file.
    _pdfDiagnosticInternal: pdfDiagnosticInternal,
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
    // Internal-only diagnostic field. Allow it through to the response
    // ONLY when the caller presents a bearer matching CRON_SECRET (the
    // same secret already used by `/api/repo-refresh`). Anyone else
    // gets the field stripped. The response is also marked `no-store`
    // in the authenticated branch so the CDN never caches an
    // internal-detail payload and hands it to a later anonymous
    // visitor.
    const { _pdfDiagnosticInternal, ...publicData } = data;
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    const isAuthorizedDebug =
      cronSecret && safeBearerEqual(authHeader, cronSecret);

    if (isAuthorizedDebug) {
      return NextResponse.json(
        { ...publicData, _pdfDiagnosticInternal },
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
