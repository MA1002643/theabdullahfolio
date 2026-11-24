// Outcome figures for the case studies (issue #31), derived at build.
//
// An outcome in data.js names a `derive` key rather than typing a number,
// because a hand-copied figure is stale the week after it is written
// (CLAUDE.md §2, "Do not hand-copy figures into prose"). Each key reads the
// same source the rest of the site already publishes: the locale registry,
// the two generated test-count files /uses and Ask read, and the notes corpus.
// So the flagship's "Vitest test cases" is the number `npm run test:count`
// last wrote, and CI fails if that file is stale.
//
// Server-only: it reads the filesystem through readNotes.

import { LOCALES } from '@/i18n/locales';
import { readNotes } from '@/lib/notes/readNotes';
import vitestCases from '../../../tests/vitest-cases.json';
import browserCases from '../../../tests/browser-cases.json';

export const FIGURE_SOURCES = Object.freeze({
  locales: () => LOCALES.length,
  rtlLocales: () => LOCALES.filter((l) => l.dir === 'rtl').length,
  vitestCases: () => vitestCases.cases,
  browserCases: () => browserCases.cases,
  notes: () => readNotes().length,
});

/**
 * The number an outcome shows. A `derive` key wins; otherwise a hand-entered
 * `value` is used as written (and should carry a dated `source`). Unknown keys
 * throw, so a typo fails the build instead of rendering an empty figure.
 *
 * @param {{ derive?: string, value?: number }} item
 * @returns {number}
 */
export function resolveFigure(item) {
  if (item.derive) {
    const source = FIGURE_SOURCES[item.derive];
    if (!source) throw new Error(`caseStudy outcome: unknown derive key "${item.derive}"`);
    return source();
  }
  if (typeof item.value !== 'number') {
    throw new Error(`caseStudy outcome "${item.id}" needs a numeric value or a derive key`);
  }
  return item.value;
}
