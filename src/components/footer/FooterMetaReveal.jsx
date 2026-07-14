'use client';

// Footer meta row (issue #30 follow-up) — the "Split-Flap Cascade" reveal.
//
// Replaces the meta row's old plain 14px-rise fade. On reveal, the whole row —
// the SOUND toggle cluster and the copyright — ripples in glyph-by-glyph, left
// to right, each character flipping up from its baseline with a resolving blur.
// It is the same split-flap language as the Manifest departures board, chosen
// from the /footer-reveal-preview chooser.
//
// Gating matches the reach strip directly above it (NOT the once-latching
// FooterReveal blocks): it fires only when the row is genuinely on screen and
// after the intro loader has lifted, and it re-arms when the row scrolls fully
// out of view — so on this persistent footer the cascade can never be "spent"
// off-screen (behind the loader / a page-transition overlay, or on a transient
// route-swap peek) and always plays when the visitor actually reaches it. Under
// prefers-reduced-motion it collapses to a plain block fade — no flipping.

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { useFooterReveal } from './useFooterReveal';
import { cn } from '@/lib/utils';
import SoundControl from './SoundControl';
import { flapParent, FLAP_EASE, SplitFlapText } from './metaRevealMotion';

// Centred on a phone (per the mobile brief), left-aligned from `sm` up.
const COPY_CLASS =
  'text-center text-[0.72rem] uppercase tracking-[0.2em] text-[#ff6d05] sm:text-left';

// Reduced-motion: the parent's own opacity fades the whole (plain) subtree — no
// per-glyph orchestration.
const fadeBlock = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.3 } },
};

export default function FooterMetaReveal({
  className,
  reduced,
  soundOn,
  onToggle,
  canHover,
  copyright,
}) {
  const ref = useRef(null);

  // Fire only when the row is GENUINELY on screen (0.6) and re-arm once it is
  // fully out of view — the shared footer gate (see useFooterReveal), so on this
  // persistent footer the cascade is never spent by a page-transition transient
  // and always plays when the visitor actually scrolls down to it.
  const show = useFooterReveal(ref, 0.6);

  return (
    <motion.div
      ref={ref}
      className={cn('relative', className)}
      variants={reduced ? fadeBlock : flapParent}
      initial="hidden"
      animate={show ? 'show' : 'hidden'}
    >
      {/* The signature ember hairline. Its base is a dim rule; on reveal a bright
          rule ignites and draws itself in left→right (scaleX) ahead of the glyph
          cascade — the opening beat of the chosen "Split-Flap Cascade". It sets
          its OWN `animate` so it runs on this 0.55s timeline instead of being
          swept up as one more staggered flap tick. Under reduced motion only the
          static dim rule remains — no draw-in. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[#ff6d05]/25"
      />
      {!reduced && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left bg-[#ff6d05] shadow-[0_0_10px_#ff6d05]"
          initial={{ scaleX: 0 }}
          animate={show ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 0.55, ease: FLAP_EASE }}
        />
      )}
      <SoundControl
        soundOn={soundOn}
        onToggle={onToggle}
        canHover={canHover}
        revealMode={!reduced}
      />
      {reduced ? (
        <p className={COPY_CLASS}>{copyright}</p>
      ) : (
        <SplitFlapText as="p" text={copyright} className={COPY_CLASS} />
      )}
    </motion.div>
  );
}
