'use client';

import { Fragment, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { wordFill } from '@/lib/fireRamp';

// The contact-page intro copy. It lives here (not in the server `page.js`)
// because the reveal below is a client interaction; the page renders this
// component in the paragraph's place and hands it the same typographic classes.
const INTRO =
  'Step into the circle of enchantment and weave your words into the fabric ' +
  'of the cosmos. Whether you seek to conjure collaborations, unlock ' +
  'mysteries, or simply share tales of adventure, your messages are treasured ' +
  'scrolls within this realm. Use the form below to send your missives through ' +
  'the ethereal network, and await the whisper of magic in response.';

// Per-word stagger, in seconds. ~58 words × 0.03 ≈ a 1.7s left→right wave —
// clearly a wave (the "wow"), but confident rather than draggy. Tunable here.
const STAGGER = 0.03;

// The gold→ember fill is applied PER WORD via `wordFill` (@/lib/fireRamp): once
// the copy is split into child spans for the reveal, a `background-clip:text`
// fill on the parent doesn't inherit, so each word must carry its own clip.
// Sampling the shared ramp by word position also darkens the copy gold→ember
// from the first word to the last (the effect the About paragraph shares). The
// parent keeps `.text-fire-amber` only for its drop-shadow halo (a filter, which
// DOES apply to descendants).

// "Materialize from the ether" — each word condenses out of a soft blur while
// rising and fading in, staggered left→right. The de-blur is the signature
// gesture: words read as *forming out of* the page's ethereal theme rather than
// merely sliding in. A spring on the rise (a physical landing) paired with an
// eased blur + opacity (a clean focus-pull) is the premium combination — one
// property feels like matter settling, the other like coming into focus.
//
// CRITICALLY gated on useLoaderRevealed(): this paragraph is above the fold and
// mounts behind the ~3.3s intro loader, so a plain mount/whileInView entrance
// would play AND finish unseen behind the overlay — reading as "no animation".
// We hold every word in its hidden (blurred) state until the loader wipes away,
// then play, so the reveal lands exactly as the user first sees the page.
export default function ContactIntro({ className = '' }) {
  const reduced = useReducedMotion();
  const revealed = useLoaderRevealed();
  const words = useMemo(() => INTRO.split(' '), []);

  // Parent only orchestrates the stagger; each word carries the actual gesture
  // and inherits its play state ("visible") from here via variant propagation.
  const container = {
    hidden: {},
    visible: { transition: { staggerChildren: reduced ? 0 : STAGGER } },
  };

  // Reduced motion: a single still fade — no blur, no rise, no stagger wave — so
  // vestibular users get the copy without any of the materialize motion.
  const word = reduced
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.3 } },
      }
    : {
        hidden: { opacity: 0, y: 14, filter: 'blur(10px)' },
        visible: {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          transition: {
            y: { type: 'spring', stiffness: 120, damping: 20 },
            opacity: { duration: 0.5, ease: 'easeOut' },
            filter: { duration: 0.6, ease: 'easeOut' },
          },
        },
      };

  return (
    <motion.p
      className={className}
      variants={container}
      initial="hidden"
      animate={revealed ? 'visible' : 'hidden'}
    >
      {words.map((w, i) => (
        <Fragment key={`${w}-${i}`}>
          {/* inline-block so the word can take transform + blur; the space
              between words is a regular breakable text node OUTSIDE the span so
              the paragraph still wraps naturally. */}
          <motion.span
            variants={word}
            style={{ display: 'inline-block', ...wordFill(i, words.length) }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </motion.p>
  );
}
