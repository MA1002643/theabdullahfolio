import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { projectsData } from '@/app/data';
import { countWord } from '@/lib/numberWords';
import { ROUTES } from '@/lib/seo/site';

// `projectsData` is the source of truth for what this site holds, and two
// discoverability surfaces state its size in prose: the /projects description
// in the route registry, and the homepage's `sr-only` summary. Both read the
// count from the array now — this suite is what stops either of them quietly
// going back to a typed number, which is how they were written originally and
// how they would have said "eleven" forever after a twelfth project landed.
//
// A stale count here is invisible in the worst way: nothing throws, no page
// looks broken, and the wrong number is what gets served to crawlers, quoted
// by assistants, and read aloud by screen readers.

const HOME_PAGE = 'src/app/[locale]/(home)/page.js';
const HOME_PAGE_PATH = path.join(process.cwd(), HOME_PAGE);

/** Number words the prose could plausibly have hard-coded. */
const COUNT_WORDS =
  'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|' +
  'thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty';

/**
 * The `sr-only` paragraph, read from source rather than rendered: the homepage
 * pulls in the WebGL hero and the whole orbit, none of which a count assertion
 * should have to boot.
 */
function homeSummarySource() {
  const source = readFileSync(HOME_PAGE_PATH, 'utf8');
  // Anchored on the `sr-only` class rather than on the whole attribute: the
  // paragraph also carries `home-intro-summary`, the hook for the
  // `:focus-within` reveal that keeps its two links from being invisible
  // keyboard stops. Pinning the exact string made a presentational class
  // addition fail a test about project counts, which points at the test.
  const match = source.match(
    /<p className="[^"]*\bsr-only\b[^"]*">([\s\S]*?)<\/p>/,
  );
  expect(
    match,
    `no sr-only <p> found in ${HOME_PAGE}; if the summary moved, ` +
      'point this guard at its new home rather than deleting it',
  ).not.toBe(null);
  return { source, paragraph: match[1] };
}

// Since issue #82 the prose itself lives in the catalogue (`Home.summary`), and
// the page hands it the count. So the guard now has two halves: the PAGE must
// derive the value from projectsData, and the MESSAGE must take it as a
// placeholder rather than spelling a number. Every other locale's catalogue is
// checked the same way — a translation that typed "11" would go stale too.
const catalogues = () =>
  readdirSync(path.join(process.cwd(), 'messages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .flatMap((locale) => {
      const file = path.join(process.cwd(), 'messages', locale, 'Home.json');
      if (!existsSync(file)) return [];
      const summary = JSON.parse(readFileSync(file, 'utf8')).summary;
      return summary ? [[locale, summary]] : [];
    });

describe('project counts in prose are derived, not typed', () => {
  it('states the current count in the /projects description', () => {
    const projects = ROUTES.find((route) => route.path === '/projects');
    expect(projects).toBeDefined();
    // Deliberately not asserting the literal 'Eleven' — that would just move
    // the stale number into the test.
    expect(projects.description).toMatch(
      new RegExp(`^${countWord(projectsData.length)} builds\\b`),
    );
  });

  it("derives the count in the homepage's accessible summary", () => {
    const { source, paragraph } = homeSummarySource();

    // The paragraph renders the catalogue message and passes it a count...
    expect(
      paragraph,
      `${HOME_PAGE}'s sr-only summary must render the Home.summary message`,
    ).toMatch(/t\.rich\(\s*'summary',\s*\{\s*count:\s*projectCount\b/);
    // ...and that count is read from projectsData: the English word through
    // countWord, every other locale as a formatted number. A future edit that
    // "simplifies" either back to a literal fails here rather than on a
    // crawler's next visit.
    expect(
      source,
      `${HOME_PAGE} no longer derives the summary's project count from projectsData`,
    ).toMatch(
      /const projectCount =[\s\S]*?countWord\(projectsData\.length\)\.toLowerCase\(\)[\s\S]*?formatNumber\(projectsData\.length, locale\)/,
    );
  });

  it('keeps the count a placeholder in every Home.summary catalogue', () => {
    const found = catalogues();
    expect(found.map(([locale]) => locale)).toContain('en');
    for (const [locale, summary] of found) {
      expect(summary, `messages/${locale}/Home.json summary lost its {count}`).toContain(
        '{count}',
      );
      const hardCoded = summary.match(
        new RegExp(`collects\\s+(${COUNT_WORDS}|\\d+)\\s+projects`, 'i'),
      );
      expect(
        hardCoded,
        `messages/${locale}/Home.json hard-codes "${hardCoded?.[1]}" as the project count`,
      ).toBe(null);
    }
  });

  it('keeps countWord free of imports, so both sides of the line can use it', () => {
    // The homepage is `'use client'`. If this module ever imports the route
    // registry (or anything else), that pulls into the browser bundle.
    const source = readFileSync(
      path.join(process.cwd(), 'src/lib/numberWords.js'),
      'utf8',
    );
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it('spells counts the way the prose expects', () => {
    expect(countWord(0)).toBe('Zero');
    expect(countWord(11)).toBe('Eleven');
    expect(countWord(20)).toBe('Twenty');
    // Past the table it degrades to digits rather than `undefined`, which is
    // what would otherwise reach a meta description.
    expect(countWord(21)).toBe('21');
  });
});
