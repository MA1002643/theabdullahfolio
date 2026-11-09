import { domMax } from 'framer-motion';

// `domMax`: `domAnimation` plus drag and layout projection (issue #200). Only
// one component on the site animates its layout, the guestbook wall's message
// card (`layout` smooths the reflow when a card lands or leaves), so only the
// guestbook route loads this, through <LayoutMotionFeatures> around the wall.
// Loading it globally would hand every visitor the projection engine to save
// one route a request, which is most of what issue #200 takes out.
//
// Reached ONLY through the `import()` in ./loadFeatures.js
// (tests/fitness/lazyMotion.test.js).
export default domMax;
