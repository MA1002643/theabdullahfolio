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

/**
 * Descriptions written by hand, keyed by slug.
 *
 * An OVERRIDE, not a registry — the same doctrine as `SLUG_OVERRIDES` in
 * `readNotes.js`. A document whose opening paragraph already reads as an
 * abstract needs no entry here, and adding one for every note would be a way of
 * guaranteeing the two go out of step.
 *
 * An entry earns its place by being something the document cannot say about
 * itself in its first paragraph. `docs/seo.md` opens by citing the issue it
 * came from, which is the correct thing for the page to say first and the wrong
 * thing for a search result to say at all.
 */
const CURATED = {
  discoverability:
    'Why each discoverability decision on this site was taken, what was ' +
    'rejected, and what it cost — the engineering record kept beside the code.',
};

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
 * @param {object} note A record from `readNotes()`, before `description` is set.
 * @param {string} note.slug The URL slug, and the key into the curated map.
 * @param {string} note.title The document's H1.
 * @param {number} note.lines Its length, from `countLines`.
 * @param {string|null} note.summary Its opening paragraph, or null.
 * @returns {string} A description, never empty.
 */
export function noteMetaDescription({ slug, title, lines, summary }) {
  const curated = CURATED[slug];
  if (curated) return curated;

  // `assertDescriptionFits` rather than a second copy of 110/160: the window is
  // one fact about how search engines render, and a figure written down twice
  // is a figure that will disagree with itself.
  if (summary && assertDescriptionFits(summary).ok) return summary;

  // `en-GB` explicitly, for the reason the `/notes` index formats its own count
  // server-side: an unqualified `toLocaleString` resolves against the runtime's
  // locale, and a build machine's is not a decision anyone made.
  return (
    `Engineering decision record — ${title}. ` +
    `${lines.toLocaleString('en-GB')} lines from this repository's own documentation.`
  );
}
