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

// How long a DEGRADED answer may be reused before this route asks GitHub again.
//
// The ten minutes above is the freshness contract a COMPLETE answer earns, and
// a partial one used to inherit it: `unstable_cache` memoises whatever
// `buildExperienceSummary` returns, so one rate-limited GitHub call parked
// "Unavailable" in the server-side cache for the full window. The response
// headers cannot reach that — `no-store` in GET keeps a partial out of the CDN
// and the browser, and says nothing about the memoised value behind them, so
// the next request read the same degraded payload straight back out.
//
// A minute is the shortest window that still BOUNDS the retries. Simply not
// caching a partial answer would mean one GitHub fan-out per request on a
// public endpoint, each with a 9 s wall-clock budget behind it. Here the cost
// is one attempt per degraded answer — the retry entry below is keyed by the
// payload it replaces, so the attempt's result is reused rather than recomputed
// — plus, while an outage continues, one background refresh a minute from that
// entry's own `revalidate`. Recovery lands inside a minute instead of ten.
const EXPERIENCE_PARTIAL_RETRY_SECONDS = 60;

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
// by this account).
//
// Returns `{ repos, complete }` — NOT a bare array, and the second field is
// the point. `repos` holds `{ name, createdAt, url }` records in DESC order so
// the modal can render newest-first, which also means the earliest createdAt
// is the LAST element, on the LAST page. `complete` says whether we got to
// that page: a caller reading `repos[repos.length - 1]` off a short list is
// reading the oldest repo it managed to fetch, not the oldest one that exists,
// and the two are indistinguishable without this flag.
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
//
// That last trade is still the right one, but it was being made silently.
// Returning a short list as an ordinary success meant the caller published a
// `total` anchored on the newest-of-the-old repos with `partial: false` beside
// it — a definite undercount asserting it was complete. `complete` is what
// keeps the trade honest: the repos are still shown, and the figures derived
// from them are held back until the list is known to be whole.
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
  // Set ONLY by GitHub telling us there is no next page. Every other way out of
  // this loop — budget exhausted, a page aborted, a malformed response, the
  // MAX_OWNED_REPO_PAGES ceiling — leaves it false, because every one of them
  // means there may be repos we never saw. Default-false and one place to set
  // it, so a new `break` added later is incomplete until someone decides
  // otherwise, rather than silently claiming completeness.
  let complete = false;
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
      if (!conn.pageInfo?.hasNextPage) {
        complete = true;
        break;
      }
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
  return { repos, complete };
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
    const { repos = [], complete = false } = githubResult.value ?? {};
    if (repos.length > 0) {
      const earliest = new Date(repos[repos.length - 1].createdAt);
      const months = Math.max(0, monthsBetween(earliest, now));
      personalProjects = {
        firstRepoDate: earliest.toISOString().slice(0, 10),
        months,
        display: formatDuration(months),
        repos,
        // Whether `repos` is ALL of them. This is not decoration: pagination
        // runs newest-first, so the oldest repositories are on the LAST pages,
        // and `firstRepoDate` above is read off the last element. A page that
        // timed out therefore drops exactly the repos that anchor the span —
        // the undercount is systematic and always in the same direction, never
        // a random sample. `months` is a FLOOR when this is false.
        complete,
      };
    } else {
      personalProjects = {
        firstRepoDate: null,
        months: 0,
        display: formatDuration(0),
        repos: [],
        // An empty list is only an honest "owns nothing yet" if we actually
        // reached the end. Aborting on the first page reaches here too, and
        // that is not the same statement.
        complete,
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

  // GitHub is the only fallible half now, and it used to throw here — which
  // turned a partial failure into a total one: the handler answered 500 and
  // discarded an `employment` figure that was already computed and correct.
  // The client renders the two halves independently and has carried an
  // "Unavailable" branch for a null `personalProjects` all along
  // (ExperienceBreakdownModal), so there was a good answer to give and nothing
  // to stop us giving it.
  //
  // The response says it is partial rather than leaving the caller to infer it
  // from a null field. Three things key off this flag, and each of them is a
  // way the naive "just delete the throw" version goes wrong:
  //   · `total` below, which must not be a number (see there);
  //   · the response's cache headers in GET, so a transient blip is not held
  //     at the CDN for the full ten-minute window a good answer earns;
  //   · the client's localStorage write, which is its instant-paint source on
  //     the NEXT visit — storing a half-answer would make a later, perfectly
  //     healthy page load paint "Unavailable" out of storage.
  // Two ways to be partial, and the second is the quieter one. The GitHub half
  // can FAIL outright (null above), or it can SUCCEED INCOMPLETELY — pagination
  // stopping early on a timeout, the wall-clock budget, or the page ceiling
  // returns a fulfilled array that simply is not all of them.
  //
  // Only the first used to count. A fulfilled-but-short array published
  // `partial: false` and a `total` anchored on the oldest repo it happened to
  // see, which is a definite understatement asserting it is complete — worse
  // than the outright failure, because nothing about it looks wrong.
  const partial = personalProjects == null || personalProjects.complete !== true;

  const totalMonths =
    (personalProjects?.months ?? 0) + (employment?.months ?? 0);

  const payload = {
    generatedAt: now.toISOString(),
    partial,
    personalProjects,
    employment,
    // NULL when partial, deliberately, rather than the employment half alone.
    // This exact field is what the /about years card counts up to
    // (`experienceData?.total?.months ?? 0`), so a sum missing the personal
    // side is not a smaller number — it is a WRONG number wearing the
    // headline's clothes, published with no sign that anything is missing.
    // Null lands the card on the same value it shows before the fetch
    // resolves, which reads as "not in yet" instead of as a claim.
    total: partial
      ? null
      : {
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

// The RETRY entry, read only when the entry above holds a degraded answer that
// has outlived `EXPERIENCE_PARTIAL_RETRY_SECONDS`.
//
// A SECOND cache rather than an invalidation of the first, and the reason is
// worth stating because `revalidateTag` looks like the obvious tool for this.
// Tag revalidation cannot be relied on to make the very next read miss: when
// `unstable_cache` finds an entry it considers stale it returns the stale value
// and rebuilds in the BACKGROUND, so a retry built that way would hand this
// request the same partial payload it had just judged too old, and the fix
// would depend on which incremental-cache handler is installed. A second key
// needs no such guarantee — a key with no entry can only be a miss.
//
// ── What the key is, and why it is not a clock ──────────────────────────────
// It is the STALE PAYLOAD'S OWN IDENTITY (`generatedAt`), so this entry answers
// one question: "what should replace that particular degraded answer?"
//
// The first cut keyed it by a wall-clock bucket — `floor(now / 60s)` — which
// bounded retries at one a minute and then threw the result away: every new
// minute was a new key and therefore a new miss, so a RECOVERY was re-fetched
// from GitHub on the minute for the rest of the primary entry's ten-minute
// window. Up to nine wasted paginated fan-outs, each one arriving at the same
// complete answer the last had already computed, and the bound was hiding it —
// one per minute looks cheap until you notice none of them was needed.
//
// Keyed by the payload it replaces, the recovery is computed ONCE and every
// later request reads it back. The key changes only when the thing it describes
// does: the primary entry's TTL expires, it rebuilds, and a new degraded answer
// (new `generatedAt`) earns exactly one fresh attempt.
//
// Retries during a continuing outage come from this entry's own `revalidate`
// rather than from the key: after 60 seconds `unstable_cache` treats it as
// stale, serves the degraded answer it holds and rebuilds behind it. That is
// the same stale-then-rebuild behaviour that made `revalidateTag` unusable
// above, and here it is precisely what is wanted — a bounded retry loop that
// never blocks a request on GitHub twice.
//
// Both entries carry `EXPERIENCE_CACHE_TAG`, so `/api/repo-refresh` still drops
// the whole route's memoised state with the one `revalidateTag` call it already
// makes.
const getRetriedExperienceSummary = unstable_cache(
  async (username, replacing) => {
    // `replacing` is unread ON PURPOSE, and not forwarded to the builder either
    // — it would be a phantom second parameter there. `unstable_cache` keys by
    // this function's arguments, so RECEIVING it is the entire mechanism: it
    // ties one cache entry to one degraded answer, and the build has no use for
    // the value.
    void replacing;
    return buildExperienceSummary(username);
  },
  ["experience-summary-retry"],
  {
    revalidate: EXPERIENCE_PARTIAL_RETRY_SECONDS,
    tags: [EXPERIENCE_CACHE_TAG],
  },
);

/**
 * The retry cache key for a degraded payload: the payload's own stamp.
 *
 * `generatedAt` is set once per build, so it names this exact degraded answer
 * and nothing else. A payload with no usable stamp still gets a stable key
 * rather than a per-request one — it must not become a cache-key generator.
 *
 * @param {object|null|undefined} payload The degraded payload being replaced.
 * @returns {string} A key stable for as long as that payload is cached.
 */
const partialRetryKey = (payload) => String(payload?.generatedAt ?? "unstamped");

/**
 * Whether a cached payload is a degraded answer that has outlived the short
 * window a degraded answer gets.
 *
 * Read off the payload's own `generatedAt` rather than tracked beside the
 * cache, because that stamp is the only age signal that survives the thing
 * holding it: the cache is shared across instances and outlives any of them, so
 * a module-level "when did we last see a partial" would reset on every cold
 * start and disagree between two warm instances.
 *
 * @param {object|null|undefined} payload A payload from either cache entry.
 * @param {number} [now] Epoch milliseconds; defaults to the clock.
 * @returns {boolean} True when the answer is partial AND past the window.
 */
function isExpiredPartial(payload, now = Date.now()) {
  if (payload?.partial !== true) return false;
  const generatedAt = Date.parse(payload.generatedAt ?? "");
  // A missing or unparseable stamp counts as EXPIRED, not as fresh. The bucket
  // bounds the cost of being wrong in this direction at one GitHub call per
  // window; being wrong in the other direction pins a degraded answer for the
  // full ten minutes on a malformed field.
  if (Number.isNaN(generatedAt)) return true;
  return now - generatedAt >= EXPERIENCE_PARTIAL_RETRY_SECONDS * 1000;
}

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
    let data = await getCachedExperienceSummary(ALLOWED_USERNAME);
    // A degraded answer does not get to hold the ten-minute window a good one
    // earns. Past `EXPERIENCE_PARTIAL_RETRY_SECONDS` we ask GitHub again
    // through the retry entry — keyed by the degraded payload being replaced,
    // so one attempt is made per degraded answer and its result (a recovery, or
    // a fresher partial while GitHub is still failing) is what every later
    // request in that window reads.
    //
    // The primary entry keeps its degraded payload until its own TTL expires,
    // so requests for the rest of that window pay two cache reads and are
    // served the retry's answer. That is the whole residual now, and it is
    // cheap: two reads, no second fan-out. Promoting the recovery into the
    // primary entry would need a `revalidateTag` and a rebuild — one more
    // GitHub fan-out to save one cache read, on the tag semantics this design
    // deliberately does not depend on.
    if (isExpiredPartial(data)) {
      data = await getRetriedExperienceSummary(
        ALLOWED_USERNAME,
        partialRetryKey(data),
      );
    }
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
    // A partial answer is not cacheable on the terms a complete one is. The
    // normal headers would park it at the CDN for `s-maxage=600` plus five
    // minutes of `stale-while-revalidate`, so one rate-limited GitHub call
    // would show "Unavailable" to every visitor for a quarter of an hour after
    // GitHub had recovered. `no-store` keeps it out of shared caches, and the
    // next request re-attempts.
    //
    // It also protects the `stale-if-error=86400` below, which is doing real
    // work today: while this route answered 500, a warm edge went on serving
    // the last GOOD payload for up to a day. Returning 200 here makes that
    // directive inapplicable — so a partial answer must not be storable, or it
    // would evict a complete one that was still being served.
    //
    // These headers only ever governed the CDN and the browser, and for a while
    // that left the real hold-time unaddressed: `buildExperienceSummary` is
    // memoised by `unstable_cache`, so a partial payload sat in the server-side
    // cache for the same ten minutes a good answer gets, and every request in
    // that window read it back out no matter what `Cache-Control` said. The
    // server side is now bounded on its own terms — a degraded answer is
    // retried after `EXPERIENCE_PARTIAL_RETRY_SECONDS` through the second cache
    // entry above — so the two halves of the contract finally agree: a partial
    // answer is short-lived everywhere, and a complete one is cacheable for the
    // full window in both places.
    return NextResponse.json(publicData, {
      headers: publicData.partial
        ? { "Cache-Control": "no-store" }
        : RESPONSE_CACHE_HEADERS,
    });
  } catch (error) {
    console.error("experience-summary fetch failed:", error);
    return NextResponse.json(
      { error: "Failed to build experience summary" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
