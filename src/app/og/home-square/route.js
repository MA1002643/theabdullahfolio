import { ImageResponse } from 'next/og';
import { homeCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/assets';
import { fetchLiveSignals } from '@/lib/og/live';

// Square (1200x1200) companion to /og/home, listed SECOND in
// metadata.openGraph.images: consumers that take the first image
// (Facebook, LinkedIn, Slack) never see it, while WhatsApp — which
// crops toward square — picks the ratio that doesn't guillotine the
// composition. Same live strip, stacked-name layout.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

export async function GET() {
  let liveStrip = { segments: [], live: false };
  try {
    liveStrip = await fetchLiveSignals();
  } catch {
    // Render the pure identity composition.
  }

  return new ImageResponse(await homeCard({ ...liveStrip, square: true }), {
    width: 1200,
    height: 1200,
    fonts: await ogFonts(),
    headers: { 'Cache-Control': CACHE },
  });
}
