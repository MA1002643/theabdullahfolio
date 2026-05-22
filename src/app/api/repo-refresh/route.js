import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

// Daily cron hit by Vercel at the schedule in vercel.json. Job: invalidate the
// `github-stats` + `most-active-repo` cache tags and warm the cache by hitting
// /api/github-stats once, so the first real user request after midnight is
// instant. Authenticated via CRON_SECRET in the Authorization header.
export async function GET(request) {
  // Read the secret once and guard explicitly. Without this, an unset
  // CRON_SECRET would let `Bearer undefined` pass as a valid credential —
  // any caller sending that literal header would bypass auth. Surface the
  // misconfiguration as a 500 so the cron logs it loudly instead of
  // silently returning 401 (which looks like a normal auth failure).
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("repo-refresh: CRON_SECRET is not set; refusing all requests");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const username = process.env.NEXT_PUBLIC_GITHUB_USERNAME || "MA1002643";
  // Server-only base URL — intentionally named `BASE_URL` (not the
  // `NEXT_PUBLIC_*` prefix) so Next.js doesn't inline the value into client
  // bundles. `https://${VERCEL_URL}` is always truthy even when VERCEL_URL
  // is undefined (template literal evaluates to "https://undefined"), so the
  // VERCEL_URL branch needs an explicit existence check before the localhost
  // fallback can ever be reached.
  const baseUrl =
    process.env.BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  try {
    // Drop the cached payloads first so the next fetch goes straight to GitHub
    // and the freshly-scored most-active repo lands in the warm cache.
    revalidateTag("github-stats");
    revalidateTag("most-active-repo");

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
    const res = await fetch(
      `${baseUrl}/api/github-stats?username=${encodeURIComponent(username)}&_=${cacheBust}`,
      {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      }
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
      return NextResponse.json(
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
      return NextResponse.json(
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

    return NextResponse.json({
      ok: true,
      repo: data?.stats?.repo?.name ?? null,
      activityScore: data?.stats?.repo?.activityScore ?? null,
    });
  } catch (err) {
    console.error("repo-refresh cron error:", err);
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}
