// Build-safe `programmingLanguage` for the project pages (issue #32, W2).
//
// Reads the committed map produced by scripts/refresh-project-languages.mjs.
// No network, no secret, no `fs` — a plain JSON import, resolved by the bundler
// at build time exactly like src/app/data.js. That is the whole point: the
// property was originally omitted because the only source available needed a
// token and a fetch inside `next build` (docs/seo.md §12), and this closes that
// gap without reintroducing either.
//
// ── Why a repo key and not a project id ─────────────────────────────────────
// The map is keyed by `owner/name`, which is what the GitHub API is addressed
// by and what `projectsData[].repo` already holds. Keying by project id would
// mean renumbering the file whenever the projects array is reordered — a
// gratuitous source of drift between two files that have no reason to agree on
// ordering.

import languageData from '@/data/project-languages.json';

const LANGUAGES = languageData.languages ?? {};

/**
 * Languages for one project, most-used first, or `undefined`.
 *
 * `undefined` rather than `[]` for every miss, because the consumer
 * (`projectPage`) prunes undefined properties away entirely and an empty array
 * would serialise as `"programmingLanguage": []` — a positive claim that the
 * repository contains no code, which is false for every case that reaches here.
 *
 * Three distinct cases all return `undefined`, deliberately collapsed:
 *
 *   • A PRIVATE project. The refresh script never fetches one, so it has no
 *     entry — matching `codeRepository`, which is also withheld for private
 *     repositories rather than pointing at a 404.
 *   • A repository GitHub reports no languages for (a docs-only or
 *     newly-created repo — AfaaqX is one today).
 *   • A project added to data.js since the last refresh. This is the case worth
 *     naming: it degrades to the pre-existing behaviour, which is the property
 *     simply being absent. A new project is never blocked on someone
 *     remembering to run the script, and `tests/unit/projectLanguages.test.js`
 *     reports the staleness instead of the build failing on it.
 *
 * @param {{repo?: string, private?: boolean}} project A `projectsData` record.
 * @returns {string[]|undefined} Language names, or undefined when unknown.
 */
export function languagesFor(project) {
  if (!project?.repo || project.private) return undefined;
  const languages = LANGUAGES[project.repo];
  return Array.isArray(languages) && languages.length > 0
    ? languages
    : undefined;
}

/** The raw map, for the drift test. Not for rendering. */
export function allProjectLanguages() {
  return LANGUAGES;
}
