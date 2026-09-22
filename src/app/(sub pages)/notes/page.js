import Image from 'next/image';

import bg from '../../../../public/background/contact-bg.png';
import AuroraDustMount from '@/components/AuroraDustMount';
import NotesIndex from '@/components/notes';
import PageTitle from '@/components/PageTitle';
import JsonLd from '@/components/seo/JsonLd';
import { readNotes } from '@/lib/notes/readNotes';
import { sectionMetadata } from '@/lib/og/meta';
import { sectionPage } from '@/lib/seo/schema';
import { routeFor } from '@/lib/seo/site';

const ROUTE = routeFor('/notes');

export const metadata = sectionMetadata({
  title: ROUTE.title,
  description: ROUTE.description,
  path: ROUTE.path,
});

// Server component, read at build time with synchronous `fs` — the same
// arrangement /uses has, and for the same reason: `node:fs` must never reach a
// client bundle and the route must stay static.
export default function NotesIndexPage() {
  // Only the five DISPLAY fields cross into the client component below.
  // `readNotes()` carries each document's full `markdown` — 67KB for
  // docs/seo.md alone — and every prop handed to a 'use client' boundary is
  // serialised into the RSC payload, so passing the records through whole
  // would ship the entire decision record inside the HTML of the page that
  // merely links to it. The thousands separator is applied HERE for the same
  // class of reason: formatted on the client it would resolve against the
  // visitor's locale and could disagree with the server's markup.
  const notes = readNotes().map(({ slug, title, summary, lines, source }) => ({
    slug,
    title,
    summary,
    source,
    linesLabel: lines.toLocaleString('en-GB'),
  }));

  return (
    <>
      <JsonLd
        id="ld-notes"
        data={sectionPage({
          path: ROUTE.path,
          name: ROUTE.title,
          description: ROUTE.description,
        })}
      />

      <Image
        src={bg}
        alt=""
        priority
        sizes="100vw"
        className="fixed left-0 top-0 -z-50 h-full w-full object-cover object-center opacity-50"
      />
      <div className="fixed left-0 top-0 -z-40 h-full w-full bg-black/70" />
      <AuroraDustMount />

      <PageTitle title="NOTES" subtitle="decisions, written down" replayOnView />

      {/* The standfirst and the record list, with their entrance. They sit
          behind a client boundary because the reveal has to be gated on the
          intro loader lifting — see the header of @/components/notes for why
          the pure-CSS scroll choreography the sibling /cv route uses cannot
          work on a page whose entire content sits above the fold. */}
      <NotesIndex notes={notes} />
    </>
  );
}
