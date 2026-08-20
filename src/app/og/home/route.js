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

const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

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
    headers: { 'Cache-Control': CACHE },
  });
}
