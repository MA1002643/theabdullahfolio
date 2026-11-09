'use client';

import { useEffect, useState } from 'react';
import { m } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { useScramble } from '@/hooks/useScramble';
import { NEW_MESSAGE_EVENT } from '@/lib/guestbook/events';
import { breaksWhenSplit, glyphUnits } from '@/components/ui/textSegments';

// The guestbook headline (issue #40 Phase 4): visually IDENTICAL to the
// shared PageTitle — same .page-title-* semantic classes, same
// text-glow-stroke-neon fill, same pink subtitle with flank pills — but the
// title DECODES out of random glyphs instead of igniting letter-by-letter,
// and decodes again whenever a new message lands on the wall (the wall
// dispatches NEW_MESSAGE_EVENT; nothing is prop-drilled through the page).
//
// A separate component rather than a PageTitle prop on purpose: PageTitle is
// the sitewide headline contract (issue #104) shared by five routes — growing
// it a second animation system for one page's flag-gated flourish would put
// guestbook risk inside every headline on the site. The styling stays shared
// through the semantic classes, so a future size tweak still propagates here.
//
// Accessibility mirrors PageTitle: the h1 carries an aria-label of the clean
// title, the churning spans are aria-hidden, and under prefers-reduced-motion
// the decode never runs (useScramble pins the real text).

// Same subtitle palette PageTitle inlines — the pink fill + halo pair.
const SUBTITLE_STYLE = {
  color: 'rgb(252 131 255 / var(--tw-text-opacity, 1))',
  textShadow: '0 0 5px #ff55f7, 0 0 10px #ff55f7, 0 0 20px #ff55f7',
  '--tw-text-opacity': '1',
};

const FLANK_PILL_STYLE = {
  backgroundColor: '#fc83ff',
  boxShadow: '0 0 5px #ff55f7, 0 0 10px #ff55f7',
};

const SUBTITLE_MOTION = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut', delay: 0.45 },
  },
};

export default function GuestbookTitle({ title, subtitle, id }) {
  const prefersReducedMotion = useReducedMotion();
  const revealed = useLoaderRevealed();
  const [playKey, setPlayKey] = useState(0);

  useEffect(() => {
    const replay = () => setPlayKey((k) => k + 1);
    window.addEventListener(NEW_MESSAGE_EVENT, replay);
    return () => window.removeEventListener(NEW_MESSAGE_EVENT, replay);
  }, []);

  // A joining script (Arabic, Devanagari — issue #82) cannot be decoded a
  // code point at a time: each letter in its own box loses its shaping, and
  // the Latin churn glyphs would replace letters mid-word. Such a title skips
  // the scramble and renders in whole-word units (textSegments.js).
  const shaped = breaksWhenSplit(title);
  const scrambled = useScramble(title, {
    playKey,
    enabled: revealed && !prefersReducedMotion && !shaped,
  });
  const chars = shaped ? glyphUnits(title) : scrambled;

  const play = prefersReducedMotion || revealed;

  return (
    <div id={id} className="page-title-block z-50 text-center">
      <m.h1
        aria-label={title}
        // Inline-block units are bidi-neutral: let the title's own text pick
        // its direction, or an English title on an RTL page reads backwards.
        dir="auto"
        initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: play ? 1 : 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="page-title-heading font-extrabold uppercase leading-tight text-glow-stroke-neon"
      >
        {chars.map((char, i) =>
          char === ' ' ? (
            <span key={i} aria-hidden="true">
              {' '}
            </span>
          ) : (
            <span key={i} aria-hidden="true" className="inline-block">
              {char}
            </span>
          ),
        )}
      </m.h1>
      {subtitle ? (
        <m.div
          variants={SUBTITLE_MOTION}
          initial={prefersReducedMotion ? 'visible' : 'hidden'}
          animate={play ? 'visible' : 'hidden'}
          className="page-title-subtitle flex items-center justify-center uppercase leading-snug"
          style={SUBTITLE_STYLE}
        >
          <span
            aria-hidden="true"
            className="page-title-flank rounded-full"
            style={FLANK_PILL_STYLE}
          />
          <h2>{subtitle}</h2>
          <span
            aria-hidden="true"
            className="page-title-flank rounded-full"
            style={FLANK_PILL_STYLE}
          />
        </m.div>
      ) : null}
    </div>
  );
}
