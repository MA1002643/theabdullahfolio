'use client';

import { motion, useReducedMotion } from 'framer-motion';
import {
  isValidSignaturePath,
  SIGNATURE_VIEWBOX,
} from '@/lib/guestbook/signature';

// Renders a stored signature path on a message card. The path string is
// untrusted data even here — it re-runs the same grammar validator the API
// used before storage (defence in depth: whatever is in the store TODAY still
// has to parse before it touches the DOM), and an invalid path renders
// nothing rather than something.
//
// The draw-on: framer-motion's pathLength drives the stroke from 0 → 1 —
// framer normalises against the path's true length internally, so multi-
// stroke signatures (several M subpaths) draw through in sequence. `play`
// gates WHEN (owner-directed): the card passes its own in-view state, so a
// signature holds un-drawn until its card actually scrolls into view — not
// on page load — and re-arms when the card leaves, drawing again with the
// card's replayed entrance. Timed to start just after that entrance
// settles; under reduced motion the glyph renders complete and still.
export default function SignatureGlyph({ d, authorName, delay = 0, play = true }) {
  const reduceMotion = useReducedMotion();
  if (!isValidSignaturePath(d)) return null;

  return (
    <svg
      viewBox={`0 0 ${SIGNATURE_VIEWBOX.width} ${SIGNATURE_VIEWBOX.height}`}
      role="img"
      aria-label={authorName ? `${authorName}’s signature` : 'Signature'}
      className="mt-3 h-10 w-auto max-w-[9rem] overflow-visible [filter:drop-shadow(0_0_3px_rgba(255,109,5,0.7))] sm:h-12 sm:max-w-[10rem]"
    >
      <motion.path
        d={d}
        fill="none"
        stroke="#eab53e"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
        animate={
          reduceMotion || play
            ? { pathLength: 1, opacity: 1 }
            : { pathLength: 0, opacity: 0 }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : {
                pathLength: { duration: 1.1, delay: delay + 0.25, ease: 'easeInOut' },
                opacity: { duration: 0.2, delay: delay + 0.25 },
              }
        }
      />
    </svg>
  );
}
