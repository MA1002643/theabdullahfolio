// Live signals for the homepage share card (issue #88 v2, tier 1).
//
// The card's stats strip is assembled from the site's own public read
// endpoints — the same ones the maintenance header, About stats and
// footer already poll — over HTTP rather than by importing the route
// monoliths. Every fetch is individually fail-soft: a crawler gets ONE
// shot at unfurling a link, so this module must never throw and never
// stall. Whatever resolves inside the timeout becomes a segment;
// whatever doesn't is simply absent, and the card degrades toward the
// pure identity composition.

const USERNAME = process.env.NEXT_PUBLIC_GITHUB_USERNAME || 'MA1002643';

function baseUrl() {
  // Same server-only base-URL resolution as /api/repo-refresh and
  // /api/daily-warmup: `BASE_URL` (deliberately not NEXT_PUBLIC_) lets an
  // operator pin the target — e.g. point preview-deploy cards at the
  // production APIs — and otherwise the deployment's own auto-injected
  // VERCEL_URL serves; the explicit existence check matters because
  // `https://${VERCEL_URL}` is truthy even when the var is absent.
  // Trailing-slash normalization prevents `//api/...` paths that some
  // CDNs reject.
  return (
    process.env.BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3000}`)
  ).replace(/\/+$/, '');
}

async function getJson(pathname) {
  const res = await fetch(`${baseUrl()}${pathname}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`${pathname} responded ${res.status}`);
  return res.json();
}

/**
 * Resolve up to three short uppercase strip segments, priority-ordered:
 * current work focus, contribution total, location town, current streak.
 * Returns { segments: string[], live: boolean } — `live` marks that the
 * work segment is present, which is what earns the ember dot.
 */
export async function fetchLiveSignals() {
  const [work, stats, location] = await Promise.allSettled([
    getJson('/api/work-status'),
    getJson(`/api/github-stats?username=${encodeURIComponent(USERNAME)}`),
    getJson('/api/location'),
  ]);

  const segments = [];
  let live = false;

  if (work.status === 'fulfilled') {
    const state = work.value?.state;
    const item = work.value?.meta?.topItems?.[0];
    if (item?.repo && state !== 'idle') {
      const verb = state === 'shipping' ? 'SHIPPING' : 'BUILDING';
      segments.push(`${verb} ${String(item.repo).toUpperCase()}`);
      live = true;
    }
  }

  if (stats.status === 'fulfilled') {
    const contributions = stats.value?.stats?.stats?.totalContributions;
    if (Number.isFinite(contributions) && contributions > 0) {
      segments.push(
        `${contributions.toLocaleString('en-GB')} CONTRIBUTIONS THIS YEAR`,
      );
    }
  }

  if (location.status === 'fulfilled') {
    const town = location.value?.town;
    if (typeof town === 'string' && town.trim()) {
      segments.push(town.trim().toUpperCase());
    }
  }

  // Backfill: a streak only earns strip space when something above failed.
  if (segments.length < 3 && stats.status === 'fulfilled') {
    const streak = stats.value?.stats?.streaks?.currentStreak?.value;
    if (Number.isFinite(streak) && streak >= 3) {
      segments.push(`${streak}-DAY STREAK`);
    }
  }

  return { segments: segments.slice(0, 3), live };
}
