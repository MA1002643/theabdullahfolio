// Which chapters a project page renders, in which order (issue #31).
//
// ONE derivation feeds every consumer: the server render (CaseStudy.jsx), the
// chapter index and its phone sheet, the ⌘K jumps (ProjectPalette.jsx) and
// Ask's case-study facts (src/lib/ask/corpus.js). So a chapter added, removed
// or reordered in data.js reaches all of them with no code change, and the
// index can never list a chapter the page does not render. The property suite
// (tests/property/caseStudyChapters.property.test.js) holds that line.
//
// Pure: no React, no fs, no i18n. Titles are resolved by the caller.

/** The groups a `stack` chapter's items may belong to, in display order. */
export const STACK_GROUPS = Object.freeze(['languages', 'frameworks', 'libraries', 'tooling']);

/** Chapter types a `caseStudy.chapters` entry may declare, each at most once. */
export const AUTHORED_TYPES = Object.freeze([
  'overview',
  'statement',
  'walkthrough',
  'gallery',
  'architecture',
  'stack',
  'notes',
  'outcomes',
]);

/**
 * Types the short form adds itself when a project has no `caseStudy`:
 * `overview` from the listing fields, and `stack` from the repository's
 * languages when the committed map knows them. (Until the owner's review of
 * 2026-11-15 a `next` hand-off closed every list; it was removed in favour of
 * the stack chapter, which says what the project is built with.)
 */
export const DERIVED_TYPES = Object.freeze(['overview', 'stack']);

/** The fragment a chapter is served at: `/projects/theabdullahfolio#chapter-architecture`. */
export const chapterAnchor = (type) => `chapter-${type}`;

/**
 * Throws on a malformed `caseStudy`, naming the project and the problem. Run
 * at build (every project page is prerendered), so bad data fails `next build`
 * instead of rendering a page whose index points at nothing.
 */
export function assertCaseStudy(project) {
  const cs = project?.caseStudy;
  if (!cs) return;
  const where = `projects[${project.id}].caseStudy`;
  if (!Array.isArray(cs.chapters) || cs.chapters.length === 0) {
    throw new Error(`${where}.chapters must be a non-empty array`);
  }
  const seen = new Set();
  for (const chapter of cs.chapters) {
    if (!AUTHORED_TYPES.includes(chapter?.type)) {
      throw new Error(`${where}: unknown chapter type "${chapter?.type}"`);
    }
    if (seen.has(chapter.type)) {
      throw new Error(`${where}: chapter type "${chapter.type}" appears twice`);
    }
    seen.add(chapter.type);
    for (const key of ['steps', 'items', 'facts']) {
      const ids = (chapter[key] ?? []).map((entry) => entry?.id);
      if (ids.some((id) => !id)) throw new Error(`${where}.${chapter.type}.${key}: every entry needs an id`);
      if (new Set(ids).size !== ids.length) throw new Error(`${where}.${chapter.type}.${key}: duplicate id`);
    }
    if (chapter.type === 'stack') {
      if (!Array.isArray(chapter.items) || chapter.items.length === 0) {
        throw new Error(`${where}.stack.items must be a non-empty array`);
      }
      for (const item of chapter.items) {
        if (!STACK_GROUPS.includes(item.group)) {
          throw new Error(`${where}.stack.items.${item.id}: group must be one of ${STACK_GROUPS.join(', ')}`);
        }
        if (!item.label) throw new Error(`${where}.stack.items.${item.id}: needs a label`);
      }
    }
  }
}

/**
 * The ordered chapter list for a project.
 *
 * Full form (a `caseStudy` is present): the authored chapters in array order,
 * nothing added. Short form: `overview`, then `stack` when the repository's
 * languages are known. Both forms are one template; the short form is just
 * fewer chapters.
 *
 * @param {object} project a `projectsData` record (localised or not)
 * @param {{ hasLanguages?: boolean }} [options]
 * @returns {{ form: 'full' | 'short', chapters: { type: string, anchor: string, data: object | null }[] }}
 */
export function deriveChapters(project, { hasLanguages = false } = {}) {
  assertCaseStudy(project);
  const authored = project?.caseStudy?.chapters;
  const list = authored
    ? authored.map((c) => ({ type: c.type, data: c }))
    : [
        { type: 'overview', data: null },
        ...(hasLanguages ? [{ type: 'stack', data: null }] : []),
      ];
  return {
    form: authored ? 'full' : 'short',
    chapters: list.map((c) => ({ ...c, anchor: chapterAnchor(c.type) })),
  };
}

/**
 * The project after `project` in listing order, wrapped, and the one before.
 * Modulo, not a clamp: the first and last projects keep two neighbours each.
 * Used by the page's crawlable sibling navigation.
 */
export function siblingsOf(projects, project) {
  const index = projects.findIndex((p) => p.id === project.id);
  const n = projects.length;
  return {
    previous: projects[(index - 1 + n) % n],
    next: projects[(index + 1) % n],
  };
}
