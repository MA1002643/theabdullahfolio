import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createTranslator } from 'next-intl';

import english from '../../../messages/en/Notes.json';
import { intlTag } from '@/i18n/format';
import { DEFAULT_LOCALE } from '@/i18n/locales';
import { assertDescriptionFits } from '@/lib/seo/descriptionWindow';

// The meta description for `/notes/[slug]` (issue #32, W8).
//
// ── Why a composer rather than the document's own opening paragraph ─────────
// `summaryOf()` reads the first paragraph of prose, which is the right default
// and produces a good description for a document that opens with an abstract.
// It is not a contract, though, and nothing was checking the result against
// one: `docs/seo.md` opens on `Issue [#32](…).` — a reference line, not a
// summary — so the published description was the ten characters `Issue #32.`
//
// That is the SAME defect `projectMeta.js` was written for, at the other end of
// the site: below roughly 110 characters Google tends to discard the
// description and substitute its own scraped page text, throwing away the one
// string the site gets to choose. A ten-character description is not a short
// description; it is no description, plus a wasted slot.
//
// ── Why the value is computed ONCE ──────────────────────────────────────────
// It is published twice — the route's `<meta name="description">` and the
// `description` of the `TechArticle` in its JSON-LD — and those two had drifted
// apart before this existed: the metadata fell back to a composed sentence when
// the summary was absent, the schema fell back to the bare title. Two fallbacks
// for one fact meant a note could describe itself differently to a crawler
// reading the head and a crawler reading the graph. `readNotes()` now attaches
// the finished string to the record as `description`, so both call sites read
// one value and there is no second place to fix.
//
// ── In other languages (2026-11-10) ─────────────────────────────────────────
// The notes are translated now, so each locale publishes its own description.
// Which of the three sources below is used is decided from the ENGLISH record
// and then read in the visitor's language. Deciding per locale would let the
// 110–160 window, which is measured in Latin characters, flip a Japanese page
// to the composed fallback merely because Japanese is denser — the same note
// would then describe itself one way in English and another way in Japanese.
// The curated strings and the composed sentence are catalogue messages
// (`Notes.meta`, translated by `npm run i18n:translate`) rather than literals
// here, so a translation exists for them at all.

/**
 * Descriptions written by hand live in `messages/en/Notes.json` under
 * `meta.curated`, keyed by slug.
 *
 * An OVERRIDE, not a registry — the same doctrine as `SLUG_OVERRIDES` in
 * `readNotes.js`. A document whose opening paragraph already reads as an
 * abstract needs no entry, and adding one for every note would be a way of
 * guaranteeing the two go out of step.
 *
 * An entry earns its place by being something the document cannot say about
 * itself in its first paragraph. `docs/seo.md` opens by citing the issue it
 * came from, which is the correct thing for the page to say first and the wrong
 * thing for a search result to say at all.
 */
const CURATED = english.meta.curated;

/**
 * Which source a note's description comes from, decided from its English.
 *
 * @param {{slug: string, summary: string|null}} note The ENGLISH record.
 * @returns {'curated'|'summary'|'composed'}
 */
export function noteDescriptionSource({ slug, summary }) {
  if (CURATED[slug]) return 'curated';
  // `assertDescriptionFits` rather than a second copy of 110/160: the window is
  // one fact about how search engines render, and a figure written down twice
  // is a figure that will disagree with itself.
  if (summary && assertDescriptionFits(summary).ok) return 'summary';
  return 'composed';
}

/** `messages/<locale>/Notes.json`, or null when the locale has none. */
function catalogue(locale, root) {
  if (locale === DEFAULT_LOCALE) return english;
  try {
    return JSON.parse(
      readFileSync(path.join(root, 'messages', locale, 'Notes.json'), 'utf8'),
    );
  } catch {
    return null;
  }
}

/**
 * The description published for a note, in both places it is published.
 *
 * Three sources, in order of how much they know about the document:
 *
 * 1. A curated string, where one is written.
 * 2. The document's own opening paragraph, when it already fits the window a
 *    search engine renders whole. This is the case worth optimising for — a
 *    document that introduces itself properly should not need an entry above.
 * 3. A composed sentence, so a new note can never publish an empty or
 *    ten-character description merely by opening with a heading, a table or a
 *    reference line.
 *
 * The composition in (3) carries the title, so its length varies with it and it
 * can fall outside the window for a long enough one. That is deliberate rather
 * than defended against here: `metadataContract.test.js` measures every note in
 * the corpus, so the failure names the document and tells its author to write a
 * curated entry — which is a better description than anything this function
 * could assemble from a title and a line count.
 *
 * @param {object} note A record from `readNotes()`, before `description` is set
 *   — the ENGLISH one, which decides the source.
 * @param {string} note.slug The URL slug, and the key into the curated map.
 * @param {string} note.title The document's H1.
 * @param {number} note.lines Its length, from `countLines`.
 * @param {string|null} note.summary Its opening paragraph, or null.
 * @param {object} [options]
 * @param {string} [options.locale] URL locale; English when omitted.
 * @param {{title: string, summary: string|null}} [options.localized] The same
 *   note's title and summary in that locale.
 * @param {string} [options.root] Repository root, for the catalogue.
 * @returns {string} A description, never empty.
 */
export function noteMetaDescription(
  note,
  { locale = DEFAULT_LOCALE, localized = note, root = process.cwd() } = {},
) {
  const source = noteDescriptionSource(note);
  if (source === 'summary') return localized.summary ?? note.summary;

  // A locale whose catalogue lacks the key (a brand-new curated entry the
  // translation pass has not reached yet) publishes the English rather than
  // the message id: missing keys fall back message by message.
  const own = catalogue(locale, root)?.meta ?? {};
  const messages = {
    Notes: {
      meta: {
        composed: own.composed ?? english.meta.composed,
        curated: { ...english.meta.curated, ...(own.curated ?? {}) },
      },
    },
  };
  const t = createTranslator({ locale, messages, namespace: 'Notes.meta' });

  if (source === 'curated') return t(`curated.${note.slug}`);
  // `intlTag`, never a bare `toLocaleString`: an unqualified call resolves
  // against the runtime's locale, and a build machine's is not a decision
  // anyone made. English is `en-GB`, as it always was here.
  return t('composed', {
    title: localized.title,
    n: note.lines.toLocaleString(intlTag(locale)),
  });
}
