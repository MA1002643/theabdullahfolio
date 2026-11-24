'use client';

import { useRef } from 'react';
import { m, useScroll, useTransform } from 'framer-motion';
import { useStaticMotion } from '@/components/motion/useStaticMotion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { wordChunks } from '@/components/ui/textSegments';

// M4: reading-order fill (issue #31). The problem statement fills word by
// word, from a muted tone to full colour, as the reader scrolls through it.
//
// The chapter is tall and the statement is pinned inside it (CSS, see
// `.cs-statement` in globals.css), so the fill spans more than one viewport of
// scroll. Over less than that it finishes in a flick of the wheel and reads
// as nothing happening (the /about Architect reveal lesson).
//
// COLOUR, not opacity. The muted end is #8a8a8a, the site's measured contrast
// floor on this ground, so every word passes WCAG AA at every scroll position,
// including the moment an audit happens to scan it. A fade from opacity 0 fails
// that check mid-scroll. Colour on a text run repaints only that run; it is the
// one exception to the page's transform-and-opacity rule, and the reason is
// accessibility.
//
// Under reduced motion the CSS unpins the chapter (no pinning, §9), which
// leaves no scroll window to fill across, so the words render at full colour.
// The same in static mode, where nothing subscribes to the scroll value.

const MUTED = '#8a8a8a';
const FULL = '#f4f4f4';

function FillWord({ progress, range, children }) {
  const color = useTransform(progress, range, [MUTED, FULL]);
  return <m.span style={{ color }}>{children}</m.span>;
}

export default function StatementFill({ text, className }) {
  const ref = useRef(null);
  const isStatic = useStaticMotion();
  const reduced = useReducedMotion();
  const plain = isStatic || reduced;
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const chunks = wordChunks(text);
  const n = chunks.length || 1;
  // The fill occupies the middle of the pinned window, so the statement is
  // already fully muted when it pins and fully lit before it unpins.
  const span = (i) => [0.1 + (i / n) * 0.75, 0.1 + ((i + 1) / n) * 0.75];

  return (
    <div ref={ref} className="cs-statement">
      <div className="cs-statement__pin">
        <p className={className}>
          {chunks.map(({ word, gap }, i) =>
            plain ? (
              <span key={i} style={{ color: FULL }}>
                {gap}
                {word}
              </span>
            ) : (
              <FillWord key={i} progress={scrollYProgress} range={span(i)}>
                {gap}
                {word}
              </FillWord>
            ),
          )}
        </p>
      </div>
    </div>
  );
}
