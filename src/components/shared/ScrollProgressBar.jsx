'use client';
import { motion } from 'framer-motion';

/**
 * Thin ember progress bar that sits under a scroll-hijacked strip and shows
 * how far through it the page scroll has travelled (issue #47, §2).
 *
 * Driven straight off a MotionValue rather than React state: the bar is
 * repainted by Framer Motion's own rAF loop on a transform-only property
 * (`scaleX`), so a hijack scroll never re-renders the React tree.
 *
 * @param {object}   props
 * @param {import('framer-motion').MotionValue<number>} props.progress
 *   Clamped 0 → 1 progress through the strip.
 * @param {string}  [props.className] Extra classes for the track element.
 */
const ScrollProgressBar = ({ progress, className = '' }) => (
  <div
    aria-hidden
    className={`mt-3 h-[2px] w-full overflow-hidden rounded-full bg-white/10 ${className}`}
  >
    <motion.div
      className="h-full w-full rounded-full"
      style={{
        scaleX: progress,
        transformOrigin: 'left',
        // Ember gradient + halo, matching the active-tab palette
        // (#ff6d05) used by both category rows.
        background: 'linear-gradient(90deg, #ff6d05, #eab53e, #ff6d05)',
        boxShadow: '0 0 6px #ff6d05, 0 0 12px rgba(255, 109, 5, 0.4)',
      }}
    />
  </div>
);

export default ScrollProgressBar;
