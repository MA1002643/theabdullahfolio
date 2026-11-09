import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { read, stripComments, walk } from '../support/source.js';

// Modules that must stay OUT of every route's first load (issue #55).
//
// Each is reached through `import()`, so webpack splits it into its own async
// chunk. One ordinary `import … from` of the same module anywhere in a page's
// static graph merges it straight back into the first load, and nothing else
// would notice: the bundle budget keeps 10 % headroom, which is more than
// these modules weigh. So the rule is checked here, on the source.
//
// Each entry names the only files allowed to import it statically: the
// modules inside the same deferred graph, which are themselves only reached
// through the `import()`.

const DEFERRED = {
  // The live Ember Passage: shared by every route before #55.
  'src/components/pageTransition/passageRuntime.js': [],
  'src/components/pageTransition/EmberPassageOverlay.jsx': ['src/components/pageTransition/passageRuntime.js'],
  'src/components/pageTransition/emberSwarm.js': [
    'src/components/pageTransition/passageRuntime.js',
    'src/components/pageTransition/EmberPassageOverlay.jsx',
  ],
  'src/components/pageTransition/emberSwarmShader.js': ['src/components/pageTransition/emberSwarm.js'],
  'src/components/pageTransition/emberField.js': [
    'src/components/pageTransition/passageRuntime.js',
    'src/components/pageTransition/emberSwarm.js',
  ],
  // The /about dialogs: a third of that route's own code before #55.
  'src/components/about/ExperienceBreakdownModal.jsx': [],
  'src/components/about/ProjectProgressPopup.jsx': [],
  // framer-motion's animation features (issue #200), loaded after the first
  // paint by src/lib/motion/loadFeatures.js.
  'src/lib/motion/features.js': [],
  'src/lib/motion/layoutFeatures.js': [],
};

// The entry points, each of which must actually be loaded lazily somewhere,
// or the rule above guards a split that no longer exists.
const ENTRIES = [
  'src/components/pageTransition/passageRuntime.js',
  'src/components/about/ExperienceBreakdownModal.jsx',
  'src/components/about/ProjectProgressPopup.jsx',
  'src/lib/motion/features.js',
  'src/lib/motion/layoutFeatures.js',
];

const SOURCES = walk('src', /\.(m?js|jsx)$/);
const FILES = new Set(SOURCES);

// `./x`, `../x` and `@/x` to a repo path, trying the extensions the tree uses.
function resolve(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.posix.join('src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.posix.join(path.posix.dirname(from), spec);
  else return null;
  return ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'].map((ext) => base + ext).find((f) => FILES.has(f)) ?? null;
}

const graph = SOURCES.map((file) => {
  const code = stripComments(read(file));
  const spec = (re) => [...code.matchAll(re)].map((m) => resolve(file, m[1])).filter(Boolean);
  return {
    file,
    // `import x from`, `import {…} from`, `export {…} from`, bare `import '…'`.
    statics: spec(/(?:^|[;\s])(?:import|export)\s+(?:[^'"()]*?\sfrom\s+)?['"]([^'"]+)['"]/g),
    dynamics: spec(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
  };
});

describe('deferred chunks', () => {
  it('are never imported statically from outside their own graph', () => {
    const offenders = [];
    for (const { file, statics } of graph) {
      for (const target of statics) {
        const allowed = DEFERRED[target];
        if (allowed && !allowed.includes(file)) offenders.push(`${file} → ${target}`);
      }
    }
    expect(
      offenders,
      'These imports pull a deferred module back into a route’s first load. Reach it through ' +
        'its `import()` (src/lib/deferredChunk.js) instead.',
    ).toEqual([]);
  });

  it('each entry point is still loaded through import()', () => {
    const lazilyLoaded = new Set(graph.flatMap(({ dynamics }) => dynamics));
    for (const entry of ENTRIES) expect(lazilyLoaded.has(entry), entry).toBe(true);
  });

  it('every listed module exists (a renamed file would make the rule vacuous)', () => {
    for (const file of Object.keys(DEFERRED)) expect(FILES.has(file), file).toBe(true);
  });
});
