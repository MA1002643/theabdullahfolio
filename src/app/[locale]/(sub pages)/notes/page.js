import Image from 'next/image';

import bg from '../../../../../public/background/contact-bg.png';
import AuroraDustMount from '@/components/AuroraDustMount';
import NotesIndex from '@/components/notes';
import PageTitle from '@/components/PageTitle';
import JsonLd from '@/components/seo/JsonLd';
import { readNotes } from '@/lib/notes/readNotes';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { intlTag } from '@/i18n/format';
import { routeCopy, routeMetadata } from '@/lib/og/meta';
import { sectionPage } from '@/lib/seo/schema';
import { routeFor } from '@/lib/seo/site';

const ROUTE = routeFor('/notes');

export function generateMetadata({ params }) {
  return routeMetadata(ROUTE.path, params, { translated: false });
}

// Server component, read at build time with synchronous `fs` — the same
// arrangement /uses has, and for the same reason: `node:fs` must never reach a
// client bundle and the route must stay static.
export default async function NotesIndexPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const copy = await routeCopy(ROUTE.path, 'en');
  const t = await getTranslations({ locale, namespace: 'Notes' });
  // Only the five DISPLAY fields cross into the client component below.
  // `readNotes()` carries each document's full `markdown` — 67KB for
  // docs/seo.md alone — and every prop handed to a 'use client' boundary is
  // serialised into the RSC payload, so passing the records through whole
  // would ship the entire decision record inside the HTML of the page that
  // merely links to it. The thousands separator is applied HERE for the same
  // class of reason: formatted on the client it would resolve against the
  // visitor's locale and could disagree with the server's markup. It is the
  // URL locale's format (issue #82: Persian digits on /fa/notes), and `lines`
  // itself travels too so the "line/lines" word can take the right plural.
  const notes = readNotes().map(({ slug, title, summary, lines, source }) => ({
    slug,
    title,
    summary,
    source,
    lines,
    linesLabel: lines.toLocaleString(intlTag(locale)),
  }));

  return (
    <IntlScope locale={locale} route={ROUTE.path}>
      <JsonLd
        id="ld-notes"
        data={sectionPage({
          path: ROUTE.path,
          name: copy.title,
          description: copy.description,
        })}
      />

      <Image
        src={bg}
        alt=""
        loading="eager"
        fetchPriority="low"
        sizes="100vw"
        className="fixed left-0 top-0 -z-50 h-full w-full object-cover object-center opacity-50"
      />
      <div className="fixed left-0 top-0 -z-40 h-full w-full bg-black/70" />
      <AuroraDustMount />

      <PageTitle
        title={t('index.title')}
        subtitle={t('index.subtitle')}
        replayOnView
      />

      {/* The standfirst and the record list, with their entrance. They sit
          behind a client boundary because the reveal has to be gated on the
          intro loader lifting — see the header of @/components/notes for why
          the pure-CSS scroll choreography the sibling /cv route uses cannot
          work on a page whose entire content sits above the fold. */}
      <NotesIndex notes={notes} />
    </IntlScope>
  );
}
