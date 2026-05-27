import { revalidateTag } from "next/cache";

import { noStoreJson, safeBearerEqual } from "../_utils/cronAuth";

// Pin to the Node runtime so `node:crypto` (transitively used by
// `safeBearerEqual` for constant-time bearer-token compare) stays
// available. Matches the convention used by every other crypto-touching
// route in this repo (/api/github-webhook, /api/work-status). Without
// this an inadvertent move to the Edge runtime would silently break the
// auth check — crypto.timingSafeEqual isn't available in Edge.
export const runtime = "nodejs";

// Belt-and-suspenders: the bearer-token check below already reads
// `request.headers`, which is a dynamic API and makes this route ineligible
// for static caching in Next 14. Pinning `force-dynamic` makes that intent
// explicit so a future refactor (e.g. moving auth into middleware) can't
// silently restore static eligibility and start serving a stale 200 from the
// build cache instead of actually running the revalidate + warm-up.
export const dynamic = "force-dynamic";

// Same env-validation pattern as `/api/experience-summary`: accept only
// finite positive numbers, fall back otherwise. Plain `Number(env) ||
// fallback` would let a negative env force immediate abort, or
// `Infinity` disable the timeout entirely.
function envPositiveMs(envValue, fallback) {
  const n = Number(envValue);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Per-warm-fetch ceiling. Downstream `/api/github-stats` and
// `/api/experience-summary` each enforce a ~9 s internal wall-clock
// budget, so 15 s gives them room to complete cleanly while still
// aborting well before Vercel's platform-level function timeout (60 s
// on Pro) would terminate the whole cron run. Without this ceiling, a
// stalled upstream could hold the cron open until that platform limit
// and fail the run with no useful signal in the logs. Tunable per
// plan via `CRON_WARM_TIMEOUT_MS`.
const CRON_WARM_TIMEOUT_MS = envPositiveMs(
  process.env.CRON_WARM_TIMEOUT_MS,
  15000,
);

// Wrap `fetch` with an AbortController + setTimeout so the warm calls
// can't outlive their budget. On timeout the controller aborts and
// the fetch rejects with an AbortError that the outer try/catch (for
// github-stats) or the inner try/catch (for experience-summary) will
// log and surface as a degraded cron result instead of a silent stall.
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Called by `/api/daily-warmup` (the scheduled cron entrypoint in
// vercel.json, which orchestrates this route + the work-status bust) or
// invoked manually with the bearer token to force a refresh outside the
// daily schedule. Job: invalidate the `github-stats`,
// `most-active-repo`, and `experience-summary` cache tags and warm
// /api/github-stats + /api/experience-summary so the first morning
// visitor lands on hot data. Authenticated via CRON_SECRET in the
// Authorization header — Vercel Cron forwards it on the scheduled
// call, and `/api/daily-warmup` forwards the same header on the
// orchestrated call. The experience-summary cache is on a 10-min TTL
// already, but the daily revalidation ensures the cache rolls even
// during low-traffic days where no client poll happens.
export async function GET(request) {
  // Read the secret once and guard explicitly. Without this, an unset
  // CRON_SECRET would let `Bearer undefined` pass as a valid credential —
  // any caller sending that literal header would bypass auth. Surface the
  // misconfiguration as a 500 so the cron logs it loudly instead of
  // silently returning 401 (which looks like a normal auth failure).
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("repo-refresh: CRON_SECRET is not set; refusing all requests");
    return noStoreJson({ error: "Server misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (!safeBearerEqual(authHeader, cronSecret)) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }

  const username = process.env.NEXT_PUBLIC_GITHUB_USERNAME || "MA1002643";
  // Server-only base URL — intentionally named `BASE_URL` (not the
  // `NEXT_PUBLIC_*` prefix) so Next.js doesn't inline the value into client
  // bundles. `https://${VERCEL_URL}` is always truthy even when VERCEL_URL
  // is undefined (template literal evaluates to "https://undefined"), so the
  // VERCEL_URL branch needs an explicit existence check before the localhost
  // fallback can ever be reached.
  // Trim any trailing slash so the warm-up URL ("${baseUrl}/api/...") never
  // ends up double-slashed when the operator sets BASE_URL to a value like
  // "https://ma.codes/" — most CDNs treat `//api/...` differently from
  // `/api/...` (some 301-redirect, some 404), either of which silently
  // breaks the warm-up. `VERCEL_URL` and the localhost fallback never have
  // a trailing slash, but normalizing once at the source makes the rule
  // hold regardless of which branch produced the value.
  const baseUrl = (
    process.env.BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  ).replace(/\/+$/, "");

  try {
    // Drop the cached payloads first so the next fetch goes straight to GitHub
    // and the freshly-scored most-active repo lands in the warm cache.
    revalidateTag("github-stats");
    revalidateTag("most-active-repo");
    // experience-summary is also tag-cached; included here so the daily
    // cron rolls all three caches in lockstep. The endpoint already has
    // a 10-min TTL for normal client-driven refresh, but the daily
    // revalidation guarantees turnover even on low-traffic days.
    revalidateTag("experience-summary");

    // Bypass two distinct cache layers when warming:
    //   1. `cache: "no-store"` + `Cache-Control: no-cache` request header
    //      defeats the Vercel/edge CDN that would otherwise serve the response
    //      built off `Cache-Control: s-maxage=600` set by /api/github-stats.
    //   2. A timestamp query param produces a unique URL per cron run, so
    //      even if a CDN ignores the header it cannot match a prior cache key.
    // Without both, `revalidateTag` invalidates the inner unstable_cache but
    // the warm-up fetch is served straight from the CDN, the route handler
    // never runs, and the inner cache is never recomputed.
    const cacheBust = Date.now();
    const res = await fetchWithTimeout(
      `${baseUrl}/api/github-stats?username=${encodeURIComponent(username)}&_=${cacheBust}`,
      {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      },
      CRON_WARM_TIMEOUT_MS,
    );

    if (!res.ok) {
      // Surface the underlying failure rather than reporting a hollow success.
      // Try to grab the response body for context, but don't let a parse
      // failure mask the original HTTP error.
      let detail = null;
      try {
        detail = await res.text();
      } catch {
        // ignore — body unreadable
      }
      console.error(
        `repo-refresh: /api/github-stats returned ${res.status} ${res.statusText}`,
        detail
      );
      return noStoreJson(
        {
          error: "Cache warm failed",
          upstreamStatus: res.status,
          upstreamStatusText: res.statusText,
          detail,
        },
        { status: 502 }
      );
    }

    const data = await res.json();

    // `_fallback: true` means /api/github-stats served the bundled snapshot
    // because the upstream GitHub fetch failed. The cache wasn't actually
    // refreshed — flag it so the cron run shows up as a partial / degraded
    // success in logs rather than silently masking the upstream outage.
    if (data?._fallback) {
      console.warn(
        "repo-refresh: warm fetch returned bundled fallback (upstream GitHub failure)"
      );
      return noStoreJson(
        {
          ok: false,
          degraded: true,
          reason: "upstream-fallback",
          repo: data?.stats?.repo?.name ?? null,
          activityScore: data?.stats?.repo?.activityScore ?? null,
        },
        { status: 503 }
      );
    }

    // Best-effort warm of /api/experience-summary. Isolated try/catch
    // so a failure here doesn't downgrade the github-stats success
    // signal — the experience-summary cache was already invalidated
    // above and will rebuild on the next client poll if this warm
    // fails. Reuses the same `cacheBust` so a single timestamp tags
    // both warm fetches in logs.
    let experience = { ok: false, attempted: false };
    try {
      const expRes = await fetch(
        `${baseUrl}/api/experience-summary?username=${encodeURIComponent(username)}&_=${cacheBust}`,
        {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        }
      );
      experience = { ok: expRes.ok, attempted: true, status: expRes.status };
      if (!expRes.ok) {
        console.warn(
          `repo-refresh: /api/experience-summary returned ${expRes.status} ${expRes.statusText}`
        );
      }
    } catch (err) {
      console.warn(
        "repo-refresh: experience-summary warm failed:",
        err?.message ?? err
      );
      experience = { ok: false, attempted: true, error: err?.message ?? String(err) };
    }

    return noStoreJson({
      ok: true,
      repo: data?.stats?.repo?.name ?? null,
      activityScore: data?.stats?.repo?.activityScore ?? null,
      experience,
    });
  } catch (err) {
    console.error("repo-refresh cron error:", err);
    return noStoreJson({ error: "Refresh failed" }, { status: 500 });
  }
}
