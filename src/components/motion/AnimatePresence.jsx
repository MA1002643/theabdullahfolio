'use client';

import { Children, isValidElement } from 'react';
import { AnimatePresence as FramerAnimatePresence, PresenceContext } from 'framer-motion';

import { STATIC_PRESENCE } from './staticMotion';
import { useStaticMotion } from './useStaticMotion';

// The site's <AnimatePresence> (issue #200). Every file imports this one, not
// framer's (tests/fitness/lazyMotion.test.js).
//
// Normally it IS framer's. It differs only in the static motion mode that
// <MotionFeatures> enters when the animation features never arrive. framer's
// AnimatePresence gives each child its own presence context, and a child that
// mounts after the first render gets `initial: undefined` there, which
// overrides the static presence above it. A dialog opened after the fallback
// would then render at its `initial` style, invisible, while it took focus and
// locked scrolling. So in static mode each child is handed the static presence
// again, inside framer's own boundary. framer still decides which children
// are mounted, and runs `onExitComplete` and `mode="wait"`. With no renderer,
// nothing registers an exit, so a leaving child goes at once.
export function AnimatePresence({ children, ...props }) {
  if (!useStaticMotion()) return <FramerAnimatePresence {...props}>{children}</FramerAnimatePresence>;
  return (
    <FramerAnimatePresence {...props}>
      {Children.map(children, (child) =>
        isValidElement(child) ? (
          <PresenceContext.Provider key={child.key} value={STATIC_PRESENCE}>
            {child}
          </PresenceContext.Provider>
        ) : (
          child
        ),
      )}
    </FramerAnimatePresence>
  );
}
