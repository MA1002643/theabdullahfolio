// The live Ember Passage, as ONE async chunk (issue #55).
//
// Everything here only ever runs after a click: the overlay's rAF loop, the
// WebGL swarm and its shader, and the 90k-ember target field. None of it is
// needed to paint or hydrate a page, so PageTransitionProvider reaches it only
// through `import('./passageRuntime')`, fetched in idle time, and every route's
// first load is lighter by the whole module graph.
//
// The provider still owns the phase machine and the context, which are small
// and must be there from the first render (every TransitionLink consumes
// them). PassageStill stays eager too: it is what a reduced-motion visitor
// sees, and what a click that beats the download sees.
//
// Reach these names through this module only: tests/fitness/deferredChunks.test.js
// fails on a static import that would pull them back into the first load.

export { default as EmberPassageOverlay } from './EmberPassageOverlay';
export { warmSwarm } from './emberSwarm';
export { warmEmberField } from './emberField';
