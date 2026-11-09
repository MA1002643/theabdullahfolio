// The entrance sweep of the two /about score arcs, the rank arc on the GitHub
// stats card and the activity arc on the repo card (issue #200).
//
// Declarative on purpose. Both arcs used to drive `useAnimation` controls
// from an effect on `playToken`: `controls.set` to empty, then `controls.start`
// to the fill. Controls reach only an element whose visual element has
// subscribed to them, and on LazyMotion that element has none until the
// features chunk lands. A viewport trigger that fired first was lost, and the
// chunk's arrival did not rerun the effect, so the arc stayed empty until the
// card left and re-entered the viewport.
//
// Props describe the end state instead, and the circle remounts once per play
// (`key`). A fresh element starts empty (`initial`) and animates to the fill
// (`animate`), whenever the renderer is ready: framer plays a mount entrance
// it missed when the features arrive. In the static fallback (no features at
// all, src/components/motion/MotionFeatures.jsx) the same props render the
// fill outright once the card has played.
//
// Before the first play (`playToken === 0`) the arc rests empty. Under reduced
// motion it rests at its fill and never remounts. A change of score during a
// play animates from where the arc is to the new fill; it does not replay the
// sweep from empty.

/**
 * @param {{ playToken: number, finalOffset: number, circumference: number, prefersReducedMotion: boolean }} input
 * @returns {{ key: string, initial: { strokeDashoffset: number }, animate: { strokeDashoffset: number } }}
 *   `key` goes on the element directly (React does not take a spread key).
 */
export function arcSweep({ playToken, finalOffset, circumference, prefersReducedMotion }) {
  if (prefersReducedMotion) {
    return { key: 'still', initial: { strokeDashoffset: finalOffset }, animate: { strokeDashoffset: finalOffset } };
  }
  return {
    key: `play-${playToken}`,
    initial: { strokeDashoffset: circumference },
    animate: { strokeDashoffset: playToken > 0 ? finalOffset : circumference },
  };
}
