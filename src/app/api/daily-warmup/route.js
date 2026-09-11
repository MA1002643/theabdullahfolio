import { noStoreJson, safeBearerEqual } from "../_utils/cronAuth";

// Pinned to Node so `node:crypto` (transitively used by `safeBearerEqual`)
// is available — same constraint as /api/repo-refresh and /api/work-status.
export const runtime = "nodejs";

// The auth check below reads `request.headers`, which already opts this
// route out of static caching in Next 14, but pinning `force-dynamic`
// makes the intent explicit so a future refactor (e.g. moving auth into
// middleware) can't silently restore static eligibility.
export const dynamic = "force-dynamic";

// Hit a downstream cron endpoint with the bearer token the upstream Vercel
// Cron caller gave us. Each downstream already handles its own cache-
// busting internally (work-status uses ?bust=1 as a handler signal,
// repo-refresh appends a timestamp to its warm fetch), so this layer just
// forwards auth and reports the outcome. Returns `{ ok, status, detail }`
// so the orchestrator can include per-step results in the response.
async function callInternal(baseUrl, path, cronSecret) {
  const res = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Cache-Control": "no-cache",
    },
  });
  let detail = null;
  try {
    detail = await res.text();
  } catch {
    // body unreadable — leave detail null
  }
  return { ok: res.ok, status: res.status, detail };
}

// Did a downstream answer "I am not configured yet" rather than "I failed"?
//
// `/api/seo-report` is the only step that can say this, and it says it exactly
// one way: HTTP 503 with a `skipped` reason in the body. That is its contract
// with this route — 503 + `skipped` means an integration has not been set up,
// every other non-2xx means something broke.
//
// Fails CLOSED, deliberately. An unreadable body, a 503 with no reason, a 502,
// a 401, a thrown fetch — all read as NOT-skipped and therefore count against
// the run. Treating an ambiguous answer as "skipped" would rebuild the exact
// blind spot this function exists to close.
function isNotConfigured(result) {
  if (result?.status !== 503) return false;
  try {
    return typeof JSON.parse(result.detail)?.skipped === "string";
  } catch {
    // Not JSON, or no body at all. That is not a configuration message.
    return false;
  }
}

// Consolidated daily cron — replaces the prior `/api/work-status?bust=1`
// cron entry in vercel.json, now wrapping both the work-status bust and
// the new repo-refresh warm-up under a single schedule. Consolidation is
// driven by Hobby's per-day cron-count cap: a second standalone cron for
// repo-refresh would silently never run on Hobby. Runs the two steps in
// independent try/catches so a failure in one doesn't skip the other.
// Sequential ordering keeps logs and failure modes readable; daily
// cadence makes parallelism moot.
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(
      "daily-warmup: CRON_SECRET is not set; refusing all requests",
    );
    return noStoreJson({ error: "Server misconfigured" }, { status: 500 });
  }

  if (!safeBearerEqual(request.headers.get("authorization"), cronSecret)) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }

  // Same base-URL resolution pattern as /api/repo-refresh: server-only
  // `BASE_URL` overrides the auto-injected VERCEL_URL; trailing-slash
  // normalization prevents `//api/...` paths that some CDNs reject.
  const baseUrl = (
    process.env.BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  ).replace(/\/+$/, "");

  const results = {};
  try {
    results.workStatus = await callInternal(
      baseUrl,
      "/api/work-status?bust=1",
      cronSecret,
    );
  } catch (err) {
    console.error("daily-warmup: work-status bust failed:", err);
    results.workStatus = { ok: false, error: err?.message ?? String(err) };
  }
  try {
    results.repoRefresh = await callInternal(
      baseUrl,
      "/api/repo-refresh",
      cronSecret,
    );
  } catch (err) {
    console.error("daily-warmup: repo-refresh failed:", err);
    results.repoRefresh = { ok: false, error: err?.message ?? String(err) };
  }
  // Third step: the Search Console snapshot (issue #32, W6). It belongs HERE
  // rather than in its own `vercel.json` cron entry for exactly the reason this
  // route exists — Hobby caps cron count, so a second standalone entry would
  // silently never run (risk §10.7).
  try {
    results.seoReport = await callInternal(
      baseUrl,
      "/api/seo-report",
      cronSecret,
    );
  } catch (err) {
    console.error("daily-warmup: seo-report failed:", err);
    results.seoReport = { ok: false, error: err?.message ?? String(err) };
  }

  // 502 on partial failure so platform-level cron monitoring (which
  // typically alarms on non-2xx) catches a degraded run instead of seeing
  // a green 200 with a half-failed body.
  //
  // seo-report counts toward that verdict too, but ONLY once it is configured.
  //
  // It was previously excluded outright, for a reason that was right at the
  // time and stopped being right: it answers 503 while `GSC_SERVICE_ACCOUNT_KEY`
  // is unset, which is the correct state until Search Console verification is
  // done by hand, and alarming nightly about an unconfigured step trains
  // whoever reads the alerts to ignore them. But an UNCONDITIONAL exclusion
  // keeps paying that cost forever: with the credential in place, an expired
  // key, revoked property access, a Search Console outage or an Upstash failure
  // all answer 502 — and the run still returned a green 200 that no cron
  // monitor would ever flag. The report is only worth having if someone finds
  // out when it stops arriving.
  //
  // So the step is optional exactly while the integration is absent, and
  // load-bearing the moment it is not. `isNotConfigured` is what draws that
  // line, and it errs toward counting.
  const seoNotConfigured = isNotConfigured(results.seoReport);
  if (seoNotConfigured) {
    // Said in the body rather than left implicit, so a run that is green
    // BECAUSE a step opted out is distinguishable from one that is green
    // because every step worked.
    results.seoReport.notConfigured = true;
  }

  const allOk = Boolean(
    results.workStatus?.ok &&
      results.repoRefresh?.ok &&
      (results.seoReport?.ok || seoNotConfigured),
  );
  return noStoreJson({ ok: allOk, results }, { status: allOk ? 200 : 502 });
}
