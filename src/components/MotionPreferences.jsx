'use client';

import { MotionConfig } from 'framer-motion';

// Site-wide reduced-motion floor (issue #92). `reducedMotion="user"` makes
// framer-motion honour the visitor's OS preference itself: transform and
// layout animations are skipped for anyone with reduced motion set, whatever a
// component's props ask for. Opacity and colour still animate, so content can
// still fade in rather than snap.
//
// It exists for one frame in particular. useReducedMotion is hydration-safe,
// so its FIRST client render reports "motion on" to match the server, and only
// the re-render after hydration reports the truth. A component that chose its
// `initial` from that first value would otherwise slide for a frame; under
// this config it cannot. Nested MotionConfigs (the guestbook's manual motion
// toggle) still override it for their own subtree.
export default function MotionPreferences({ children }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
