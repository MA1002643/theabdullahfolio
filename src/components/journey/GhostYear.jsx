'use client';

import React from 'react';
import { motion } from 'framer-motion';

// The ambient era readout: a giant, barely-there year fixed behind the cards,
// whose digits ROLL — odometer-style — as the reader scrolls across an era
// boundary. Each digit column is a 0–9 strip inside a 1em window, translated
// by -digit em; em units so the mechanism scales with the font-size for free.
// The cards' backdrop-blur (custom-bg-abt) softens whatever part of the figure
// passes behind them, which reads as depth rather than clutter.
//
// Decorative through and through: aria-hidden, pointer-events-none, negative
// z (above the page's -z-40 dimmer, below all content). md+ only — at phone
// widths the figure would fight the full-width cards for the same pixels.
// Reduced motion swaps the roll for a hard cut (duration 0), and `visible`
// (timeline on screen + loader lifted) fades the whole thing away before the
// footer arrives.
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const GhostYear = ({ year, visible, reduceMotion }) => (
  <motion.div
    aria-hidden
    className="journey-ghost-year pointer-events-none fixed right-[4vw] top-1/2 -z-10 hidden -translate-y-1/2 select-none md:flex"
    initial={false}
    animate={{ opacity: visible ? 1 : 0 }}
    transition={{ duration: reduceMotion ? 0 : 0.6, ease: 'easeOut' }}
  >
    {String(year).split('').map((digit, column) => (
      <span key={column} className="block h-[1em] overflow-hidden">
        <motion.span
          className="flex flex-col"
          initial={false}
          animate={{ y: `-${Number(digit)}em` }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 90, damping: 22, mass: 0.8 }
          }
        >
          {DIGITS.map((d) => (
            <span key={d} className="block h-[1em] leading-none">
              {d}
            </span>
          ))}
        </motion.span>
      </span>
    ))}
  </motion.div>
);

export default GhostYear;
