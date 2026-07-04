'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Home } from 'lucide-react';
import TransitionLink from '@/components/pageTransition/TransitionLink';

/**
 * Animated CTA back to the homepage. Reads as a "portal" — the
 * outer pulsing ring (framer-motion) creates a charging effect
 * and on hover the neon border thickens, the background warms,
 * and the home icon nudges left as a directional cue.
 *
 * The entrance delay (1.2s) is intentionally last in the page's
 * staggered reveal — 404 → subtitles → button — so the button
 * appears once the user has had a moment to read the void.
 *
 * Reduced-motion users:
 *   • Entrance: skip the slide/scale, button just appears (the
 *     stagger across the rest of the page still reads, since it
 *     uses delays via CSS transitions on opacity which are
 *     reduced-motion-safe per Motion's a11y guidance).
 *   • Pulsing ring: replaced with a static ring at low opacity
 *     so the "portal" visual hint remains, but no infinite
 *     transform/opacity oscillation runs.
 */
export default function ReturnPortal() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      // `initial={false}` makes framer render in the animate state
      // with no transition — clean way to skip the entrance for
      // reduced-motion users without losing the spec.
      initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : { delay: 1.2, duration: 0.5 }
      }
      className="relative inline-block"
    >
      <TransitionLink
        href="/"
        transitionLabel="Home"
        prefetch={false}
        className="group relative inline-flex items-center gap-3 rounded-full border border-[#ff6d05]/50 bg-black/60 px-8 py-4 font-mono text-sm tracking-wider transition-all duration-300 hover:border-[#ff6d05] hover:bg-[#ff6d05]/10 hover:shadow-[0_0_30px_#ff6d0540,0_0_60px_#ff6d0520] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        <Home
          className="elite-cta-icon h-4 w-4 transition-transform group-hover:-translate-x-1"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="elite-cta-text">TAKE ME BACK</span>
        {/* The pulsing ring is purely decorative. It sits on top of
            the link but is pointer-events:none so clicks/taps fall
            through to the Link underneath. */}
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full border border-[#ff6d05]/20"
          animate={
            prefersReducedMotion
              ? { scale: 1, opacity: 0.25 }
              : { scale: [1, 1.08, 1], opacity: [0.3, 0, 0.3] }
          }
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      </TransitionLink>
    </motion.div>
  );
}
