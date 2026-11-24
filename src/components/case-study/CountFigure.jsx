'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatNumber } from '@/i18n/format';
import { useEnteredView } from './reveal';

// M8: a figure that counts up once, on its first viewport entry (issue #31).
//
// The FINAL value is in the server HTML, and stays in the DOM for screen
// readers and crawlers in a visually hidden span; only the aria-hidden visual
// digits animate. A figure already on screen when the page mounts is not
// rewound to zero in front of the reader: it simply stays at its value.
//
// A plain requestAnimationFrame tween rather than useViewportCountUp: that
// hook drives framer's imperative `animate()`, which would pull the whole
// animation engine into this route for a number (the #200 measurement). The
// digits are painted through the locale's own `Intl.NumberFormat`, in tabular
// figures (CSS), so the width does not jitter as they change.

const DURATION_MS = 1400;
const easeOut = (t) => 1 - (1 - t) ** 3;

export default function CountFigure({ value, locale, className }) {
  const wrapRef = useRef(null);
  const digitsRef = useRef(null);
  const entered = useEnteredView(wrapRef);
  const reduced = useReducedMotion();
  const state = useRef({ armed: false, done: false });
  const final = formatNumber(value, locale);

  // At mount: rewind to zero only if the figure is still off screen.
  useEffect(() => {
    const el = wrapRef.current;
    const digits = digitsRef.current;
    if (!el || !digits) return;
    const r = el.getBoundingClientRect();
    const onScreen = r.top < window.innerHeight && r.bottom > 0;
    if (!onScreen && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      digits.textContent = formatNumber(0, locale);
      state.current.armed = true;
    } else {
      state.current.done = true;
    }
  }, [locale]);

  useEffect(() => {
    const digits = digitsRef.current;
    if (!digits || !entered || state.current.done) return undefined;
    if (reduced || !state.current.armed) {
      state.current.done = true;
      digits.textContent = final;
      return undefined;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      digits.textContent = t === 1 ? final : formatNumber(Math.round(value * easeOut(t)), locale);
      if (t < 1) frame = requestAnimationFrame(step);
      else state.current.done = true;
    };
    frame = requestAnimationFrame(step);
    // `done` is set only when the tween lands, so a cleanup that interrupts it
    // (a dev StrictMode double-mount, a locale change) lets the rerun replay.
    return () => cancelAnimationFrame(frame);
  }, [entered, reduced, value, locale, final]);

  return (
    <span ref={wrapRef} className={className}>
      <span className="sr-only">{final}</span>
      <span ref={digitsRef} aria-hidden="true" className="tabular-nums">
        {final}
      </span>
    </span>
  );
}
