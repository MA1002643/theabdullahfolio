// The presence value the site's static motion mode hands every `m.*` element
// (issue #200). Shared by <MotionFeatures> and the site's <AnimatePresence>.
//
// `initial: false` is framer's own "initial animation blocked" signal: an
// element then seeds its style from its `animate` target (the LAST keyframe of
// an array) instead of from `initial`. Under `MotionConfig isStatic` framer
// recomputes that style on every render, from props alone, without the
// renderer the features chunk would have brought. Together they render the
// page at its end state, and a reveal gate that opens later (a loader, a
// viewport trigger) still takes effect, because it re-renders the element.
//
// `isPresent: true` and a no-op `register`: in static mode nothing registers
// an exit animation, so an <AnimatePresence> removes a leaving child at once.
export const STATIC_PRESENCE = Object.freeze({
  id: 'motion-static',
  initial: false,
  isPresent: true,
  custom: undefined,
  onExitComplete: undefined,
  register: () => () => {},
});
