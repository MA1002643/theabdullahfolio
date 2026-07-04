'use client';

import { useEffect, useState } from 'react';
import {
  animate as fmAnimate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import { MONO_D, MONO_VIEWBOX, MONO_CENTER } from '@/components/emblem/monogram';
import { REVEAL_MS } from './constants';

// The visual body of the Sigil Passage — mounted by PageTransitionProvider
// for the covering/holding/revealing phases of a navigation.
//
// Internal choreography (all delays measured from mount, tuned to sit inside
// COVER_MS + SHOWCASE_MIN_MS from ./constants):
//   0.00s  ember slab sweeps in, molten leading edge first
//   0.10s  ink-black slab chases it; viewport sealed by ~0.54s
//   0.34s  the monogram begins drawing itself in stroke (its screen centre
//          is already covered by then)
//   0.55s  the destination name engraves beneath the mark, flanked by the
//          seal's diamond motif
//   0.90s  ignition — the molten fill floods the monogram bottom-up while
//          the outline dissolves and the core bloom flashes, then breathes
//          (the breathing doubles as a loading pulse on slow routes)
//   reveal  the bloom becomes the intro loader's radial mask wipe + ember
//          portal ring; the monogram scales up and dissolves into the light
//
// Layering note: the radial mask sits on the inner "surface" div, NOT the
// root — the portal ring is the surface's sibling so the mask can't clip it
// (same separation the intro loader uses).

const INK = [0.65, 0, 0.35, 1];
const SOFT_OUT = [0.22, 1, 0.36, 1];

// Ignition moment — stroke draw (0.34s + 0.55s) has just finished.
const IGNITE_AT_MS = 900;
const IGNITE_SEC = 0.55;

export default function SigilOverlay({ phase, label, reduced }) {
  const revealing = phase === 'revealing';
  const wipeActive = revealing && !reduced;

  // Internal ignition beat — the provider's phases track the route, not the
  // artwork, so the monogram runs its own clock from mount.
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setLit(true), IGNITE_AT_MS);
    return () => clearTimeout(t);
  }, [reduced]);

  // Radial reveal — identical language to the intro loader's exit wipe.
  const revealRadius = useMotionValue(0);
  const maskImage = useMotionTemplate`radial-gradient(circle at 50% 50%, transparent ${revealRadius}%, black calc(${revealRadius}% + 5%))`;

  const [farthestCornerPx, setFarthestCornerPx] = useState(0);
  useEffect(() => {
    setFarthestCornerPx(
      Math.hypot(window.innerWidth / 2, window.innerHeight / 2),
    );
  }, []);

  const ringDiameter = useTransform(
    revealRadius,
    (r) => `${(r / 100) * farthestCornerPx * 2}px`,
  );
  const ringOpacity = useTransform(
    revealRadius,
    [0, 12, 80, 120, 150],
    [0, 1, 1, 0.55, 0],
  );

  useEffect(() => {
    if (!wipeActive) return;
    const controls = fmAnimate(revealRadius, 150, {
      duration: REVEAL_MS / 1000,
      ease: INK,
    });
    return () => controls.stop();
  }, [wipeActive, revealRadius]);

  const surfaceMaskStyle = wipeActive
    ? { maskImage, WebkitMaskImage: maskImage }
    : undefined;

  // Reduced motion collapses the whole ritual into a quiet cross-fade over a
  // static, already-forged monogram.
  const enter = (initial) => (reduced ? false : initial);

  return (
    <motion.div
      className="fixed inset-0 z-[9980]"
      role="presentation"
      aria-hidden="true"
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
    >
      {/* ——— masked surface: slabs + monogram + engraving ——— */}
      <motion.div
        className={`absolute inset-0 overflow-hidden ${reduced ? 'bg-black' : ''}`}
        style={surfaceMaskStyle}
        initial={reduced ? { opacity: 0 } : false}
        animate={{ opacity: reduced && revealing ? 0 : 1 }}
        transition={{ duration: reduced ? 0.2 : 0 }}
      >
        {!reduced && (
          <>
            {/* Underlay flips to solid black the instant the slabs finish, so
                a mid-passage viewport resize can never expose the page. */}
            <motion.div
              className="absolute inset-0 bg-black"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.54, duration: 0.01 }}
            />

            {/* Ember slab — leads the sweep with a molten edge. */}
            <motion.div
              className="absolute"
              style={{
                top: '-15%',
                bottom: '-15%',
                left: '-25%',
                width: '150%',
                skewX: '-10deg',
                background:
                  'linear-gradient(100deg, #000 55%, #170b03 82%, #2a1204 100%)',
              }}
              initial={{ x: '-130%' }}
              animate={{ x: '0%' }}
              transition={{ duration: 0.46, ease: INK }}
            >
              {/* Molten leading edge + gold hairline. */}
              <div
                className="absolute bottom-0 right-[2px] top-0 w-8"
                style={{
                  background:
                    'linear-gradient(to right, rgba(255,109,5,0), rgba(255,109,5,0.55))',
                }}
              />
              <div
                className="absolute bottom-0 right-0 top-0 w-[2px]"
                style={{
                  background:
                    'linear-gradient(to bottom, #FFF1C6, #FFD45E, #C7922C)',
                  boxShadow: '0 0 14px 1px rgba(255,109,5,0.8)',
                }}
              />
            </motion.div>

            {/* Ink-black slab — chases the ember edge and seals the frame. */}
            <motion.div
              className="absolute bg-black"
              style={{
                top: '-15%',
                bottom: '-15%',
                left: '-25%',
                width: '150%',
                skewX: '-10deg',
              }}
              initial={{ x: '-130%' }}
              animate={{ x: '0%' }}
              transition={{ delay: 0.1, duration: 0.44, ease: INK }}
            />
          </>
        )}

        {/* ——— centrepiece: the monogram forge + destination engraving ——— */}
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center"
          animate={
            wipeActive
              ? {
                  scale: 2.3,
                  opacity: 0,
                  filter:
                    'drop-shadow(0 0 60px #ff6d05) drop-shadow(0 0 120px rgba(255,109,5,0.5))',
                }
              : { scale: 1, opacity: 1 }
          }
          transition={
            wipeActive
              ? { duration: REVEAL_MS / 1000, ease: [0.55, 0, 0.45, 1] }
              : { duration: 0 }
          }
        >
          <div className="h-[clamp(11rem,32vmin,15rem)] w-[clamp(11rem,32vmin,15rem)]">
            <svg
              viewBox={MONO_VIEWBOX}
              className="h-full w-full overflow-visible"
            >
              <defs>
                <linearGradient id="sigil-flameMono" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#FFD23E" />
                  <stop offset="0.32" stopColor="#FFA21F" />
                  <stop offset="0.62" stopColor="#FF6E1C" />
                  <stop offset="1" stopColor="#F2401C" />
                </linearGradient>
                <radialGradient id="sigil-bloom" cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0" stopColor="#FFE7B0" stopOpacity="0.95" />
                  <stop offset="0.35" stopColor="#FF8A1E" stopOpacity="0.7" />
                  <stop offset="0.7" stopColor="#FF6D05" stopOpacity="0.25" />
                  <stop offset="1" stopColor="#FF6D05" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Ignition flash — one-shot bloom behind the mark. */}
              <motion.circle
                cx={MONO_CENTER.x}
                cy={MONO_CENTER.y}
                r={185}
                fill="url(#sigil-bloom)"
                style={{
                  transformOrigin: `${MONO_CENTER.x}px ${MONO_CENTER.y}px`,
                  transformBox: 'view-box',
                }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={
                  lit && !reduced
                    ? { opacity: [0, 0.95, 0.6], scale: [0.5, 1.15, 1.3] }
                    : { opacity: 0, scale: 0.5 }
                }
                transition={{ duration: IGNITE_SEC, ease: 'easeOut' }}
              />

              {/* Breathing ember — doubles as the loading pulse if the route
                  is slow to arrive. */}
              {!reduced && (
                <motion.circle
                  cx={MONO_CENTER.x}
                  cy={MONO_CENTER.y}
                  r={185}
                  fill="url(#sigil-bloom)"
                  style={{
                    transformOrigin: `${MONO_CENTER.x}px ${MONO_CENTER.y}px`,
                    transformBox: 'view-box',
                  }}
                  initial={{ opacity: 0, scale: 1.25 }}
                  animate={
                    lit
                      ? { opacity: [0.2, 0.45, 0.2], scale: [1.25, 1.35, 1.25] }
                      : { opacity: 0 }
                  }
                  transition={{
                    delay: IGNITE_SEC,
                    duration: 1.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              )}

              {/* Cool gold outline — the mark draws itself... */}
              {!reduced && (
                <motion.path
                  d={MONO_D}
                  fill="none"
                  stroke="url(#sigil-flameMono)"
                  strokeWidth={3.5}
                  fillRule="evenodd"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: lit ? 0 : 0.95 }}
                  transition={{
                    pathLength: { delay: 0.34, duration: 0.55, ease: INK },
                    opacity: lit
                      ? { duration: 0.25 }
                      : { delay: 0.34, duration: 0.2 },
                  }}
                />
              )}

              {/* ...then the molten fill floods it bottom-up on ignition. */}
              <motion.path
                d={MONO_D}
                fill="url(#sigil-flameMono)"
                fillRule="evenodd"
                initial={enter({ clipPath: 'inset(100% 0% 0% 0%)' })}
                animate={{
                  clipPath:
                    lit || reduced
                      ? 'inset(0% 0% 0% 0%)'
                      : 'inset(100% 0% 0% 0%)',
                }}
                transition={{
                  duration: reduced ? 0 : IGNITE_SEC * 0.7,
                  ease: INK,
                }}
              />
            </svg>
          </div>

          {/* Destination engraving, flanked by the seal's diamond motif. */}
          <motion.div
            className="mt-6 flex items-center gap-4"
            initial={enter({ opacity: 0, y: 10 })}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: reduced ? 0 : 0.55,
              duration: reduced ? 0 : 0.5,
              ease: SOFT_OUT,
            }}
          >
            <motion.span
              className="h-1.5 w-1.5 rotate-45 bg-[#EFC04A]"
              initial={enter({ scale: 0 })}
              animate={{ scale: 1 }}
              transition={{ delay: reduced ? 0 : 0.75, duration: reduced ? 0 : 0.35, ease: SOFT_OUT }}
            />
            <motion.span
              className="text-xs font-extrabold uppercase text-[#ff6d05] sm:text-sm"
              style={{
                fontFamily:
                  "var(--font-montserrat), 'Helvetica Neue', Helvetica, Arial, sans-serif",
                textShadow: '0 0 12px rgba(255, 109, 5, 0.45)',
              }}
              initial={enter({ letterSpacing: '0.7em' })}
              animate={{ letterSpacing: '0.42em' }}
              transition={{ delay: reduced ? 0 : 0.55, duration: reduced ? 0 : 0.6, ease: SOFT_OUT }}
            >
              {label}
            </motion.span>
            <motion.span
              className="h-1.5 w-1.5 rotate-45 bg-[#EFC04A]"
              initial={enter({ scale: 0 })}
              animate={{ scale: 1 }}
              transition={{ delay: reduced ? 0 : 0.75, duration: reduced ? 0 : 0.35, ease: SOFT_OUT }}
            />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* ——— ember portal ring: sibling of the masked surface ——— */}
      {wipeActive && (
        <motion.div
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: ringDiameter,
            height: ringDiameter,
            x: '-50%',
            y: '-50%',
            opacity: ringOpacity,
            border: '1.5px solid rgba(255, 109, 5, 0.85)',
            boxShadow:
              '0 0 24px 2px rgba(255, 109, 5, 0.7), 0 0 80px 8px rgba(255, 109, 5, 0.35), inset 0 0 30px 4px rgba(255, 180, 80, 0.45)',
          }}
        />
      )}
    </motion.div>
  );
}
