import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

// Daily cron hit by Vercel at the schedule in vercel.json. Job: invalidate the
// `github-stats` + `most-active-repo` cache tags and warm the cache by hitting
// /api/github-stats once, so the first real user request after midnight is
// instant. Authenticated via CRON_SECRET in the Authorization header.
export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const username = process.env.NEXT_PUBLIC_GITHUB_USERNAME || "MA1002643";
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    `https://${process.env.VERCEL_URL}` ||
    "http://localhost:3000";

  try {
    // Drop the cached payloads first so the next fetch goes straight to GitHub
    // and the freshly-scored most-active repo lands in the warm cache.
    revalidateTag("github-stats");
    revalidateTag("most-active-repo");

    const res = await fetch(
      `${baseUrl}/api/github-stats?username=${encodeURIComponent(username)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
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
