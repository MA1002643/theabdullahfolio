import { NextResponse } from "next/server";
import crypto from "node:crypto";

// Pinned to Node so `node:crypto` (used by `safeBearerEqual`) is available —
// same constraint as /api/repo-refresh and /api/work-status.
export const runtime = "nodejs";

// The auth check below reads `request.headers`, which already opts this
// route out of static caching in Next 14, but pinning `force-dynamic`
// makes the intent explicit so a future refactor (e.g. moving auth into
// middleware) can't silently restore static eligibility.
export const dynamic = "force-dynamic";

// Every response is a side-effect receipt — a cached 200 would mask a
// skipped cron run. Helper mirrors the one in /api/repo-refresh.
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const noStoreJson = (body, init = {}) =>
  NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...(init.headers ?? {}) },
  });

// Constant-time bearer-token compare, duplicated from /api/repo-refresh.
// Kept inline (not extracted to a util) to avoid a refactor outside this
// task's scope. If a third consumer appears, that's the moment to extract.
function safeBearerEqual(headerValue, expectedSecret) {
  if (typeof headerValue !== "string" || !headerValue.startsWith("Bearer ")) {
    return false;
  }
  const provided = headerValue.slice("Bearer ".length);
  if (provided.length !== expectedSecret.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, "utf8"),
      Buffer.from(expectedSecret, "utf8"),
    );
  } catch {
    return false;
  }
}

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

  // 502 on partial failure so platform-level cron monitoring (which
  // typically alarms on non-2xx) catches a degraded run instead of seeing
  // a green 200 with a half-failed body.
  const allOk = results.workStatus?.ok && results.repoRefresh?.ok;
  return noStoreJson(
    { ok: allOk, results },
    { status: allOk ? 200 : 502 },
  );
}
