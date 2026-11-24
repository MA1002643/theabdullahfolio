// Motion tokens for the project case study (issue #31, §5).
//
// Every movement on /projects/[id] reads its timing from here, so the page
// moves with one voice: one entrance curve, one stagger rhythm, one distance.
// Tune by eye HERE, never inline in a component.

export const ease = Object.freeze({
  /** The house entrance curve: fast out of the gate, a long settle. */
  out: [0.22, 1, 0.36, 1],
  /** For movements that both start and stop on screen (the index indicator). */
  inOut: [0.65, 0, 0.35, 1],
});

/** Durations in seconds. */
export const dur = Object.freeze({
  micro: 0.18,
  base: 0.45,
  slow: 0.8,
  hero: 1.1,
});

/** Stagger steps in seconds. */
export const stagger = Object.freeze({
  word: 0.03,
  line: 0.08,
  item: 0.06,
});

/**
 * Rise distance in px at fluid scale 1. Entrances use a fixed px value rather
 * than reading --fluid-scale per element: 24px is felt at every width and the
 * difference between 14px and 31px is not.
 */
export const distance = Object.freeze({ rise: 24 });

/**
 * A critically damped spring (damping = 2·√(stiffness·mass)): reaches its
 * target as fast as possible with no overshoot. For anything that follows the
 * pointer; nothing on this page bounces.
 */
export const springFollow = Object.freeze({
  stiffness: 170,
  mass: 1,
  damping: 2 * Math.sqrt(170 * 1),
});

/** The entrance transition for the `order`-th element of a chapter. */
export const riseTransition = (order = 0) => ({
  duration: dur.slow,
  ease: ease.out,
  delay: order * stagger.line,
});
