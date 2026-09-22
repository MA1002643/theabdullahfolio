import { ImageResponse } from 'next/og';
import { sectionCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/assets';
import { readNote, readNotes } from '@/lib/notes/readNotes';

// Per-note share card, one per document, rendered at build time.
//
// `generateStaticParams` is repeated here rather than inherited: Next composes
// the image route independently of `page.js`, so a card handler with no params
// of its own would render on demand instead of being prerendered.
export function generateStaticParams() {
  return readNotes().map((note) => ({ slug: note.slug }));
}

export const alt =
  'Engineering note · Muhammad Abdullah — dark ember card with the Muhammad Abdullah seal.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }) {
  const note = readNote(params.slug);

  return new ImageResponse(
    await sectionCard({
      label: 'Note',
      // The document's own title, so a shared link unfurls as the thing it is
      // rather than as a generic section card. A missing note cannot reach here
      // (`dynamicParams = false` on the page, and these params come from the
      // same source), but the fallback keeps the handler total rather than
      // throwing inside an image render.
      tagline: note?.title ?? 'Engineering decision records.',
    }),
    { ...size, fonts: await ogFonts() },
  );
}
