import { ImageResponse } from 'next/og';
import { sectionCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/assets';

// Static section card, rendered once at build time — same composition as the
// other sub-page cards (issue #88 v2).
export const alt =
  'Guestbook · Muhammad Abdullah — dark ember card with the Muhammad Abdullah seal.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    await sectionCard({
      label: 'Guestbook',
      tagline: 'Leave your mark — a neon wall of messages signed via GitHub.',
    }),
    { ...size, fonts: await ogFonts() },
  );
}
