import { ImageResponse } from 'next/og';
import { homeCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/assets';
import { fetchLiveSignals } from '@/lib/og/live';

// The homepage share card (issue #88 v2, tier 1) — 1200x630, rendered on
// demand with the portfolio's live signals typeset into the strip, so the
// unfurl a recruiter sees reflects what is being built THIS week.
//
// Declared via metadata.openGraph.images in the root layout rather than
// the opengraph-image file convention: file-convention images override
// the config images array, and the config array is what lets the square
// companion card (/og/home-square) ride along for WhatsApp.
//
// force-dynamic keeps the build from baking a fallback render into a
// static route; freshness is instead CDN-owned via s-maxage — crawlers
// hit the edge cache, the lambda renders at most ~hourly per region.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lowercase key, deliberately (issue #90). ImageResponse builds its
// headers as `{ 'content-type': …, 'cache-control': <1-year immutable>,
// ...options.headers }` — a capital-C 'Cache-Control' is a DIFFERENT
// object key, so it never replaced the default; the Headers constructor
// appended both and clients were served the immutable year alongside
// this. Matching Next's casing is what makes the override take.
const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';
// Fetchable, but not listable. `/og/` used to sit in `DISALLOWED_PATHS`, which
// told the very unfurlers this card is FOR — they read robots.txt before
// fetching — not to fetch the image the root layout had just advertised in
// `openGraph.images`. The intent behind that rule (a share card is not a useful
// image-search entrance) is a noindex concern rather than a disallow one:
// disallow prevents the fetch, noindex prevents the listing. This is the half
// that was actually wanted. Lowercase key for the same reason as `CACHE` above.
const ROBOTS = 'noindex';

export async function GET() {
  // fetchLiveSignals is internally fail-soft; the belt-and-braces catch
  // guarantees a card even if the module itself misbehaves — an unfurler
  // gets one shot, so this route must never 500.
  let liveStrip = { segments: [], live: false };
  try {
    liveStrip = await fetchLiveSignals();
  } catch {
    // Render the pure identity composition.
  }

  return new ImageResponse(await homeCard({ ...liveStrip }), {
    width: 1200,
    height: 630,
    fonts: await ogFonts(),
    headers: { 'cache-control': CACHE, 'x-robots-tag': ROBOTS },
  });
}
