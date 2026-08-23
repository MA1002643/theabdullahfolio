'use client';

import React from 'react';
import { motion } from 'framer-motion';

// The dot on the spine for one milestone. Not a whileInView island: `active`
// arrives from the owning TimelineNode so the ring draw, the icon pop, the
// connector and the card all fire off ONE trigger and can never drift apart.
//
// Activation choreography (all transform/opacity/stroke — GPU-composited):
//   1. the accent ring draws itself around the disc (SVG pathLength 0 → 1),
//   2. the type icon springs in at the centre,
//   3. a single expanding ping radiates and dies — once, not looping; the only
//      perpetual pulse on the page is the NOW beacon at the spine head.
// Reduced motion pins every value to its final state — the marker is simply
// there, ring closed, icon shown, no ping.
const MilestoneMarker = ({ accent, Icon, active, reduceMotion }) => {
  const shown = reduceMotion || active;
  return (
    <div
      aria-hidden
      className="relative flex h-10 w-10 items-center justify-center rounded-full transition-shadow duration-500"
      style={{
        // The disc backs onto the spine, so it needs its own near-black fill
        // to read as a node rather than a hole; the glow arrives only once
        // active so unvisited markers sit quiet in the dark.
        background: 'rgba(2, 6, 23, 0.85)',
        boxShadow: shown
          ? `0 0 12px ${accent}66, 0 0 26px ${accent}22`
          : 'none',
      }}
    >
      {/* Accent ring — starts at 12 o'clock (the -rotate-90) and draws
          clockwise. viewBox units, so the 2px stroke never changes with the
          rendered size. */}
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="2"
        />
        <motion.circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke={accent}
          strokeWidth="2"
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: shown ? 1 : 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.1 }
          }
        />
      </svg>

      {/* One-shot ping — mounted only for the animated path, so the reduced
          branch never even carries the element. */}
      {active && !reduceMotion && (
        <motion.span
          className="absolute inset-0 rounded-full border"
          style={{ borderColor: accent }}
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{ scale: 2.1, opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.5 }}
        />
      )}

      <motion.span
        className="relative flex items-center justify-center"
        style={{ color: accent }}
        initial={false}
        animate={
          shown ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 300, damping: 20, delay: 0.3 }
        }
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </motion.span>
    </div>
  );
};

export default MilestoneMarker;
