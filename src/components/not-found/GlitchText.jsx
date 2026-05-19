'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Character pool the digits cycle through during a scramble.
// Mostly digits so the field still reads as "numeric data
// corrupting" rather than a Matrix rain. Two glyph symbols
// (`#`, `*`) for visual texture without breaking that read.
const SCRAMBLE_CHARS = '0123456789#*';
const SCRAMBLE_FRAME_MS = 50;     // per-frame interval (≈20fps)
const SCRAMBLE_FRAMES = 14;       // ≈700ms of scrambling
const PULSE_MS = 700;             // duration of the resolve flash
const IDLE_MIN_MS = 6000;         // shortest gap between scrambles
const IDLE_MAX_MS = 9000;         // longest gap

function pickRandomChar() {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

function randomTrio() {
  return pickRandomChar() + pickRandomChar() + pickRandomChar();
}

/**
 * "404" with two layered behaviours:
 *
 * 1. CONTINUOUS — pseudo-element chromatic aberration (defined
 *    in globals.css as `.glitch-text::before` / `::after`) runs
 *    subtle offset shakes in the background. ~90% of every loop
 *    the layers are aligned, ~10% they jitter — periodic noise
 *    rather than seizure-inducing flicker.
 *
 * 2. PERIODIC SCRAMBLE — every 6–9s this component flips into
 *    "scrambling" phase: the displayed text rapidly cycles
 *    through random characters for ≈700ms (slot-machine /
 *    CRT-corruption feel), then snaps back to "404" with a
 *    bright ember-pulse glow burst lasting another ≈700ms. The
 *    scramble runs even when the user isn't looking, so the
 *    "surprise" is reliable on first paint and on return.
 *
 * Reduced-motion users skip the scramble entirely — they see a
 * static, stroked "404" with the brand's drop-shadow glow.
 *
 * @param {Object} props
 * @param {string} [props.text='404']  Final resolved text. Also
 *                                     used as the initial render
 *                                     so SSR + first paint match.
 * @param {{x:number,y:number}} [props.parallax]
 *                                     Optional translate offset
 *                                     applied to the wrapper
 *                                     (so it composes with the
 *                                     internal scale-pulse on the
 *                                     resolve animation without
 *                                     either clobbering the other).
 */
export default function GlitchText({ text = '404', parallax }) {
  const [displayed, setDisplayed] = useState(text);
  // 'idle' — showing `text` with subtle continuous glitch only
  // 'scrambling' — rapidly cycling through random chars
  // 'resolving' — `text` is shown again + pulse burst running
  const [phase, setPhase] = useState('idle');
  const prefersReducedMotion = useReducedMotion() ?? false;

  // Refs let cleanup cancel pending timers even mid-scramble,
  // so a fast unmount (e.g. user clicks TAKE ME BACK) doesn't
  // leave a setInterval running and spamming state into an
  // unmounted tree.
  const idleTimerRef = useRef(null);
  const scrambleTimerRef = useRef(null);
  const pulseTimerRef = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion) {
      // Reduced motion: render static target text, never scramble.
      setDisplayed(text);
      setPhase('idle');
      return undefined;
    }

    const clearAll = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (scrambleTimerRef.current) clearInterval(scrambleTimerRef.current);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };

    const scheduleNextScramble = () => {
      const delay = IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
      idleTimerRef.current = setTimeout(beginScramble, delay);
    };

    const beginScramble = () => {
      setPhase('scrambling');
      // Render the first scrambled frame immediately so the user
      // sees a change the moment the scramble fires (without
      // this the first 50ms still show the previous "404").
      setDisplayed(randomTrio());
      let frame = 1;
      scrambleTimerRef.current = setInterval(() => {
        if (frame >= SCRAMBLE_FRAMES) {
          clearInterval(scrambleTimerRef.current);
          scrambleTimerRef.current = null;
          resolveToTarget();
          return;
        }
        setDisplayed(randomTrio());
        frame += 1;
      }, SCRAMBLE_FRAME_MS);
    };

    const resolveToTarget = () => {
      setDisplayed(text);
      setPhase('resolving');
      pulseTimerRef.current = setTimeout(() => {
        setPhase('idle');
        scheduleNextScramble();
      }, PULSE_MS);
    };

    scheduleNextScramble();
    return clearAll;
  }, [prefersReducedMotion, text]);

  const transformStyle = parallax
    ? { transform: `translate(${parallax.x}px, ${parallax.y}px)` }
    : undefined;

  const stateClass =
    phase === 'scrambling'
      ? 'scrambling'
      : phase === 'resolving'
      ? 'pulse-resolve'
      : '';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      style={transformStyle}
      className="select-none"
      // Keep a single accessible name on the live heading so
      // assistive tech reads "404", not whatever random trio is
      // currently mid-scramble.
      aria-label={text}
    >
      <h1
        className={`glitch-text ${stateClass}`}
        data-text={displayed}
        aria-hidden="true"
      >
        {displayed}
      </h1>
    </motion.div>
  );
}
