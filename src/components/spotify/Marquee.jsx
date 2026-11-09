'use client';

import { useEffect, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

// Long track / artist names get the premium treatment: instead of a hard "…"
// cut, the text slides gently to reveal its tail and eases back — the way a
// native now-playing display scrolls a long title. It ONLY animates when the
// text actually overflows its container AND motion is allowed AND `active`
// (playing); otherwise it falls back to a clean truncation. Re-measures on
// resize (so it re-evaluates when the pill expands) and whenever the text
// changes.

export default function Marquee({ text, active = false, className = '' }) {
  const wrapRef = useRef(null);
  const textRef = useRef(null);
  const [overflow, setOverflow] = useState(0);
  // Which way the tail hides (issue #82): a right-to-left title (Arabic,
  // Hebrew) overflows on the LEFT, so its reveal slides the other way. Read
  // from the span's own resolved direction — it carries dir="auto", so a Latin
  // title on an Arabic page still scrolls left, and vice versa.
  const [towardStart, setTowardStart] = useState(-1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const wrap = wrapRef.current;
    const el = textRef.current;
    if (!wrap || !el) return undefined;

    const measure = () => {
      // scrollWidth (content) vs clientWidth (visible box). A few px of slack
      // avoids a jittery 1px marquee on sub-pixel rounding.
      const diff = el.scrollWidth - wrap.clientWidth;
      setOverflow(diff > 4 ? diff : 0);
      setTowardStart(getComputedStyle(el).direction === 'rtl' ? 1 : -1);
    };
    measure();

    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) {
      ro.observe(wrap);
      ro.observe(el);
    }
    return () => {
      if (ro) ro.disconnect();
    };
  }, [text]);

  const shouldScroll = active && !reduceMotion && overflow > 0;

  return (
    <div ref={wrapRef} className={`overflow-hidden ${className}`}>
      <m.span
        ref={textRef}
        dir="auto"
        className="inline-block whitespace-nowrap will-change-transform"
        // Hold at each end, then ease across — a calm reveal, not a ticker.
        animate={
          shouldScroll
            ? { x: [0, 0, towardStart * overflow, towardStart * overflow, 0] }
            : { x: 0 }
        }
        transition={
          shouldScroll
            ? {
                duration: 3 + overflow / 40, // longer strings scroll a touch slower
                times: [0, 0.12, 0.5, 0.62, 1],
                ease: 'easeInOut',
                repeat: Infinity,
                repeatDelay: 1.2,
              }
            : { duration: 0.3 }
        }
        // Static (non-scrolling) state truncates cleanly.
        style={
          shouldScroll
            ? undefined
            : {
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }
        }
      >
        {text}
      </m.span>
    </div>
  );
}
