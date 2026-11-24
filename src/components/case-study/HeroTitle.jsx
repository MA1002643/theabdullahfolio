'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { useRevealShown } from './reveal';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { wordChunks } from '@/components/ui/textSegments';
import { wordFill } from '@/lib/fireRamp';
import { dur, ease, stagger } from '@/lib/motion/caseStudy';

// M1: hero type rise (issue #31). Each LINE of the text rises out of its own
// mask, on the line stagger.
//
// Cut into words with `wordChunks`, a pure function of the characters (no
// dictionary), so the server and the browser produce the same spans and a
// Japanese thesis cannot throw a hydration mismatch (the /ja/about #418
// defect). Each word stays one shaped run, so Arabic keeps its joins. Lines
// are found after layout by reading each word's offsetTop, and a word's delay
// is its line's: the words of one line rise together, as one line would.
//
// Transform only, no opacity: the mask hides the text, so there is never a
// half-transparent heading for a contrast audit to catch mid-fade. The server
// renders it masked; the <noscript> rule in CaseStudy.jsx and static mode
// (which renders `animate` from props) both show it without this code.

const useIsoLayoutEffect = typeof window === 'undefined' ? () => {} : useLayoutEffect;

// `fire` (owner, 2026-11-19): the thesis wears the contact intro's
// gold→ember ramp. It is applied PER WORD (`wordFill`, @/lib/fireRamp), the
// ContactIntro pattern, because each word here is its own rising element: a
// single `background-clip: text` on the parent <p> rasterises once in a
// GPU-promoted layer and would ignore the words moving inside their masks
// (the About tilt-card clip-text bug). Sampling the ramp by word position
// also keeps the reading-order gold→ember darkening of the original.
export default function HeroTitle({ as = 'h1', text, delay = 0, className, id, lang, translate, fire = false }) {
  const Tag = as;
  const shown = useRevealShown();
  const reduced = useReducedMotion();
  const chunks = wordChunks(text);
  const wordRefs = useRef([]);
  const [lines, setLines] = useState(null);

  useIsoLayoutEffect(() => {
    const tops = wordRefs.current.map((el) => el?.offsetTop ?? 0);
    const distinct = [...new Set(tops)].sort((a, b) => a - b);
    setLines(tops.map((top) => distinct.indexOf(top)));
  }, [text]);

  return (
    <Tag id={id} className={className} lang={lang} translate={translate}>
      {chunks.map(({ word, gap }, i) => (
        <span key={i}>
          {gap}
          <span ref={(el) => (wordRefs.current[i] = el)} className="cs-mask">
            <m.span
              data-cs-rise=""
              className="cs-mask__inner"
              style={fire ? wordFill(i, chunks.length) : undefined}
              initial={{ y: '105%' }}
              animate={{ y: shown && lines ? '0%' : '105%' }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: dur.hero, ease: ease.out, delay: delay + (lines?.[i] ?? 0) * stagger.line }
              }
            >
              {word}
            </m.span>
          </span>
        </span>
      ))}
    </Tag>
  );
}
