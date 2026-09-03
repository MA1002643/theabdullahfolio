'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Pagination for the guestbook wall, built as an INSTRUMENT in the site's
// existing visual language rather than a row of numbered buttons:
//
//   · the rail is a hairline with one graduation tick per page (the journey
//     dial's language), an ember filament filled to the current position,
//     and a glowing comet head that rides it — the journey spine's comet,
//     recast horizontal. Clicking anywhere on the rail jumps to the nearest
//     page, so the whole strip is one generous hit target instead of
//     nineteen 4px ticks.
//   · the page number is a two-digit odometer: digits roll vertically on
//     change (the ghost-year manners), rolling up on next and down on prev.
//   · prev / next are the guestbook's pill chrome (the sign-in CTA family).
//
// Accessibility: the rail is decorative-plus-pointer (aria-hidden — its
// click is an enhancement, never the only path); the REAL controls are the
// two buttons, and the current position is announced through a visually
// hidden aria-live line ("Page 3 of 19") that changes exactly once per
// flip. Reduced motion drops the springs, the comet glow pulse and the
// digit roll — positions still update, instantly.
//
// Perf note (#47 lessons): the filament animates `width` and the comet
// `left` — deliberately NOT framer transforms, so the Tailwind -translate-*
// centring classes on those spans are never overwritten; each is a single
// tiny absolutely-positioned node, so the layout cost is nil. No Tailwind
// `transition` utilities anywhere near the animated spans.

const BTN_CLASS =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#ff6d05]/40 bg-black/40 text-[#f9d174] transition-all duration-300 hover:border-[#ff6d05] hover:bg-[#ff6d05]/10 hover:shadow-[0_0_16px_rgba(255,109,5,0.25)] disabled:pointer-events-none disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]';

// Odometer digit roll — direction-aware via AnimatePresence custom, so the
// exiting digit always leaves the way the entering one arrives.
const DIGIT_VARIANTS = {
  enter: (d) => ({ y: d >= 0 ? '0.9em' : '-0.9em', opacity: 0 }),
  center: { y: 0, opacity: 1 },
  exit: (d) => ({ y: d >= 0 ? '-0.9em' : '0.9em', opacity: 0 }),
};

export default function WallPagination({ page, pageCount, dir, onPage }) {
  const reduceMotion = useReducedMotion();
  if (pageCount <= 1) return null;

  const pct = (page / (pageCount - 1)) * 100;
  const slide = reduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 190, damping: 26 };

  const jump = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = (e.clientX - rect.left) / rect.width;
    onPage(Math.round(k * (pageCount - 1)));
  };

  return (
    <nav
      aria-label="Guestbook pages"
      className="flex items-center justify-center gap-3 pt-2 sm:gap-4"
    >
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        aria-label="Previous page"
        className={BTN_CLASS}
      >
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      </button>

      {/* The rail. Hidden on phones (prev/next + odometer carry the job
          there); from sm up it is the centrepiece. */}
      <div
        aria-hidden="true"
        onClick={jump}
        className="relative hidden h-8 w-full max-w-[280px] cursor-pointer sm:block"
      >
        <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[#f9d174]/20" />
        <motion.span
          className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-[#ff6d05]/0 via-[#ff6d05]/60 to-[#ff6d05]"
          animate={{ width: `${pct}%` }}
          transition={slide}
        />
        {Array.from({ length: pageCount }, (_, i) => (
          <span
            key={i}
            className={`absolute top-1/2 h-[7px] w-px -translate-y-1/2 ${
              i <= page ? 'bg-[#f9d174]/70' : 'bg-[#f9d174]/25'
            }`}
            style={{ left: `${(i / (pageCount - 1)) * 100}%` }}
          />
        ))}
        <motion.span
          className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff6d05] shadow-[0_0_10px_2px_rgba(255,109,5,0.55)]"
          animate={{ left: `${pct}%` }}
          transition={slide}
        />
      </div>

      {/* Odometer: PAGE 03 / 19. The rolling digit pair is aria-hidden with
          a stable sr-only live line beside it, so assistive tech hears one
          clean sentence, never mid-roll fragments. */}
      <p className="shrink-0 font-mono text-xs tracking-widest">
        <span aria-hidden="true">
          <span className="text-[#fc83ff]/90">PAGE </span>
          {/* Digits in the feature cards' numeral ink (owner call): the same
              vivid neon-orange #ff6d05 the "Projects shipped" / years digits
              carry — numbers speak in one colour across the site's cards. */}
          <span className="relative inline-flex h-[1.4em] w-[2ch] items-center justify-center overflow-hidden align-middle">
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.span
                key={page}
                custom={dir}
                variants={reduceMotion ? undefined : DIGIT_VARIANTS}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="absolute font-semibold tabular-nums text-[#ff6d05]"
              >
                {String(page + 1).padStart(2, '0')}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="text-[#fc83ff]/60"> / </span>
          <span className="font-semibold tabular-nums text-[#ff6d05]">
            {String(pageCount).padStart(2, '0')}
          </span>
        </span>
        <span aria-live="polite" className="sr-only">
          Page {page + 1} of {pageCount}
        </span>
      </p>

      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page === pageCount - 1}
        aria-label="Next page"
        className={BTN_CLASS}
      >
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </nav>
  );
}
