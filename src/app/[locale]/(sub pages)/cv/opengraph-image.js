import { ImageResponse } from 'next/og';
import { sectionCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/assets';

// Static section card, rendered once at build time (issue #88 v2 pattern).
//
// The tagline names the ROLE rather than describing the page, and that is
// deliberate for this route specifically: a CV link is the one URL on this site
// most likely to be pasted into a message where the recipient decides whether
// to open it from the unfurl alone. "Software Engineer · Bolton" answers the
// question they actually have; "the full record" does not.
export const alt =
  'CV · Muhammad Abdullah — dark ember card with the Muhammad Abdullah seal.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    await sectionCard({
      label: 'CV',
      tagline:
        'Software Engineer · Bolton — every role, qualification and shipped project.',
    }),
    { ...size, fonts: await ogFonts() },
  );
}
