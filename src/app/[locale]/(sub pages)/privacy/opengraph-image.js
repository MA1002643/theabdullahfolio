import { ImageResponse } from 'next/og';
import { localeParams } from '@/i18n/staticParams';
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

// Prerendered once per locale (issue #82). A metadata image route is its own
// handler and does not inherit the `[locale]` layout's params, so without this
// it rendered on demand — one Satori render per request. The card itself is
// the English brand card in every locale (the OG renderer cannot shape Arabic
// or lay out bidi text), so twenty identical files is the price of static.
export function generateStaticParams() {
  return localeParams();
}
export const dynamicParams = false;

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
