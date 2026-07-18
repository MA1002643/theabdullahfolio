import { AsyncLocalStorage } from "node:async_hooks";

import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { categorizeSkills, categorizeSkillsWithRepos } from "@/utils/skillsIconMap";
import { MANIFESTS, parseManifest } from "@/utils/manifestParsers";

// Record that `name` (a detected language / dependency) surfaced in `repo`.
// `into` is a Map<detectedName, { repos: Set<nameWithOwner>, privateRepos:
// Set<nameWithOwner> }> so the payload can later tell the user WHICH public
// repositories each skill is used in. PRIVATE repos are tracked in their own
// set — by real nameWithOwner, so the same private repo detected via several
// signals (primaryLanguage + languages list + manifests) or alias names dedupes
// — but ONLY their count ever reaches the public payload; the names are dropped
// at build time (`buildSkillCategories`). `repo` may still be null/empty to
// register a bare detection with no repo attached.
function trackSkill(into, name, repo, isPrivate) {
  if (!name) return;
  let entry = into.get(name);
  if (!entry) {
    entry = { repos: new Set(), privateRepos: new Set() };
    into.set(name, entry);
  }
  if (repo) (isPrivate ? entry.privateRepos : entry.repos).add(repo);
}

// Pin to Node — `node:async_hooks` (the shared-deadline AsyncLocalStorage,
// mirroring /api/github-stats) is Node-only, and pinning keeps a future Edge
// move from silently breaking bundling.
export const runtime = "nodejs";

const GITHUB_API = "https://api.github.com/graphql";
const TOKEN = process.env.GITHUB_TOKEN;

// 10-minute TTL — matches the github-stats route's refresh cadence so a new
// repo / dependency surfaces quickly (shortened from 24h per request). The
// crawl is budget-bounded, so revalidating this often stays well within the
// authenticated GitHub rate limit.
const REVALIDATE_SECONDS = 10 * 60;

// Finite-positive env validation, matching /api/experience-summary and
// /api/repo-refresh. A plain `Number(env) || fallback` only rejects falsy
// results (0, NaN): a negative value slips through (forcing immediate aborts)
// and `Infinity` slips through (disabling the cap entirely).
function envPositiveMs(envValue, fallback) {
  const n = Number(envValue);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Per-call and cumulative wall-clock budgets — identical discipline to the
// github-stats route so a slow GitHub response can't push this function past
// the serverless limit (10 s Hobby / 60 s Pro). The crawl pages repos across
// two privacy scopes and then fans out per-repo (recursive tree + manifest blob
// fetch), so the cumulative cap is what actually bounds it; on exhaustion inner
// calls abort and we keep whatever partial results were collected.
const GITHUB_TIMEOUT_MS = envPositiveMs(process.env.GITHUB_TIMEOUT_MS, 8000);
const MAX_TOTAL_GITHUB_MS = envPositiveMs(
  process.env.GITHUB_OVERALL_TIMEOUT_MS,
  9000,
);
const GITHUB_OVERALL_BUDGET_MS = envPositiveMs(
  process.env.GITHUB_OVERALL_BUDGET_MS,
  9000,
);

// Hard cap on repo pagination per privacy scope: 100 repos/page × 10 = ~1,000
// repos per scope, far beyond a realistic account. Stops a malformed pageInfo
// loop from paging forever even before the wall-clock budget bites.
const MAX_REPO_PAGES = 10;

// Only the site owner's account is ever crawled. Pinning closes a token/
// rate-limit exhaustion vector: without it, any caller varying `?username=`
// would trigger a fresh, expensive multi-page crawl against the shared
// GITHUB_TOKEN and pollute `unstable_cache` with junk entries. Mirrors the
// github-stats route's allowlist.
const ALLOWED_USERNAME = (
  process.env.NEXT_PUBLIC_GITHUB_USERNAME || "MA1002643"
).toLowerCase();

// Propagates the request deadline through the cache-miss crawl without
// polluting the cache key (a `deadline` arg would force a fresh key every
// request and defeat the cache). On a cache hit the crawl never runs and the
// store is never consulted. Same pattern as github-stats.
const deadlineStore = new AsyncLocalStorage();

// Milliseconds left under the tightest active budget. When a request deadline
// is in flight (the GET handler always sets one), the helper-local `fallbackMs`
// is honored as a co-equal ceiling; with no deadline (ad-hoc calls) only the
// local fallback applies.
function remainingBudget(fallbackMs) {
  const store = deadlineStore.getStore();
  if (!store) return Math.max(0, fallbackMs);
  return Math.max(0, Math.min(store.deadline - Date.now(), fallbackMs));
}

// Single GitHub GraphQL entry point — every call goes through here so the
// timeout ceiling applies uniformly and aborts/HTTP/GraphQL errors surface
// with a diagnosable message. Returns the GraphQL `data` block. Lifted from
// the github-stats route (the proven shape) with skills-flavoured messages.
async function githubGraphQL(query, variables, timeoutMs) {
  if (!TOKEN) {
    throw new Error("GitHub skills: GITHUB_TOKEN env var is not set");
  }

  const baseTimeout = timeoutMs ?? GITHUB_TIMEOUT_MS;
  const effectiveTimeout = Math.min(baseTimeout, remainingBudget(baseTimeout));
  if (effectiveTimeout <= 0) {
    throw new DOMException(
      "GitHub skills: request budget exhausted before call",
      "AbortError",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);
  try {
    const res = await fetch(GITHUB_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    const rawBody = await res.text();
    let json;
    let parseSucceeded = false;
    try {
      json = JSON.parse(rawBody);
      parseSucceeded = true;
    } catch {
      // Handled below — branches on `parseSucceeded`.
    }

    if (!res.ok) {
      const detail = json?.message || `HTTP ${res.status} ${res.statusText}`;
      throw new Error(`GitHub skills: GraphQL request failed (${detail})`);
    }
    if (!parseSucceeded) {
      const snippet = rawBody.slice(0, 200).replace(/\s+/g, " ").trim();
      const truncated = rawBody.length > 200 ? "…" : "";
      throw new Error(
        `GitHub skills: GraphQL response was not valid JSON (HTTP ${res.status}, body: "${snippet}${truncated}")`,
      );
    }
    // Unlike the github-stats queries (all-or-nothing), this crawl issues
    // queries with OPTIONAL fields — e.g. the manifest-text batch resolves a
    // `object(expression:"HEAD:<path>")` to null AND emits a field-level error
    // when a path can't be resolved ("Could not resolve file for path …"). That
    // comes back as `{ data: {…partial…}, errors: [...] }`. Discarding the whole
    // response on any `errors` would throw away the usable partial data, so we
    // tolerate field errors as long as SOME `data` is present — callers guard
    // their own shape (`data.user` / `data.repository`). Only a response with no
    // `data` at all is fatal.
    if (!json?.data) {
      throw new Error(json?.errors?.[0]?.message || "GitHub skills: empty GraphQL response");
    }
    if (json?.errors) {
      console.warn(
        `github-skills: partial GraphQL response (${json.errors.length} field error(s)); first: ${json.errors[0]?.message}`,
      );
    }
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

// Repo listing query. Languages are pulled inline (they cover the language
// tier); manifests are NOT — they're discovered separately because real repos
// keep them in arbitrarily-named subdirectories (`Backend/`, `Frontend/app/`,
// …), not just at the root, so an inline `file(path:"package.json")` would miss
// the bulk of a full-stack repo's stack. `defaultBranchRef.target.oid` gives the
// tree SHA used to enumerate the file tree below; a null target means an empty
// repo (no commits), which we skip.
const REPOS_QUERY = `
  query($username: String!, $after: String, $privacy: RepositoryPrivacy) {
    user(login: $username) {
      repositories(
        first: 100,
        after: $after,
        # OWNER only — never COLLABORATOR. A collaborator affiliation pulls repos
        # owned by OTHER accounts/orgs (including PRIVATE org repos) into the
        # per-skill repos lists, which ship in this PUBLIC, CDN-cached payload —
        # i.e. it would leak the names of repos that aren't even yours. Matches
        # /api/github-stats's owner-only crawl. (PRIVATE scope below still applies,
        # so this surfaces only the owner's OWN repos, public + private.)
        ownerAffiliations: [OWNER],
        privacy: $privacy
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          nameWithOwner
          isPrivate
          primaryLanguage { name }
          languages(first: 10) { nodes { name } }
          defaultBranchRef { target { ... on Commit { oid } } }
        }
      }
    }
  }
`;

// The manifest filenames we recognise (basename match at ANY tree depth).
const MANIFEST_BASENAMES = new Set(MANIFESTS.map((m) => m.path));

// Directory segments never worth scanning: vendored deps and build output. A
// path crossing any of these is skipped so we never parse a dependency's OWN
// manifest (e.g. node_modules/**/package.json) as if it were the repo's stack.
const SKIP_DIR =
  /(^|\/)(node_modules|bower_components|vendor|\.git|\.next|\.nuxt|dist|build|out|target|coverage|\.venv|venv|__pycache__|\.cache)(\/|$)/i;

// Per-repo cap on manifests fetched, and how many repos' trees/blobs are
// fetched in parallel. The cap bounds a pathological monorepo; the concurrency
// keeps the per-repo REST(tree)+GraphQL(blobs) fan-out within the wall-clock
// budget for a normal account without hammering the rate limit.
const MAX_MANIFESTS_PER_REPO = 30;
const REPO_CONCURRENCY = 6;

// REST entry point (Git Trees + anything else). Mirrors `githubGraphQL`'s
// budget/timeout discipline. 404/409 (renamed/empty repo, no tree) are surfaced
// via `err.status` so callers can treat them as "no manifests", not failure.
async function githubREST(path, timeoutMs) {
  if (!TOKEN) throw new Error("GitHub skills: GITHUB_TOKEN env var is not set");

  const baseTimeout = timeoutMs ?? GITHUB_TIMEOUT_MS;
  const effectiveTimeout = Math.min(baseTimeout, remainingBudget(baseTimeout));
  if (effectiveTimeout <= 0) {
    throw new DOMException("GitHub skills: request budget exhausted before call", "AbortError");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = new Error(`GitHub skills: REST request failed (HTTP ${res.status} ${res.statusText})`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Enumerate one repo's default-branch tree (recursive, one REST call) and
// return the full paths of every recognised manifest, at any depth, outside the
// skip-list. A truncated tree (huge repo) is logged; an empty/renamed repo
// (404/409) yields []. Capped at MAX_MANIFESTS_PER_REPO.
async function findManifestPaths(nameWithOwner, sha, timeoutMs) {
  let data;
  try {
    data = await githubREST(`/repos/${nameWithOwner}/git/trees/${sha}?recursive=1`, timeoutMs);
  } catch (err) {
    if (err?.status === 404 || err?.status === 409) return [];
    throw err;
  }
  if (data?.truncated) {
    console.warn(`github-skills: ${nameWithOwner} tree truncated; some nested manifests may be missed.`);
  }
  const paths = [];
  for (const entry of data?.tree ?? []) {
    if (entry?.type !== "blob" || typeof entry.path !== "string") continue;
    if (SKIP_DIR.test(entry.path)) continue;
    if (MANIFEST_BASENAMES.has(entry.path.split("/").pop())) {
      paths.push(entry.path);
      if (paths.length >= MAX_MANIFESTS_PER_REPO) break;
    }
  }
  return paths;
}

// Fetch the text of every discovered manifest path for one repo in a SINGLE
// GraphQL call, each blob aliased and addressed by a `HEAD:<path>` expression
// passed as a variable (injection-safe — paths can contain spaces). Missing
// paths resolve to null (tolerated field error). Returns [{ path, text }].
async function fetchManifestTexts(nameWithOwner, paths, timeoutMs) {
  if (paths.length === 0) return [];
  const [owner, name] = nameWithOwner.split("/");
  const varDefs = paths.map((_, i) => `$p${i}: String!`).join(", ");
  const fields = paths.map((_, i) => `m${i}: object(expression: $p${i}) { ... on Blob { text } }`).join(" ");
  const query = `query($owner: String!, $name: String!, ${varDefs}) { repository(owner: $owner, name: $name) { ${fields} } }`;
  const variables = { owner, name };
  paths.forEach((p, i) => {
    variables[`p${i}`] = `HEAD:${p}`;
  });
  const data = await githubGraphQL(query, variables, timeoutMs);
  const repo = data?.repository ?? {};
  return paths.map((path, i) => ({ path, text: repo[`m${i}`]?.text }));
}

// Run `fn` over `items` with at most `limit` in flight. Workers pull from a
// shared cursor; each call is independently budget-guarded inside the GitHub
// helpers, so an exhausted budget makes the remaining calls abort fast.
async function mapWithConcurrency(items, limit, fn) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// Page one privacy scope into `into`, budget-aware, in two phases:
//   1) page the repo list (GraphQL), folding each repo's languages straight in;
//   2) for every non-empty repo, discover its manifests (recursive tree) and
//      parse their dependency names, fetched concurrently.
// Returns nothing; mutates the shared Set. Budget aborts and a malformed
// pageInfo guard break out while RETAINING what was collected; a hard error in
// phase 1 propagates so the scope caller can decide whether to tolerate it.
async function crawlScope(username, privacy, into) {
  const repos = [];
  let hasNextPage = true;
  let endCursor = null;
  let pages = 0;
  const startTime = Date.now();

  while (hasNextPage && pages < MAX_REPO_PAGES) {
    const remaining = remainingBudget(MAX_TOTAL_GITHUB_MS - (Date.now() - startTime));
    if (remaining <= 0) {
      console.warn(
        `github-skills: ${privacy} budget exhausted after ${pages} pages; tail repos excluded.`,
      );
      break;
    }
    const perCallTimeout = Math.min(GITHUB_TIMEOUT_MS, remaining);
    let data;
    try {
      data = await githubGraphQL(
        REPOS_QUERY,
        { username, after: endCursor, privacy },
        perCallTimeout,
      );
    } catch (err) {
      if (err?.name === "AbortError") {
        console.warn(
          `github-skills: ${privacy} page ${pages + 1} aborted at ${perCallTimeout}ms cap; partial results retained.`,
        );
        break;
      }
      throw err;
    }

    const repoData = data?.user?.repositories;
    if (!repoData) break;
    for (const repo of repoData.nodes ?? []) {
      const nwo = repo?.nameWithOwner;
      // Disclosure safety: a PRIVATE repo's name must never reach the public,
      // CDN-cached payload. It IS tracked here (by real name, so detections
      // across signals/aliases dedupe), but into the separate `privateRepos`
      // set that `buildSkillCategories` collapses to a bare COUNT — the popover
      // can say "N private repositories" without naming them. Public repo names
      // flow through to the per-skill `repos` list as before.
      const isPrivate = Boolean(repo?.isPrivate);
      if (repo?.primaryLanguage?.name) trackSkill(into, repo.primaryLanguage.name, nwo, isPrivate);
      for (const lang of repo?.languages?.nodes ?? []) {
        if (lang?.name) trackSkill(into, lang.name, nwo, isPrivate);
      }
      const sha = repo?.defaultBranchRef?.target?.oid;
      if (nwo && sha) repos.push({ nameWithOwner: nwo, sha, isPrivate });
    }

    hasNextPage = repoData.pageInfo.hasNextPage;
    endCursor = repoData.pageInfo.endCursor;
    pages += 1;
  }

  // Phase 2 — discover + parse manifests across the collected repos. Each
  // repo's failure is isolated (a deleted/renamed repo or a budget abort must
  // not lose the other repos' deps); budget exhaustion makes inner calls abort.
  await mapWithConcurrency(repos, REPO_CONCURRENCY, async (repo) => {
    if (remainingBudget(MAX_TOTAL_GITHUB_MS) <= 0) return;
    try {
      const paths = await findManifestPaths(repo.nameWithOwner, repo.sha, GITHUB_TIMEOUT_MS);
      if (paths.length === 0) return;
      const texts = await fetchManifestTexts(repo.nameWithOwner, paths, GITHUB_TIMEOUT_MS);
      for (const { path, text } of texts) {
        if (typeof text !== "string") continue;
        // Dispatch on the basename so a nested "Backend/package.json" uses the
        // package.json parser. `isPrivate` routes the detection into the
        // private set (count-only in the payload; the name never enters the
        // public `repos` lists — see trackSkill).
        for (const name of parseManifest(path.split("/").pop(), text))
          trackSkill(into, name, repo.nameWithOwner, repo.isPrivate);
      }
    } catch (err) {
      if (err?.name === "AbortError") return; // budget exhausted; partial retained
      console.warn(
        `github-skills: manifest fetch for ${repo.nameWithOwner} failed: ${err?.message ?? err}`,
      );
    }
  });
}

/**
 * Crawl all of the owner's repos (public + private + forked + archived; no
 * isFork/isArchived filter) across BOTH privacy scopes and return the set of
 * raw detected skill names. The GraphQL API has no "ALL" privacy, so PUBLIC
 * and PRIVATE are paged separately. PRIVATE silently yields nothing if the
 * token lacks `repo` scope — that's degraded coverage, not an error.
 *
 * Per-scope errors are isolated: a PRIVATE-scope auth failure must not discard
 * PUBLIC detections. If BOTH scopes fail to produce anything, the error
 * propagates so the GET handler can fall back — which now means an EMPTY payload
 * (`_fallback: true`), not a curated set; there is no curated floor anymore.
 */
async function crawlSkillNames(username) {
  const skillRepos = new Map();
  let lastError = null;

  for (const privacy of ["PUBLIC", "PRIVATE"]) {
    try {
      await crawlScope(username, privacy, skillRepos);
    } catch (err) {
      lastError = err;
      console.warn(`github-skills: ${privacy} scope failed: ${err?.message ?? err}`);
    }
  }

  if (skillRepos.size === 0 && lastError) throw lastError;
  return skillRepos;
}

/**
 * Build the categorised payload PURELY from the live crawl — no curated floor.
 * Only skills actually detected in the user's repos (languages + manifest
 * dependencies) are shown; anything not present there (e.g. cloud/infra/design
 * tools that live in no `package.json` or language list) won't appear by
 * design. `categorizeSkills` resolves names to icons, dedupes by slug, and
 * drops unmapped tools.
 */
async function buildSkillCategories(username) {
  const skillRepos = await crawlSkillNames(username);
  const nameToRepos = {};
  // Private repo IDENTITIES stay inside this server module graph: they're
  // passed along only so `categorizeSkillsWithRepos` can dedupe them per SLUG
  // (aliases like "next"/"nextjs" merge there — a per-name count would double-
  // count the same repo). The payload it emits carries only `privateRepoCount`.
  for (const [name, { repos, privateRepos }] of skillRepos)
    nameToRepos[name] = { repos: [...repos], privateRepos: [...privateRepos] };
  return categorizeSkillsWithRepos(nameToRepos);
}

// Per-username memoised cache wrapper. Its TTL is `REVALIDATE_SECONDS` (10 min,
// shortened from the original 24h — see the constant's definition above), not a
// fixed 24h; referencing the constant here keeps this comment from drifting if
// the value changes again. The Map avoids recreating the `unstable_cache`
// closure each request; keying by username keeps the contract forward-compatible
// and matches the github-stats route.
const cacheByUser = new Map();
function getCachedCategories(username) {
  const key = username || "default";
  let cached = cacheByUser.get(key);
  if (!cached) {
    // Key suffix bumped to v4 when each skill gained `privateRepoCount` (a
    // stale v3 entry, lacking the field, would render private-only skills as
    // non-interactive for a TTL window after deploy). v3 was the privacy fix
    // that removed PRIVATE repo names from the per-skill `repos` lists; v2 the
    // earlier bump when the payload first gained per-skill `repos`.
    cached = unstable_cache(async () => buildSkillCategories(key), ["github-skills-v4", key], {
      revalidate: REVALIDATE_SECONDS,
      tags: ["github-skills"],
    });
    cacheByUser.set(key, cached);
  }
  return cached();
}

const CACHE_HEADERS = {
  "Cache-Control": `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=300, stale-if-error=86400`,
};

/**
 * GET /api/github-skills?username={username}
 *
 * Response (stable contract):
 *   { categories: { languages, frameworks, libraries, tools, software },
 *     diff: { added: [], removed: [] },
 *     fetchedAt: ISO string }
 *
 * `diff` is intentionally empty: change detection is per-device and lives
 * client-side in `useSkillsUpdateSignal` (a localStorage baseline), the model
 * every other About card uses — a server diff would be per-instance and wiped
 * on cold starts, wrong for a "since YOUR last visit" banner. The field stays
 * in the contract for a future server-authoritative changelog if ever wanted.
 *
 * On any total crawl failure (no token, GraphQL/network error, both scopes
 * down) an EMPTY payload is returned (`categories: categorizeSkills([])`,
 * `_fallback: true`) — there is no curated floor, so the grid shows its
 * "couldn't load" state and the 10-min TTL retries on the next visit.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");

  if (username && username.toLowerCase() !== ALLOWED_USERNAME) {
    return NextResponse.json({ error: "Username not allowed" }, { status: 403 });
  }

  try {
    // Establish the request-scoped deadline once so every GraphQL call in the
    // cold-miss crawl shares one wall-clock budget. Cache hits skip the crawl
    // and never consult the store.
    const deadline = Date.now() + GITHUB_OVERALL_BUDGET_MS;
    const categories = await deadlineStore.run({ deadline }, () =>
      getCachedCategories(ALLOWED_USERNAME),
    );
    return NextResponse.json(
      { categories, diff: { added: [], removed: [] }, fetchedAt: new Date().toISOString() },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    // Total crawl failure (no token, GitHub down, both scopes errored). With no
    // curated floor there's nothing to substitute, so return empty categories —
    // the grid shows its "couldn't load" state rather than asserting a fake
    // hardcoded set. The 10-min TTL means the next visit retries.
    console.error("github-skills crawl failed, returning empty payload:", error);
    return NextResponse.json(
      {
        categories: categorizeSkills([]),
        diff: { added: [], removed: [] },
        fetchedAt: new Date().toISOString(),
        _fallback: true,
      },
      { headers: { ...CACHE_HEADERS, "X-Cache-Status": "FALLBACK" } },
    );
  }
}
