import { readFileSync } from 'node:fs';
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

const HOME_PAGE = 'src/app/page.js';
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
  const match = source.match(/<p className="sr-only">([\s\S]*?)<\/p>/);
  expect(
    match,
    `no <p className="sr-only"> found in ${HOME_PAGE}; if the summary moved, ` +
      'point this guard at its new home rather than deleting it',
  ).not.toBe(null);
  return match[1];
}

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
    const summary = homeSummarySource();

    // The interpolation itself, so a future edit that "simplifies" it back to
    // a word fails here rather than on a crawler's next visit.
    expect(
      summary,
      `${HOME_PAGE}'s sr-only summary no longer derives its project count ` +
        'from projectsData — it must interpolate countWord(projectsData.length)',
    ).toMatch(/\{countWord\(projectsData\.length\)[^}]*\}\s*projects/);

    const hardCoded = summary.match(
      new RegExp(`collects\\s+(${COUNT_WORDS}|\\d+)\\s+projects`, 'i'),
    );
    expect(
      hardCoded,
      `${HOME_PAGE} hard-codes "${hardCoded?.[1]}" as the project count; ` +
        'read it from projectsData instead',
    ).toBe(null);
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
