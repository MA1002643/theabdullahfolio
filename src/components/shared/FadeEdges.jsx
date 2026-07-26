'use client';
import { motion, useTransform } from 'framer-motion';

/**
 * Left/right gradient masks that sit over a horizontally clipped strip to
 * signal "there is more content this way" (issue #47, §2 + §6.3).
 *
 * Each edge is tied to the strip's scroll progress so it only shows while
 * there is actually something hidden behind it: the left edge fades in as
 * soon as the strip has moved off its start, the right edge fades out as the
 * last item lands. Gradient + inset ember glow live in globals.css as
 * `.category-fade-left` / `.category-fade-right`.
 *
 * @param {object} props
 * @param {import('framer-motion').MotionValue<number>} props.progress
 *   Clamped 0 → 1 progress through the strip.
 */
const FadeEdges = ({ progress }) => {
  const leftOpacity = useTransform(progress, [0, 0.05], [0, 1]);
  const rightOpacity = useTransform(progress, [0.95, 1], [1, 0]);

  return (
    <>
      <motion.div
        aria-hidden
        style={{ opacity: leftOpacity }}
        className="category-fade-left pointer-events-none absolute inset-y-0 left-0 z-20 w-10"
      />
      <motion.div
        aria-hidden
        style={{ opacity: rightOpacity }}
        className="category-fade-right pointer-events-none absolute inset-y-0 right-0 z-20 w-10"
      />
    </>
  );
};

export default FadeEdges;
