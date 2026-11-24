'use client';

import { useRef } from 'react';
import { m, useScroll, useTransform } from 'framer-motion';
import { Link } from '@/i18n/navigation';
import { useStaticMotion } from '@/components/motion/useStaticMotion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { dur, ease, stagger, distance } from '@/lib/motion/caseStudy';
import { useEnteredView, useRevealShown } from './reveal';

// One craft-note card (owner request, 2026-11-23): the cards stopped reading
// as four copies of one block and became a choreographed set. Each card
// reveals when IT enters the viewport (not when the chapter's top does, which
// on a phone played the lower cards off screen), and inside it the title, the
// numeral, a drawn ember hairline, the body and the link land as a cascade.
//
// Every trigger is state bound to `animate` (CLAUDE.md §6): `shown` latches
// via IntersectionObserver, so in framer's static mode the card renders at
// its target the moment the state flips, and the <noscript> rule CaseStudy.jsx
// emits (keyed on `data-cs-rise`) reveals everything for a reader with no JS.
//
// The drift is the one MotionValue style: a few px of scroll-linked float,
// a different rate per column, so the grid reads as sheets over the drafting
// ground rather than rows stamped on it. It is purely decorative — in static
// mode it would freeze at whatever offset it first read, so it is switched
// off there (and under reduced motion) rather than left stuck mid-drift.

const MLink = m.create(Link);

const RISE = {
  hidden: { opacity: 0, y: distance.rise },
  shown: { opacity: 1, y: 0 },
};
const FADE = {
  hidden: { opacity: 0 },
  shown: { opacity: 1 },
};
/* transform-origin comes from CSS (`.cs-notes__rule`, mirrored :dir(rtl)),
   so the line draws from the reading-start edge in both directions. */
const DRAW = {
  hidden: { scaleX: 0 },
  shown: { scaleX: 1 },
};

export default function NoteCard({ item, index = 0, counter, headingId, readLabel }) {
  const ref = useRef(null);
  const entered = useEnteredView(ref);
  const scoped = useRevealShown();
  const shown = entered && scoped;
  const reduced = useReducedMotion();
  const isStatic = useStaticMotion();
  const still = reduced || isStatic;

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const drift = 10 + (index % 2) * 8;
  const y = useTransform(scrollYProgress, [0, 1], [drift, -drift]);

  // `index * stagger.item` cascades cards that enter together (a desktop row);
  // a card entering alone keeps only that negligible residue.
  const t = (step, duration = dur.slow) =>
    reduced
      ? { duration: 0 }
      : { duration, ease: ease.out, delay: index * stagger.item + step * stagger.line };
  const pose = { initial: 'hidden', animate: shown ? 'shown' : 'hidden' };

  return (
    <m.li
      ref={ref}
      data-cs-rise=""
      className="abt-frame cs-card cs-notes__card"
      style={still ? undefined : { y }}
      variants={FADE}
      transition={t(0)}
      {...pose}
    >
      {counter ? (
        <m.span
          aria-hidden="true"
          className="cs-notes__num"
          translate="no"
          data-cs-rise=""
          variants={RISE}
          transition={t(1.25)}
          {...pose}
        >
          {counter}
        </m.span>
      ) : null}
      <m.h3 id={headingId} className="cs-notes__title" data-cs-rise="" variants={RISE} transition={t(0.75)} {...pose}>
        {item.title}
      </m.h3>
      <m.span
        aria-hidden="true"
        className="cs-notes__rule"
        data-cs-rise=""
        variants={DRAW}
        transition={t(1.75, dur.hero)}
        {...pose}
      />
      <m.p className="cs-body cs-notes__body" data-cs-rise="" variants={RISE} transition={t(2.25)} {...pose}>
        {item.body}
      </m.p>
      {item.href ? (
        <MLink
          href={item.href}
          aria-describedby={headingId}
          className="cs-link cs-notes__link"
          data-cs-rise=""
          variants={RISE}
          transition={t(3)}
          {...pose}
        >
          {readLabel}
        </MLink>
      ) : null}
    </m.li>
  );
}
