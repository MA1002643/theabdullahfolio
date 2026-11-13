import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import IntlScope from '@/i18n/IntlScope';
import { intlTag } from '@/i18n/format';
import { DEFAULT_LOCALE } from '@/i18n/locales';
import { notFound } from 'next/navigation';

import bg from '../../../../../../public/background/contact-bg.png';
import AuroraDustMount from '@/components/AuroraDustMount';
import PageTitle from '@/components/PageTitle';
import JsonLd from '@/components/seo/JsonLd';
import { readNote, readNotes, renderNote } from '@/lib/notes/readNotes';
import { sectionMetadata } from '@/lib/og/meta';
import { notePage } from '@/lib/seo/schema';

// Prerender one page per document. The corpus is a directory of committed
// files, so it is fully knowable at build time — same shape as the project
// pages, and for the same reason.
export function generateStaticParams() {
  return readNotes().map((note) => ({ slug: note.slug }));
}

// Anything outside `generateStaticParams` is rejected at the routing layer
// rather than rendered, so /notes/anything answers a real 404. Matches the
// project detail route's arrangement.
export const dynamicParams = false;

// `params` is a Promise from Next 15; synchronous access is deprecated.
export async function generateMetadata({ params }) {
  const { slug, locale } = await params;
  const note = readNote(slug, { locale });
  if (!note) return {};
  return sectionMetadata({
    // Translated since 2026-11-10 (it was English-only under issue #82): each
    // locale is canonical in its own language, with the full hreflang set.
    locale,
    translated: true,
    title: note.title,
    // Composed in `src/lib/seo/noteMeta.js` and attached by `readNotes()`, so
    // this and the JSON-LD below publish one string. The fallback that used to
    // live here fired only when the summary was ABSENT, which missed the case
    // that actually shipped: a summary that was present and ten characters
    // long, because this document opens by citing its issue.
    description: note.description,
    path: `/notes/${note.slug}`,
  });
}

export default async function NotePage({ params }) {
  const { slug, locale } = await params;
  setRequestLocale(locale);
  const note = readNote(slug, { locale });
  if (!note) notFound();

  // `body`, not `markdown`: the document in this locale, with any block not
  // yet translated kept in English inside a `lang="en"` island.
  const html = renderNote(note.body, locale);
  const t = await getTranslations({ locale, namespace: 'Notes' });

  return (
    <IntlScope locale={locale} route="/notes/[slug]">
      {/* The article node and its trail, composed in src/lib/seo/schema.js —
          see `notePage` there for why the type, the ids and the absent dates
          are what they are, and for the document-spread-into-a-node defect
          this call site used to carry. */}
      <JsonLd
        id="ld-note"
        data={notePage({
          slug: note.slug,
          title: note.title,
          locale,
          crumbs: { home: t('note.crumbs.home'), notes: t('note.crumbs.notes') },
          // The same string `generateMetadata` publishes. These had separate
          // fallbacks — a composed sentence in the head, the bare title here —
          // so a note could describe itself one way to a crawler reading the
          // head and another to one reading the graph.
          description: note.description,
        })}
      />

      {/* The same backdrop trio as every other sub-page. It was briefly omitted
          here on the theory that a photographic backdrop behind long prose
          costs legibility — it does not, at `opacity-50` under a `bg-black/70`
          dimmer, and removing it cost something measurable instead: Lighthouse
          scored this route's accessibility at 96 against 100 everywhere else,
          on a colour-contrast failure for the PageTitle subtitle. Behind the
          dimmer the subtitle composites against near-black and passes; against
          the bare body colour it lands at 2.9:1, just under the 3:1 floor for
          large text. Consistency was the right default and the measurement
          agreed with it. */}
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

      {/* Reading rail. A bare <div> driven entirely by `scroll(root block)` in
          CSS — no state, no listener, no hydration — so this route keeps
          shipping zero JavaScript of its own. Thirty-odd viewports of document
          is precisely the length at which telling a reader how much is left
          earns its two pixels. `aria-hidden` because it reports nothing a
          screen-reader user cannot already get from the scroll position. */}
      <div className="note-progress" aria-hidden="true" />

      {/* The eyebrow word is chrome; the subtitle is the document's own
          title, in this locale's translation. Marked `lang="en"` only if the
          title has no translation yet, so a screen reader switches voice for
          exactly the words that are English. */}
      <PageTitle
        title={t('note.title')}
        subtitle={note.title}
        subtitleLang={note.titleLang === locale ? undefined : DEFAULT_LOCALE}
        replayOnView
      />

      <div className="mx-auto w-full max-w-3xl pb-24">
        <nav aria-label={t('note.breadcrumb')} className="mb-8">
          <Link
            className="font-mono text-xs uppercase tracking-wider text-gold-soft underline decoration-[#ffaa2a]/30 underline-offset-4 transition-colors hover:text-[#ffaa2a]"
            href="/notes"
          >
            {/* The arrow points BACK, so it turns round in RTL (issue #82).
                Hidden from AT: the link's name is its words. */}
            <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
              ←
            </span>{' '}
            {t('note.allNotes')}
          </Link>
        </nav>

        {/* The rendered document. `dangerouslySetInnerHTML` is safe here for a
            reason recorded at the top of readNotes.js and repeated because this
            is the line that would have to change: the only input is a markdown
            file committed to this repository and reviewed in a pull request.
            It is never user input and never fetched. */}
        {/* A passage edited since the last translation pass renders in English
            until `npm run notes:translate` reaches it. Said here, in the
            reader's language, rather than left for them to wonder whether the
            translation broke. Never shown in English. */}
        {note.untranslated > 0 ? (
          <p
            role="note"
            className="mb-6 rounded-lg border border-[#ffcd5b33] bg-black/30 px-4 py-3 text-sm leading-relaxed text-[#d4d4d4]"
          >
            {t('note.partial')}
          </p>
        ) : null}
        <div
          className="note-prose"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <p className="mt-16 border-t border-white/10 pt-6 font-mono text-xs uppercase tracking-wider text-gold-soft">
          {t('note.source', {
            source: note.source,
            count: note.lines,
            n: note.lines.toLocaleString(intlTag(locale)),
          })}
        </p>
      </div>
    </IntlScope>
  );
}
