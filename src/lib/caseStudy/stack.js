// The "Built with" chapter's shape (issue #31, owner review 2026-11-15).
//
// A full case study authors its stack in data.js: a flat list of items, each
// in one of STACK_GROUPS, so the Data catalogue mirrors `label` and `body` by
// the item's id exactly as it does for every other chapter (no new mirroring
// rule in scripts/i18n-data.mjs). The short form has no authored list and
// shows the repository's languages from the committed GitHub map instead,
// through the same tiles. Both paths meet in `groupStack`.
//
// Pure: no React, no fs. Versions are resolved separately, server-side, by
// src/lib/caseStudy/versions.js.

import { STACK_GROUPS } from './chapters';

/**
 * GitHub language names → icon slugs (src/components/case-study/stackIcons.js).
 * A language not listed here renders a monogram tile; nothing breaks.
 */
export const LANGUAGE_ICONS = Object.freeze({
  JavaScript: 'javascript',
  TypeScript: 'typescript',
  CSS: 'css',
  HTML: 'html',
  Shell: 'shell',
  Vue: 'vue',
  PHP: 'php',
  Python: 'python',
  GLSL: 'glsl',
  Dockerfile: 'docker',
});

const slugOf = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'language';

/**
 * Short-form items from the repository's language names, most used first
 * (the order `languagesFor` returns). Names are proper nouns and stay as
 * GitHub spells them.
 *
 * @param {string[]} languages
 */
export function languageStackItems(languages = []) {
  return languages.map((name) => ({
    id: slugOf(name),
    group: 'languages',
    label: name,
    icon: LANGUAGE_ICONS[name] ?? null,
  }));
}

/**
 * Items bucketed by group, in STACK_GROUPS order, with empty groups dropped
 * and each group's items in authored order.
 *
 * @template T
 * @param {(T & { group: string })[]} items
 * @returns {{ group: string, items: T[] }[]}
 */
export function groupStack(items = []) {
  return STACK_GROUPS.map((group) => ({ group, items: items.filter((item) => item.group === group) })).filter(
    (g) => g.items.length > 0,
  );
}
