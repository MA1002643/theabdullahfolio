import { ImageResponse } from 'next/og';
import { localeParams } from '@/i18n/staticParams';
import { myPastCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/assets';

// Static archive card, rendered once at build time — the dedicated
// /my-past composition (issue #88 rework): the seal, MY PAST, and the
// era's raw materials (HTML · CSS · JAVASCRIPT) as quiet tokens.
export const alt =
  'My Past · Muhammad Abdullah — the university-era portfolio, dark ember card with the Muhammad Abdullah seal.';
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
  return new ImageResponse(await myPastCard(), {
    ...size,
    fonts: await ogFonts(),
  });
}
