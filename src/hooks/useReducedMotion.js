'use client';

import { useContext, useSyncExternalStore } from 'react';
import { MotionConfigContext } from 'framer-motion';

// Reduced motion as a component should read it: the OS preference, OR a
// MotionConfig above saying reducedMotion="always" — the guestbook page's
// manual toggle (⌘K → Toggle motion).
//
// Why not framer's own hook (code review): framer's useReducedMotion reads
// the OS media query alone. MotionConfig reaches motion.* animations through
// a different path, so every `reduceMotion ? … : …` branch a component
// writes — the presence ping, the ember burst, the count-ups, the signature
// draw-on, the panel slides — ignored the toggle entirely, however stilled
// the motion.* props around it were. Why not framer's useReducedMotionConfig:
// under the DEFAULT context (reducedMotion "never") it answers false whatever
// the OS says, which would silence the OS preference on every page without a
// provider. So: "always" wins, anything else defers to the OS.
//
// ── Hydration-safe (issue #92) ──────────────────────────────────────────────
// Framer's hook returns the REAL preference on the very first client render,
// while the server (which has no media query) rendered as if motion were on.
// Every `initial={reduced ? a : b}` therefore produced different markup on the
// two sides, and React threw hydration errors #418/#423/#425 on EVERY page for
// every visitor with reduced motion set (found by the browser suites' error
// sentinel, once they genuinely emulated the preference).
//
// useSyncExternalStore is React's sanctioned shape for exactly this: during
// hydration React uses getServerSnapshot (false, matching the server), then
// re-renders with the live value, and it re-subscribes if the preference
// changes while the page is open. The one-frame window between those renders
// is covered by the root <MotionConfig reducedMotion="user"> in layout.js,
// which stops framer animating transforms for these visitors no matter what
// a component's first render asked for.
//
// Every component must read the preference through THIS hook, never
// framer-motion's directly: tests/fitness/reducedMotionHook.test.js enforces it.
const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  if (mql.addEventListener) mql.addEventListener('change', onChange);
  else mql.addListener(onChange); // Safari < 14
  return () => {
    if (mql.removeEventListener) mql.removeEventListener('change', onChange);
    else mql.removeListener(onChange);
  };
}

const getSnapshot = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;

// What the server rendered: no media query there, so motion is "on".
const getServerSnapshot = () => false;

export function useReducedMotion() {
  const os = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { reducedMotion } = useContext(MotionConfigContext);
  return reducedMotion === 'always' ? true : os;
}
