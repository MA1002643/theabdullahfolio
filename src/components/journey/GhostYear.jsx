'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLocale } from 'next-intl';
import { intlTag } from '@/i18n/format';

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
//
// Locale digits (issue #82): the strip's GLYPHS come from the locale's own
// numbering system (Arabic-Indic in `ar`, extended Arabic-Indic in `fa`), but
// the strip is still indexed by the year's Western digit values, so the roll
// mechanism is identical in every language. `dir="ltr"` because a number is
// written left-to-right even inside right-to-left text: without it an RTL
// flex row would lay the columns out 6-2-0-2. The figure stays on the right
// edge in RTL too — it is an ambient instrument sharing that gutter with the
// EraRail clock, which is also physically anchored there.
const WESTERN = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const GhostYear = ({ year, visible, reduceMotion }) => {
  const locale = useLocale();
  const digits = useMemo(() => {
    const fmt = new Intl.NumberFormat(intlTag(locale), { useGrouping: false });
    return WESTERN.map((d) => fmt.format(Number(d)));
  }, [locale]);
  return (
    <motion.div
      aria-hidden
      dir="ltr"
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
            {digits.map((d, i) => (
              <span key={WESTERN[i]} className="block h-[1em] leading-none">
                {d}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </motion.div>
  );
};

export default GhostYear;
