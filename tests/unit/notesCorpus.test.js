import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { countLines, readNote, readNotes, renderNote } from '@/lib/notes/readNotes';

// ── Why this file exists ────────────────────────────────────────────────────
// /notes publishes the repository's own decision records as indexable pages,
// which puts a markdown renderer on the path to the HTML a crawler reads. Two
// classes of failure matter and neither is visible on screen:
//
//   1. A slug that the sitemap declares but `generateStaticParams` does not
//      produce. `dynamicParams = false` turns that into a declared URL
//      answering 404 — the coverage error the project pages were built to
//      avoid, reintroduced through a different door.
//   2. A rendered body that carries its own <h1>, giving the page two.
//
// The corpus is read from disk rather than fixtured, deliberately: these
// assertions are about the documents that actually ship.

const notes = readNotes();

describe('the corpus', () => {
  it('finds the documents in docs/', () => {
    // Vacuity guard. Every assertion below iterates the corpus, so an empty
    // read would turn this whole file green while proving nothing — and an
    // empty read is exactly what a moved directory or a changed extension
    // would produce.
    const onDisk = readdirSync('docs').filter((f) => f.endsWith('.md'));
    expect(notes.length).toBe(onDisk.length);
    expect(notes.length).toBeGreaterThan(0);
  });

  it('gives every note a unique, URL-safe slug', () => {
    const slugs = notes.map((note) => note.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      // Lowercase, hyphen-separated, nothing needing percent-encoding — a slug
      // that needs escaping would be one string in the sitemap and another in
      // the href, which is how a URL silently stops matching itself.
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(encodeURIComponent(slug)).toBe(slug);
    }
  });

  it('takes each title from the document rather than the filename', () => {
    for (const note of notes) {
      const firstHeading = readFileSync(note.source, 'utf8').match(/^#\s+(.+)$/m);
      if (firstHeading) expect(note.title).toBe(firstHeading[1].trim());
    }
  });

  it('counts the lines it claims to count', () => {
    // The oracle is deliberately NOT `split('\n').length` — that is the
    // expression the implementation uses, so asserting it here would restate
    // the code rather than test it, and would have held just as green while
    // the page published a figure one higher than `wc -l` reported (which it
    // did). Counting newline characters is an independent derivation, and for
    // a newline-terminated file it is exactly what `wc -l` prints — the tool a
    // reader would reach for to check the number, which is the entire point of
    // printing a line count instead of a reading time.
    for (const note of notes) {
      const content = readFileSync(note.source, 'utf8');
      const newlines = (content.match(/\n/g) ?? []).length;
      const wc = content.endsWith('\n') ? newlines : newlines + 1;
      expect(note.lines).toBe(wc);
    }
  });

  it('counts a final line that has no newline after it', () => {
    // The edge `wc -l` gets wrong and this must not: a file whose last line is
    // unterminated still has that line. Asserted on constructed input because
    // the shipping corpus is newline-terminated and so cannot exercise it.
    expect(countLines('a\nb\nc')).toBe(3);
    expect(countLines('a\nb\nc\n')).toBe(3);
    // A trailing BLANK line is a real line: the file ends '\n\n', so the
    // second newline terminates an empty line rather than being the
    // terminator this strips.
    expect(countLines('a\n\n')).toBe(2);
    expect(countLines('a')).toBe(1);
    // An empty file has no lines, where the naive form claims one.
    expect(countLines('')).toBe(0);
  });

  it('resolves each slug back to its note', () => {
    // The property the sitemap depends on: every URL it declares must be one
    // `readNote` can answer, or the page calls notFound() on a declared URL.
    for (const note of notes) {
      expect(readNote(note.slug)?.source).toBe(note.source);
    }
  });

  it('returns null for an unknown slug rather than throwing', () => {
    expect(readNote('no-such-note')).toBeNull();
  });
});

describe('rendering', () => {
  it('strips the H1, so the page owns the only one', () => {
    for (const note of notes) {
      const html = renderNote(note.markdown);
      expect(html).not.toMatch(/<h1[\s>]/);
    }
  });

  it('keeps the body — the H1 strip is not eating the document', () => {
    for (const note of notes) {
      const html = renderNote(note.markdown);
      // The sub-headings must survive; only the top-level title goes.
      expect(html).toMatch(/<h2[\s>]/);
      expect(html.length).toBeGreaterThan(1000);
    }
  });

  it('renders the tables these records are largely written in', () => {
    // docs/seo.md states several of its decisions AS tables, so GFM table
    // support is load-bearing rather than cosmetic — without it those sections
    // render as runs of pipe characters.
    const seo = notes.find((note) => note.slug === 'discoverability');
    expect(seo).toBeDefined();
    expect(renderNote(seo.markdown)).toMatch(/<table[\s>]/);
  });

  it('does not treat hard-wrapped source lines as line breaks', () => {
    // The documents are wrapped at ~80 columns for editing. With `breaks: true`
    // every one of those wraps would render as a <br>, turning each paragraph
    // into a ragged column — correct-looking in a diff, broken on the page.
    const seo = notes.find((note) => note.slug === 'discoverability');
    const html = renderNote(seo.markdown);
    const paragraphs = (html.match(/<p>/g) ?? []).length;
    const breaks = (html.match(/<br\s*\/?>/g) ?? []).length;
    expect(breaks).toBeLessThan(paragraphs);
  });
});

describe('the registry entry', () => {
  it('declares /notes so the index gets a canonical and a sitemap URL', async () => {
    const { routeFor } = await import('@/lib/seo/site');
    const route = routeFor('/notes');
    expect(route).toBeDefined();
    expect(route.indexable).toBe(true);
  });

  it('watches the corpus, so editing a note moves its lastmod', async () => {
    const { routeFor } = await import('@/lib/seo/site');
    // The index prints every document's title, summary and line count, so a
    // note edit genuinely changes this page even though nothing under the
    // route's own directory moved.
    expect(routeFor('/notes').sources).toContain('docs');
  });
});
