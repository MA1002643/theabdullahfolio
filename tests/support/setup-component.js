import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { toast } from 'sonner';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { MSW_LISTEN_OPTIONS, server } from './msw/server.js';

// Setup for the `component` Vitest project (issue #92, L3): jsdom, Testing
// Library's DOM matchers, and the shared MSW server.
//
// jsdom implements the DOM, not layout or the newer browser APIs, and the
// components here reach for several of them on mount. Each polyfill below is
// the SMALLEST stand-in that lets the real component code run. None fakes a
// behaviour a test asserts on: anything a test cares about (network, storage,
// online state) is driven explicitly by that test instead.

// matchMedia: framer-motion's useReducedMotion and the pointer-capability hooks
// query it on mount. Reporting "no match" is the desktop, motion-allowed
// default; a test that needs reduced motion overrides it.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

// IntersectionObserver / ResizeObserver: in-view reveals and fluid measurements.
// jsdom has no layout, so an observer that never fires is the honest model.
class InertObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
window.IntersectionObserver ??= InertObserver;
window.ResizeObserver ??= InertObserver;

// SVG getBBox: the contact button's SENDING… label measures its own text before
// paint. jsdom has no text metrics, so a fixed box stands in.
if (typeof window.SVGElement !== 'undefined' && !window.SVGElement.prototype.getBBox) {
  window.SVGElement.prototype.getBBox = () => ({ x: 0, y: -12, width: 80, height: 16 });
}

// Framer Motion: every animation completes on its first frame. The form fades
// in from opacity 0, and `toBeVisible` checks ancestor opacity, so without this
// a visibility assertion passes or fails depending on how far an entrance tween
// had run when the query landed: a timing flake, found in this suite's first
// runs. Motion is the browser layers' concern (tests/a11y/motion.spec.js); a
// component test asserts what the component SAYS, once it has said it.
MotionGlobalConfig.skipAnimations = true;

// scrollTo / scrollIntoView: called by focus management; jsdom stubs neither.
window.scrollTo ??= () => {};
window.HTMLElement.prototype.scrollIntoView ??= function scrollIntoView() {};

beforeAll(() => server.listen(MSW_LISTEN_OPTIONS));
afterEach(() => {
  cleanup();
  // sonner's toast store is module state that outlives any <Toaster>, and
  // since sonner 2 a newly mounted <Toaster> replays every toast still active
  // in it. Without this, the next test's Toaster shows the last test's
  // "Message sent successfully!" too, and a text query finds two (#207).
  // Dismissing after cleanup() means no Toaster is subscribed, so nothing
  // re-renders outside act().
  toast.dismiss();
  server.resetHandlers();
  window.localStorage.clear();
  vi.restoreAllMocks();
});
afterAll(() => server.close());
