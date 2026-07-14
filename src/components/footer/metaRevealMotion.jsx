'use client';

// Shared motion primitives for the footer meta-row "Split-Flap Cascade" reveal
// (issue #30 follow-up) — the option chosen from the /footer-reveal-preview
// chooser. It speaks the same split-flap vocabulary as the Manifest departures
// board: every glyph / element flips up from its baseline in a tight left-to-
// right ripple, a soft blur resolving as it settles.
//
// Usage: a parent element sets `variants={flapParent}` + initial/animate; every
// glyph or element that should flip carries `variants={flapChild}` (via
// SplitFlapText or FlapItem). framer-motion propagates the variant state AND
// orchestrates staggerChildren THROUGH the intervening non-motion DOM, so the
// whole row ripples from a single parent — no per-index delay plumbing. (Verified
// live on the preview: at t≈330ms the leading glyphs sit at ~0.9 opacity while
// the trailing ones are still 0.)

import { Fragment } from 'react';
import { motion } from 'framer-motion';

export const FLAP_EASE = [0.22, 1, 0.36, 1];

// Parent: ripples its (possibly deeply-nested) flap children left→right.
export const flapParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.028, delayChildren: 0.1 } },
};

// One glyph / element: the split-flap "tick" — flips up from a bottom hinge with
// a blur that resolves as it lands.
export const flapChild = {
  hidden: { opacity: 0, rotateX: -90, y: 8, filter: 'blur(4px)' },
  show: {
    opacity: 1,
    rotateX: 0,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.5, ease: FLAP_EASE },
  },
};

// rotateX needs perspective + a bottom-edge hinge to read as a physical flap.
const GLYPH_STYLE = {
  display: 'inline-block',
  transformOrigin: '50% 100%',
  transformPerspective: 500,
};

// Wrap ONE element (the speaker button, the equalizer, the divider) as a single
// flap tick, so it joins the cascade without being split per-glyph.
export function FlapItem({ children, className }) {
  return (
    <motion.span variants={flapChild} className={className} style={GLYPH_STYLE}>
      {children}
    </motion.span>
  );
}

// Render `text` as per-glyph flap ticks. Split into words so a line break only
// ever falls BETWEEN words (glyphs within a word stay together); the breakable
// space lives outside each nowrap word. The letters are aria-hidden and the
// accessible name is restored on the wrapper, so screen readers announce the
// word, never the individual letters.
export function SplitFlapText({ text, as: Tag = 'span', className }) {
  const words = text.split(' ');
  return (
    <Tag className={className} aria-label={text}>
      {words.map((word, wi) => (
        <Fragment key={wi}>
          {wi > 0 ? ' ' : null}
          <span
            aria-hidden="true"
            style={{ display: 'inline-flex', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}
          >
            {Array.from(word).map((ch, ci) => (
              <motion.span key={ci} variants={flapChild} style={GLYPH_STYLE}>
                {ch}
              </motion.span>
            ))}
          </span>
        </Fragment>
      ))}
    </Tag>
  );
}
