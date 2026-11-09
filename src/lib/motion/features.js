import { domAnimation } from 'framer-motion';

// framer-motion's animation features, split out of every route's first load
// (issue #200). `domAnimation` is animate / variants / exit / hover / tap /
// focus / inView: everything the site's `m.*` components use except layout
// projection, which only the guestbook wall needs (./layoutFeatures.js).
//
// Reached ONLY through the `import()` in ./loadFeatures.js. A static import of
// this file, or of `domAnimation` itself, anywhere else merges the features
// back into the first load; tests/fitness/lazyMotion.test.js fails on either.
export default domAnimation;
