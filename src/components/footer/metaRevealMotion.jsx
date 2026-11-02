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
import { glyphUnits, wordChunks } from '@/components/ui/textSegments';

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
// real text is restored as visually-hidden content, so screen readers announce
// the word, never the individual letters.
//
// ── Why `sr-only` text and not `aria-label` on the wrapper ──────────────────
// The wrapper used to carry `aria-label={text}`, which reads as the obvious
// solution and is invalid: ARIA PROHIBITS `aria-label` on elements whose role
// is `generic` (a bare <span>) or `paragraph` (<p>) — the two tags this
// component is ever rendered as. A prohibited label is not merely untidy; it is
// permitted to be IGNORED, so the accessible name it was providing could
// silently not exist, leaving a screen reader to announce the per-glyph spans
// it was meant to replace.
//
// It was also the single thing capping this site's Lighthouse accessibility
// score at 96 on EVERY page, because the footer renders on every page and
// `aria-prohibited-attr` is scored all-or-nothing. Three instances — the sound
// label, the hover instruction and the copyright line — one component.
//
// Visually-hidden real text has none of those problems: it is content rather
// than an annotation, so no role permits or forbids it, every assistive
// technology reads it, and it survives a future change of `as`.
//
// ── Scripts that must not be cut per letter (issue #82) ─────────────────────
// Words come from `wordChunks` (identical to `split(' ')` for spaced text,
// dictionary-segmented for Chinese/Japanese so a translated line can still
// wrap) and the ticks inside a word from `glyphUnits`, which hands back the
// WHOLE word for Arabic-script and Devanagari text — a joined letter split
// into its own flap would lose its connected form. Those languages ripple word
// by word instead of letter by letter. See src/components/ui/textSegments.js.
export function SplitFlapText({ text, as: Tag = 'span', className }) {
  const words = wordChunks(text);
  return (
    <Tag className={className}>
      {/* The accessible copy. `sr-only` keeps it out of the visual layout
          entirely, so it cannot affect the flap cascade's metrics. */}
      <span className="sr-only">{text}</span>
      {words.map(({ word, gap }, wi) => (
        <Fragment key={wi}>
          {gap || null}
          <span
            aria-hidden="true"
            style={{ display: 'inline-flex', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}
          >
            {glyphUnits(word).map((ch, ci) => (
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
