import { ImageResponse } from 'next/og';
import { sectionCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/assets';

// Static section card, rendered once at build time (issue #88 v2 pattern).
//
// A policy page with a share card at all is unusual, and it is here because the
// drift test requires every registry route to publish one — a URL that unfurls
// as bare text in a message reads as broken, whatever the URL is. The tagline
// states the page's one distinguishing claim rather than the word "Privacy"
// twice.
export const alt =
  'Privacy · Muhammad Abdullah — dark ember card with the Muhammad Abdullah seal.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    await sectionCard({
      label: 'Privacy',
      tagline:
        'Every cookie, storage key and third party, named — audited from the source, not templated.',
    }),
    { ...size, fonts: await ogFonts() },
  );
}
