'use client';

import { useContext } from 'react';
import {
  MotionConfigContext,
  useReducedMotion as useOsReducedMotion,
} from 'framer-motion';

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
// provider. So: "always" wins, anything else defers to the OS — outside a
// MotionConfig this is exactly framer's useReducedMotion, and inside one it
// is the toggle. Components in a tree that may sit under a MotionConfig
// import this; the rest of the site's framer imports are equivalent today.
export function useReducedMotion() {
  const os = useOsReducedMotion();
  const { reducedMotion } = useContext(MotionConfigContext);
  return reducedMotion === 'always' ? true : os;
}
