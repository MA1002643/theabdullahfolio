import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { read, stripComments, walk } from '../support/source.js';

// framer-motion stays on LazyMotion (issue #200).
//
// The site renders `m.*`, not `motion.*`, and the animation features load in
// their own chunk after the first paint (src/components/motion/MotionFeatures.jsx).
// Measured on 2026-11-09, that, plus keeping the animation engine out of the
// root layout, took about 32 kB gzip off every route's first load. Any one of
// these would quietly give a slice of it back, and the bundle budget's 10 %
// headroom is wider than each slice, so nothing else would notice:
//
//   - a `motion` import anywhere: the full feature bundle rides with it
//     (LazyMotion `strict` throws in development, but only on a rendered path);
//   - a static import of the feature modules, or of `domAnimation` / `domMax`
//     outside them: the features merge back into the importing chunk;
//   - an engine-importing API (`animate`, `useSpring`, `useAnimation`, …) in a
//     file every route loads: the engine, about 16 kB, back on every route.
//     Route-local users (/about's count-ups, /uses) cost only their own route
//     and are allowed.

const SOURCES = walk('src', /\.(m?js|jsx)$/);
const FILES = new Set(SOURCES);

// Every import of framer-motion (or a subpath), with its named specifiers.
const FRAMER_IMPORT = /(?:^|[;\s])import\s+([^'";]*?)\s+from\s+['"](framer-motion(?:\/[^'"]*)?|motion(?:\/[^'"]*)?)['"]/g;

function framerImports(file) {
  const code = stripComments(read(file));
  return [...code.matchAll(FRAMER_IMPORT)].map((match) => {
    const clause = match[1];
    const named = clause.match(/\{([^}]*)\}/)?.[1] ?? '';
    return {
      source: match[2],
      namespace: /\*\s+as\s+/.test(clause),
      // `motion as Motion` → the IMPORTED name, `motion`.
      names: named
        .split(',')
        .map((spec) => spec.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean),
    };
  });
}

const FEATURE_MODULES = ['src/lib/motion/features.js', 'src/lib/motion/layoutFeatures.js'];
const FEATURE_BUNDLES = ['domAnimation', 'domMax', 'domMin'];

// framer APIs whose import pulls the animation engine (JSAnimation, the WAAPI
// transforms, keyframe resolvers, and for `animate()` the DOM renderer too)
// into the importing chunk. Measured 2026-11-09: the intro loader's
// `animate()` alone held about 16 kB in every route's first load.
//
// `useSpring` is NOT listed, and that is measured too: the root layout's
// custom cursor, intro seal and footer CTA all use it, and deferring the
// cursor moved no route by more than 0.5 kB. Its spring path does not reach
// the engine. Hooks that only derive or read values (useTransform,
// useMotionValue, useScroll, useInView, useMotionTemplate) do not either, nor
// do `m`, AnimatePresence, MotionConfig or the easing utilities.
const ENGINE = [
  'motion',
  'animate',
  'animateMini',
  'useAnimate',
  'useAnimateMini',
  'useAnimation',
  'useAnimationControls',
  'animationControls',
  'animateValue',
  ...FEATURE_BUNDLES,
];

// The layouts every route renders. Their static graph is the shared floor.
const ROOT_LAYOUTS = [
  'src/app/[locale]/layout.js',
  'src/app/[locale]/(home)/layout.js',
  'src/app/[locale]/(sub pages)/layout.js',
];

function resolve(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.posix.join('src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.posix.join(path.posix.dirname(from), spec);
  else return null;
  return ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'].map((ext) => base + ext).find((f) => FILES.has(f)) ?? null;
}

const STATIC_IMPORT = /(?:^|[;\s])(?:import|export)\s+(?:[^'"()]*?\sfrom\s+)?['"]([^'"]+)['"]/g;

/** Every src file reachable from `entries` through static imports alone. */
function staticGraph(entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, spec] of stripComments(read(file)).matchAll(STATIC_IMPORT)) {
      const target = resolve(file, spec);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

describe('framer-motion on LazyMotion', () => {
  it('imports no `motion` component, and no namespace that would include it', () => {
    const offenders = SOURCES.flatMap((file) =>
      framerImports(file)
        .filter(({ source, namespace, names }) => source !== 'framer-motion' || namespace || names.includes('motion'))
        .map(({ source }) => `${file} (${source})`),
    );
    expect(
      offenders,
      'Render `m.*` (and `m.create(X)`) from `framer-motion` instead: `motion` carries every animation ' +
        'feature into the first load. scripts/codemods/lazy-motion.mjs rewrites a file mechanically.',
    ).toEqual([]);
  });

  it('imports the feature bundles only in the feature modules', () => {
    const offenders = SOURCES.filter((file) => !FEATURE_MODULES.includes(file)).flatMap((file) =>
      framerImports(file).flatMap(({ names }) =>
        names.filter((name) => FEATURE_BUNDLES.includes(name)).map((name) => `${file} → ${name}`),
      ),
    );
    expect(offenders, 'Load features through src/lib/motion/loadFeatures.js, never statically.').toEqual([]);
  });

  it('reaches the feature modules only through import() in the loader', () => {
    const dynamicUsers = SOURCES.filter((file) =>
      [...stripComments(read(file)).matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].some(([, spec]) =>
        FEATURE_MODULES.includes(resolve(file, spec)),
      ),
    );
    expect(dynamicUsers).toEqual(['src/lib/motion/loadFeatures.js']);
    const staticUsers = SOURCES.filter((file) =>
      [...stripComments(read(file)).matchAll(STATIC_IMPORT)].some(([, spec]) => FEATURE_MODULES.includes(resolve(file, spec))),
    );
    expect(staticUsers).toEqual([]);
  });

  it('keeps the animation engine out of every route’s static graph', () => {
    for (const layout of ROOT_LAYOUTS) expect(FILES.has(layout), layout).toBe(true);
    const shared = [...staticGraph(ROOT_LAYOUTS)].sort();
    // The walk must actually reach the chrome, or this rule guards nothing.
    expect(shared).toContain('src/components/loaderWrapper/index.jsx');
    expect(shared).toContain('src/components/motion/MotionFeatures.jsx');
    const offenders = shared.flatMap((file) =>
      framerImports(file).flatMap(({ names }) =>
        names.filter((name) => ENGINE.includes(name)).map((name) => `${file} → ${name}`),
      ),
    );
    expect(
      offenders,
      'These are in every route’s first load and import framer’s animation engine. Tween a motion ' +
        'value with src/lib/motion/tweenValue.js, drive it with `m` props, or defer the component ' +
        '(src/lib/deferredChunk.js).',
    ).toEqual([]);
  });

  it('mounts a strict LazyMotion in the root layout', () => {
    const layout = stripComments(read('src/app/[locale]/layout.js'));
    expect(layout).toMatch(/<MotionFeatures>/);
    const provider = stripComments(read('src/components/motion/MotionFeatures.jsx'));
    expect(provider.match(/<LazyMotion\b[^>]*\bstrict\b/g)?.length).toBe(2);
  });
});
