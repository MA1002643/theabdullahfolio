import { ImageResponse } from 'next/og';
import { sectionCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/assets';

// Static section card, rendered once at build time (issue #88 v2).
export const alt =
  'Projects · Muhammad Abdullah — dark ember card with the Muhammad Abdullah seal.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    await sectionCard({
      label: 'Projects',
      tagline: 'Eleven builds tracked live from their own GitHub boards — web, systems, and apps.',
    }),
    { ...size, fonts: await ogFonts() },
  );
}
