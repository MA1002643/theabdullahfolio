import { revalidateTag } from "next/cache";

import { raceAbort } from "../_utils/abort";
import { noStoreJson, safeBearerEqual } from "../_utils/cronAuth";
import { envPositiveMs } from "../_utils/env";

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
//
// ── The budget has to survive the headers ───────────────────────────────────
// It used to end there. `clearTimeout` sat in a `finally` around the fetch, and
// `fetch` settles the moment the response HEADERS arrive — so the timer was
// disarmed while the body was still streaming, and the `await res.json()` at
// the call site ran with no deadline AT ALL. Not a runtime-dependent one, as in
// the two sibling routes that raced their reads: here the abort had been
// explicitly cancelled, so nothing could ever fire.
//
// A downstream answering 200 and then stalling its body therefore held this
// route open until the platform killed it, and the `aborted` flag this route
// reports — the one distinction that tells an operator "tighten the budget"
// from "fix the downstream" — could never be set for the failure most likely to
// need it.
//
// So the reader is returned WITH the response and the timer outlives the
// headers: the budget now covers the whole exchange, and `raceAbort` makes it
// hold whether or not the runtime propagates the abort into the body stream.
// `release` is for callers that never read a body (the experience-summary warm
// reads only `ok`/`status`) — without it the timer would sit armed for the full
// budget after the work was done.
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
  };
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const bounded = (read) =>
      raceAbort(read, controller.signal).finally(release);
    return {
      res,
      readText: () => bounded(res.text()),
      readJson: () => bounded(res.json()),
      release,
    };
  } catch (err) {
    release();
    throw err;
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

    // Warm /api/github-stats. Wrapped in its own try/catch so a timeout
    // (AbortError from fetchWithTimeout) or other thrown error doesn't
    // skip the experience-summary warm below and collapse the run into a
    // generic 500. The structured `githubStats` shape lets the response
    // and the HTTP status reflect which side actually failed.
    let githubStats = { ok: false, attempted: true };
    let data = null;
    try {
      const { res, readText, readJson } = await fetchWithTimeout(
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
          // Through the bounded reader, so a downstream that fails AND stalls
          // its error body cannot hold the cron open. A breach here is
          // swallowed on purpose, exactly as an unreadable body always was:
          // the status is already known and reported, and `detail` is context.
          detail = await readText();
        } catch {
          // ignore — body unreadable, or the budget ran out reading it
        }
        console.error(
          `repo-refresh: /api/github-stats returned ${res.status} ${res.statusText}`,
          detail,
        );
        githubStats = {
          ok: false,
          attempted: true,
          status: res.status,
          statusText: res.statusText,
          detail,
        };
      } else {
        // Bounded too, and this is the read that matters most: a 200 whose body
        // never finishes is the stall that looked like success. An abort here
        // rejects with the controller's reason and lands in the catch below,
        // which reports it with `aborted: true` — the timeout contract this
        // route advertises, now actually covering the whole exchange.
        data = await readJson();
        if (data?._fallback) {
          // `_fallback: true` means /api/github-stats served the bundled
          // snapshot because the upstream GitHub fetch failed. The cache
          // wasn't actually refreshed — flag it so the cron run shows up
          // as a partial / degraded success in logs rather than silently
          // masking the upstream outage.
          console.warn(
            "repo-refresh: warm fetch returned bundled fallback (upstream GitHub failure)",
          );
          githubStats = {
            ok: false,
            attempted: true,
            degraded: true,
            reason: "upstream-fallback",
          };
        } else {
          githubStats = { ok: true, attempted: true };
        }
      }
    } catch (err) {
      console.warn(
        "repo-refresh: github-stats warm failed:",
        err?.message ?? err,
      );
      // Fixed message, not `err.message`. A failed warm fetch rejects with
      // transport internals — the resolved internal host and port behind
      // `baseUrl`, DNS state, a TLS error — and this body is returned verbatim
      // to /api/daily-warmup, which puts it in the `detail` field of the payload
      // it answers with. Sanitising only the orchestrator while this one still
      // carried the raw string would move the leak, not close it. `aborted`
      // already carries the distinction that changes what an operator does.
      githubStats = {
        ok: false,
        attempted: true,
        error: "github-stats warm failed",
        aborted: err?.name === "AbortError",
      };
    }

    // Best-effort warm of /api/experience-summary. Always attempted so a
    // github-stats failure above doesn't skip rolling this side too —
    // the cache was already invalidated and we'd rather refill it now
    // than wait for the first morning visitor. Uses `fetchWithTimeout`
    // for parity with the github-stats warm so a stalled response can't
    // hold the cron open past `CRON_WARM_TIMEOUT_MS`. Reuses the same
    // `cacheBust` so a single timestamp tags both warm fetches in logs.
    let experience = { ok: false, attempted: true };
    try {
      const { res: expRes, release } = await fetchWithTimeout(
        `${baseUrl}/api/experience-summary?username=${encodeURIComponent(username)}&_=${cacheBust}`,
        {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        },
        CRON_WARM_TIMEOUT_MS,
      );
      // This warm reads no body — only `ok`/`status` — so nothing will consume
      // the reader that would otherwise disarm the timer. Released explicitly,
      // or it would sit armed for the rest of the budget after the work is done.
      release();
      experience = { ok: expRes.ok, attempted: true, status: expRes.status };
      if (!expRes.ok) {
        console.warn(
          `repo-refresh: /api/experience-summary returned ${expRes.status} ${expRes.statusText}`,
        );
      }
    } catch (err) {
      console.warn(
        "repo-refresh: experience-summary warm failed:",
        err?.message ?? err,
      );
      // Same reasoning as the github-stats warm above: a fixed message, with
      // `aborted` carrying the only distinction the response needs to make.
      experience = {
        ok: false,
        attempted: true,
        error: "experience-summary warm failed",
        aborted: err?.name === "AbortError",
      };
    }

    // HTTP status mirrors the previous semantics: a github-stats hard
    // failure stays non-2xx so Vercel Cron's retry/alerting still fires,
    // and `_fallback` keeps its 503 distinction. An experience-summary
    // failure alone remains best-effort and returns 200 — consumers
    // should read `experience.ok` for that signal.
    //
    // "Consumers should read it" was doing more work than it could bear while
    // the only consumer did not. `/api/daily-warmup` is now this route's sole
    // caller (it owns the single cron entry), and it judged each step by HTTP
    // status alone — so a failed experience warm produced an all-green cron
    // verdict, which is the one thing that route exists to prevent. It now
    // reads the `ok` below as well as the status, which is why this best-effort
    // 200 can stay best-effort: the field is load-bearing, not advisory. Keep
    // `ok` truthful if a third warm is ever added here.
    let status = 200;
    if (!githubStats.ok) {
      status = githubStats.reason === "upstream-fallback" ? 503 : 502;
    }

    return noStoreJson(
      {
        ok: githubStats.ok && experience.ok,
        repo: data?.stats?.repo?.name ?? null,
        activityScore: data?.stats?.repo?.activityScore ?? null,
        githubStats,
        experience,
      },
      { status },
    );
  } catch (err) {
    console.error("repo-refresh cron error:", err);
    return noStoreJson({ error: "Refresh failed" }, { status: 500 });
  }
}
