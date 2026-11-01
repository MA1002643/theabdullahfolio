import { ImageResponse } from 'next/og';
import { sectionCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/assets';

// Static section card, rendered once at build time (issue #88 v2 pattern).
export const alt =
  'Journey · Muhammad Abdullah — dark ember card with the Muhammad Abdullah seal.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    await sectionCard({
      label: 'Journey',
      tagline: 'From first line to production — the whole road, one timeline.',
    }),
    { ...size, fonts: await ogFonts() },
  );
}
