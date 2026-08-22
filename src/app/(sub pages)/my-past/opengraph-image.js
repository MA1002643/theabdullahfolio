import { ImageResponse } from 'next/og';
import { myPastCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/assets';

// Static archive card, rendered once at build time — the dedicated
// /my-past composition (issue #88 rework): the seal, MY PAST, and the
// era's raw materials (HTML · CSS · JAVASCRIPT) as quiet tokens.
export const alt =
  'My Past · Muhammad Abdullah — the university-era portfolio, dark ember card with the Muhammad Abdullah seal.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(await myPastCard(), {
    ...size,
    fonts: await ogFonts(),
  });
}
