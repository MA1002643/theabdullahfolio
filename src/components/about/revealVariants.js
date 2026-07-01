// Shared entrance variants for the about-page feature cards. Defined once here
// so the "Most Active Repository" card and the "Projects shipped" / "Years in
// the craft" cards reveal with the IDENTICAL gesture when they enter view: the
// whole card springs up + fades in (and settles from a slight 0.97 scale) while
// its children stagger up one after another. A single source of truth keeps the
// three cards in lockstep instead of drifting as copies.

// ----- Card-level container -----
// `staggerChildren` + `delayChildren` cascade the children below; the spring
// gives the card a soft, weighty landing rather than a linear slide.
export const cardVariants = {
  hidden: { opacity: 0, y: 56, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 70,
      damping: 18,
      staggerChildren: 0.07,
      delayChildren: 0.15,
    },
  },
};

// ----- Per-child fade-up -----
// Applied to each direct child that should participate in the stagger (eyebrow,
// the big figure, the split bar). Inherits its play state from the card-level
// container above via Framer Motion variant propagation.
export const childVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 120, damping: 20 },
  },
};
