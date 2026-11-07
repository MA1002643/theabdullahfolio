import { ImageResponse } from 'next/og';
import { sectionCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/assets';
import { readNote, readNotes } from '@/lib/notes/readNotes';
import { localeParams } from '@/i18n/staticParams';

// Per-note share card, one per document, rendered at build time.
//
// `generateStaticParams` is repeated here rather than inherited: Next composes
// the image route independently of `page.js`, so a card handler with no params
// of its own would render on demand instead of being prerendered.
// It names the locale as well, for the same reason: the `[locale]` layout's
// list does not reach this handler, and slugs alone prerendered no card at all.
export function generateStaticParams() {
  return localeParams().flatMap(({ locale }) =>
    readNotes().map((note) => ({ locale, slug: note.slug })),
  );
}

// And `dynamicParams` has to be restated for the same reason. On its own
// `generateStaticParams` only means "prerender at least these" — an unknown
// slug still falls through to an on-demand render, which would serve the
// generic fallback card below under any URL and leave these cards merely
// mostly-static. `false` closes the set to the notes corpus, exactly as the
// project poster does (`projects/[id]/opengraph-image.js`).
export const dynamicParams = false;

export const alt =
  'Engineering note · Muhammad Abdullah — dark ember card with the Muhammad Abdullah seal.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }) {
  const { slug } = await params;
  const note = readNote(slug);

  return new ImageResponse(
    await sectionCard({
      label: 'Note',
      // The document's own title, so a shared link unfurls as the thing it is
      // rather than as a generic section card. A missing note cannot reach here
      // (`dynamicParams = false` above, and these params come from the same
      // source as the page's), but the fallback keeps the handler total rather
      // than throwing inside an image render.
      tagline: note?.title ?? 'Engineering decision records.',
    }),
    { ...size, fonts: await ogFonts() },
  );
}
