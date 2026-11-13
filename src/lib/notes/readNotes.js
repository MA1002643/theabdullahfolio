import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { marked } from 'marked';

import { DEFAULT_LOCALE, localizePath } from '@/i18n/locales';
import { assembleNote } from '@/lib/notes/segments';
import { noteMetaDescription } from '@/lib/seo/noteMeta';

// The engineering notes (issue #32, W8) — `docs/*.md`, served as pages.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// `docs/seo.md` is well over a thousand lines recording why each decision on
// this site was taken, which alternatives were rejected and what each one cost.
// It is the most unusual artifact in the repository and, until this route, the
// least reachable: it lived only in the GitHub tree, where nobody arriving at
// the site would ever find it.
//
// (Deliberately not a figure. This comment said "1,022 lines" and the document
// had grown to 1,257 by the time anyone looked — a hand-copied count of a file
// that is appended to continuously is stale the week after it is written. The
// figure the PAGE prints is computed from the file at build, which is the only
// version of this number worth trusting; see `countLines` below.)
//
// That is a discoverability failure in the same family as F1 and F8, applied to
// the repository's own reasoning rather than its pages: a document with no
// inbound path is undiscovered no matter how good it is. Serving it here gives
// it a URL, a canonical, a sitemap entry and a place in the site's own link
// graph — and gives the site ~1,000 lines of genuine technical prose, which is
// the kind of depth no amount of metadata tuning can substitute for.
//
// ── Why the parsing happens HERE and never in the browser ───────────────────
// `marked` is imported by this module only, and this module is imported only by
// server components that run at BUILD time. The pages are statically
// prerendered, so the markdown is turned into HTML once, during `next build`,
// and the parser never enters a client bundle. A reader downloads HTML, not a
// markdown engine.
//
// ── Trust boundary ──────────────────────────────────────────────────────────
// The rendered HTML is injected with `dangerouslySetInnerHTML`, which is safe
// here for a reason that must stay true: the ONLY input is files committed to
// `docs/` in this repository, reviewed in a pull request like any other source.
// It is never user input, never fetched, never derived from a request. If that
// ever changes — a doc pulled from an API, or user-supplied content — this
// needs a sanitiser before it renders, and the change would not be obvious from
// the call site, which is why the constraint is written down here.

const DOCS_DIR = 'docs';

// ── Translations (2026-11-10, reversing issue #82's "English on purpose") ────
// Each note is published in every locale. The translations are not whole
// files: `docs/i18n/<locale>/<file>.json` maps the hash of each English block
// to its translation (see `segments.js` for why the unit is a block), written
// by `npm run notes:translate`. A block with no entry renders its English, in
// a `lang="en"` island, and is counted so the page can say so. The cache is
// committed and reviewed like the catalogues, and the trust boundary below
// still holds: it is files in this repository, never fetched, never input.
export const NOTES_I18N_DIR = path.join(DOCS_DIR, 'i18n');

/** A locale's translation cache for one document, or an empty one. */
function readCache(root, locale, base) {
  try {
    return JSON.parse(
      readFileSync(path.join(root, NOTES_I18N_DIR, locale, `${base}.json`), 'utf8'),
    );
  } catch {
    return {};
  }
}

/**
 * Turn a filename into the URL slug it is served at.
 *
 * `seo.md` → `discoverability`, via the map below rather than the filename.
 * The file is named for the folder it lives in; the URL is read by people, and
 * "discoverability" says what the document is about where "seo" says which
 * three letters it was filed under.
 *
 * An unmapped file falls back to its basename, so adding `docs/anything.md`
 * publishes at `/notes/anything` with no edit here — the map is an override,
 * not a registry.
 */
const SLUG_OVERRIDES = {
  seo: 'discoverability',
};

/**
 * How many lines a document has.
 *
 * The naive `split('\n').length` is wrong by one for the normal case. A text
 * file conventionally ENDS with a newline, and that final newline TERMINATES
 * the last line rather than starting an empty one — so splitting yields a
 * trailing `''` element that is not a line. The index published 1,258 for a
 * file that `wc -l` reported as 1,257. (Past tense: the document has grown
 * since, which is the whole reason neither number is written down anywhere a
 * reader could mistake it for the current one.)
 *
 * That off-by-one matters more here than it would elsewhere, because the whole
 * justification for printing a line count (rather than a reading-time estimate)
 * is that it is a real figure the reader can go and CHECK. A number that
 * disagrees with the obvious way of checking it fails at the one job it has.
 *
 * Matches POSIX `wc -l` for a newline-terminated file, and still counts a final
 * unterminated line — which `wc -l` does not, and which is the one case where
 * being right beats being identical to the tool.
 */
export function countLines(markdown) {
  // An empty file has no lines. Without this guard the expression below
  // returns 1, because splitting '' yields a single empty element.
  if (markdown === '') return 0;
  return markdown.replace(/\n$/, '').split('\n').length;
}

/** `# Heading` from the first line of a markdown document. */
function titleOf(markdown, fallback) {
  const heading = markdown.match(/^#\s+(.+?)\s*$/m);
  return heading ? heading[1] : fallback;
}

/**
 * The first paragraph of prose, as a one-line summary.
 *
 * Skips the H1 and any immediately-following headings, and stops at the first
 * line that is ordinary text. Returns null rather than a guess when the
 * document opens with something that is not a paragraph (a table, a list) —
 * the index renders nothing in that case instead of an accidental fragment.
 *
 * ── Why this reads a PARAGRAPH and not a line ───────────────────────────────
 * It returned the first physical line once, which is a different thing. These
 * documents are hard-wrapped at ~80 columns for editing — `renderNote` says so,
 * and sets `breaks: false` precisely because a source wrap is not a line break
 * — so "the first line" is a sentence cut at whatever column the author's
 * editor happened to reach. That string is published in three places: the
 * `/notes/[slug]` meta description, the `TechArticle` description and the
 * summary on `/notes`. A description truncated mid-clause is the one kind of
 * metadata error a search engine renders verbatim.
 *
 * Joining also fixes the link strip. `[text](url)` is removed by a regex that
 * cannot match across a newline, so a link that happened to wrap survived into
 * the output as raw markdown syntax.
 *
 * Exported for the same reason `countLines` is: the shipping corpus is one
 * document whose opening paragraph is a single line, so it cannot exercise the
 * wrap, the abutting-block terminator or the split link. Constructed input can.
 */
export function summaryOf(markdown) {
  const lines = markdown.split('\n');
  let seenHeading = false;
  const paragraph = [];

  for (const raw of lines) {
    const line = raw.trim();

    // Already inside the paragraph: keep taking wrapped lines until the block
    // ends. A blank line ends it, and so does the start of any other block —
    // a heading, table, quote, list or fence — which a paragraph may abut
    // without a blank line between them.
    //
    // A fence has TWO spellings and this knew only one: CommonMark opens a code
    // block with 3+ backticks or 3+ tildes, and `marked` honours both. A
    // paragraph followed immediately by `~~~js` therefore ran straight on into
    // the code, publishing it as the description. The tilde form must match the
    // full `~~~` rather than a lone `~` the way the backtick branch does —
    // `~~struck~~` is strikethrough, which is prose, and one tilde would cut
    // any paragraph line that opened with it.
    if (paragraph.length > 0) {
      if (!line || /^(#|[|>`]|~~~|[-*+]\s|\d+\.)/.test(line)) break;
      paragraph.push(line);
      continue;
    }

    if (!line) continue;
    if (line.startsWith('#')) {
      seenHeading = true;
      continue;
    }
    if (!seenHeading) continue;
    // Not prose: a table, list, quote, rule or code fence.
    if (/^[|>\-*+`]|^~~~|^\d+\./.test(line)) return null;
    paragraph.push(line);
  }

  if (paragraph.length === 0) return null;

  // A single space at each wrap, matching how `marked` renders the same source
  // with `breaks: false` — so the summary reads as the paragraph on the page
  // reads, not as the file is stored.
  return paragraph
    .join(' ')
    // Strip inline markdown that would render as syntax in a plain-text slot.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '');
}

/**
 * The same note in another locale: title, summary, description and the
 * markdown to render, from the English record and the locale's cache.
 *
 * `lines` and `source` stay the English file's, because the page says
 * "Source: docs/seo.md · N lines" — a fact about the committed file, which is
 * what a reader can go and check.
 *
 * `titleLang` / `summaryLang` say which language each string actually came out
 * in, so the page can mark an untranslated one `lang="en"` for a screen reader
 * rather than assuming the whole record is in the URL's language.
 */
function localise(record, locale, root) {
  if (locale === DEFAULT_LOCALE) {
    return {
      ...record,
      titleLang: locale,
      summaryLang: locale,
      body: record.markdown,
      untranslated: 0,
    };
  }
  const base = path.basename(record.source, '.md');
  const cache = readCache(root, locale, base);
  // Twice: plain for the strings published as text (a summary must not open
  // on an island's `<div>`), marked for the body rendered as HTML.
  const plain = assembleNote(record.markdown, cache);
  const marked = assembleNote(record.markdown, cache, { markFallback: true });
  const title = titleOf(plain.markdown, record.title);
  const summary = summaryOf(plain.markdown);
  const localized = { title, summary };
  return {
    ...record,
    title,
    summary,
    titleLang: plain.titleTranslated ? locale : DEFAULT_LOCALE,
    summaryLang: summary !== null && summary !== record.summary ? locale : DEFAULT_LOCALE,
    description: noteMetaDescription(record, { locale, localized, root }),
    body: marked.markdown,
    untranslated: marked.fallback,
  };
}

/**
 * Every note, newest-first by nothing in particular — see the sort below.
 *
 * @param {{locale?: string, root?: string}} [options] `locale` is the URL
 *   locale the records are read in (English by default); `root` the
 *   repository root.
 */
export function readNotes({ locale = DEFAULT_LOCALE, root = process.cwd() } = {}) {
  let files = [];
  try {
    files = readdirSync(path.join(root, DOCS_DIR)).filter((f) =>
      f.endsWith('.md'),
    );
  } catch {
    // No docs directory is a supported state: a fork that deletes it gets an
    // empty index rather than a build failure.
    return [];
  }

  return files
    .map((file) => {
      const base = file.replace(/\.md$/, '');
      const markdown = readFileSync(path.join(root, DOCS_DIR, file), 'utf8');
      const record = {
        slug: SLUG_OVERRIDES[base] ?? base,
        source: `${DOCS_DIR}/${file}`,
        title: titleOf(markdown, base),
        summary: summaryOf(markdown),
        // A real, checkable figure rather than a reading-time estimate. Lines
        // are what this document is measured in — it is a technical record, not
        // an article — and the count comes from the file rather than a guess.
        // `countLines`, not `split('\n').length`: see its note for why the
        // naive form publishes a number that `wc -l` contradicts.
        lines: countLines(markdown),
        markdown,
      };

      // Composed from the record above rather than inlined into it, because it
      // reads four of its own fields. `description` is what the two machine
      // surfaces publish — see `noteMeta.js` for why it is computed once here
      // instead of falling back differently at each of them.
      return localise(
        { ...record, description: noteMetaDescription(record, { root }) },
        locale,
        root,
      );
    })
    // Longest first. With one document this is arbitrary; with several it puts
    // the most substantial record at the top, which is the right default for an
    // index whose purpose is to show that the reasoning is written down.
    .sort((a, b) => b.lines - a.lines);
}

/** One note by slug, or null. Takes `readNotes`' options. */
export function readNote(slug, options) {
  return readNotes(options).find((note) => note.slug === slug) ?? null;
}

/**
 * A note's body as HTML, with the H1 removed.
 *
 * The H1 is dropped because the PAGE renders the title itself — leaving it in
 * the body would put two identical top-level headings in the document, which is
 * the same defect the /cv masthead avoided and which the e2e suite's
 * "exactly one h1" check would catch.
 */
export function renderNote(markdown, locale = DEFAULT_LOCALE) {
  const withoutTitle = markdown.replace(/^#\s+.+?\n/, '');
  const html = makeScrollersFocusable(marked.parse(withoutTitle, {
    // GitHub-flavoured tables and strikethrough, which docs/seo.md uses
    // throughout — several of its decision records ARE tables.
    gfm: true,
    // `breaks: false` keeps a single newline as a space, which is what the
    // source documents assume: they are hard-wrapped at ~80 columns for
    // readability in an editor, and treating those wraps as line breaks would
    // render every paragraph as a ragged column.
    breaks: false,
  }));
  return localizeLinks(html, locale);
}

/**
 * Point a note's links to other notes at the reader's language.
 *
 * The documents link to each other by site path (`[How this site is tested]
 * (/notes/testing)`). Left as written, a reader on `/ja/notes/…` following one
 * lands on the English page. Only `/notes/…` is rewritten, never any other
 * site path: `/cv.pdf`, `/api/…` and the asset paths are not localized routes,
 * and prefixing one would turn a working link into a 404.
 *
 * Exported for the unit test, which needs constructed input the corpus may not
 * contain.
 */
export function localizeLinks(html, locale = DEFAULT_LOCALE) {
  if (locale === DEFAULT_LOCALE) return html;
  return html.replace(
    /href="(\/notes(?:\/[^"#?]*)?)([#?][^"]*)?"/g,
    (_, route, rest = '') => `href="${localizePath(route, locale)}${rest}"`,
  );
}

/**
 * Code blocks and tables scroll sideways on a phone, and a scrolling region a
 * keyboard cannot reach is unreadable without a mouse or touch (WCAG 2.1.1;
 * axe `scrollable-region-focusable`, found on /notes/discoverability at 390px
 * by tests/a11y/axe.spec.js, issue #92). Each one becomes a Tab stop.
 *
 * A plain string rewrite is safe here: marked escapes `<` inside code and
 * text, so a literal `<pre>` or `<table>` tag in its output can only be the
 * real element, never document content.
 */
export function makeScrollersFocusable(html) {
  return html.replace(/<(pre|table)>/g, '<$1 tabindex="0">');
}
