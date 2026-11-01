import { ImageResponse } from 'next/og';
import { sectionCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/assets';

// Static section card, rendered once at build time (issue #88 v2).
export const alt =
  'Contact · Muhammad Abdullah — dark ember card with the Muhammad Abdullah seal.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    await sectionCard({
      label: 'Contact',
      tagline: 'Start a conversation — a form that refines your message and never loses a draft.',
    }),
    { ...size, fonts: await ogFonts() },
  );
}
