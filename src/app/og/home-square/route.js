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

// Lowercase key — see the note in ../home/route.js: capital-C
// 'Cache-Control' is a different object key from the 'cache-control'
// default ImageResponse sets, so it appended instead of overriding.
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
    headers: { 'cache-control': CACHE, 'x-robots-tag': ROBOTS },
  });
}
