'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { fluid } from '@/lib/fluidScale';
import { cn } from '@/lib/utils';

// Shared chrome for the six /uses plates (issue #37): a two-digit ordinal, an
// amber eyebrow, the ember title, a right-aligned PROVENANCE line (where this
// plate's claims come from — live, counted at build, or hand-set), and a
// hairline rule that draws in as the plate reveals — the footer's Manifest
// board vocabulary, so the page reads as one instrument panel.
//
// Reveal gate: the plate's own `useInView` (once; its top 12% of the viewport
// in from the bottom edge — see the note at the call) AND `useLoaderRevealed`
// (the FooterReveal discipline — nothing animates below the fold, nothing is
// spent behind the intro loader). Children receive
// `{ revealed, reduceMotion, revealedAtRef }`: the header choreography here
// (rule draws left→right 450ms → eyebrow + title rise 8px and fade, 60ms
// later) is gated on the plate, and each body row / station / card then owns
// its OWN gate through useStagedReveal, so it animates when it arrives, not
// when the plate did (owner correction 2026-09-06 — on a plate taller than a
// viewport, everything below the fold used to finish before it was seen).
// Under reduced motion (OS or the ⌘K toggle, via the shared useReducedMotion)
// every layer renders at rest; the `.uses-anim` CSS guard in globals.css also
// pins the OS case on the very first paint, before React has read the media
// query.
//
// `useReducedMotion` is null on the server, so it is gated behind a mounted
// flag (the /journey pattern) — SSR and the first client render agree on the
// "hidden" pose, and the OS-level CSS guard covers the paint in between.
export const PLATE_EASE = [0.22, 0.61, 0.36, 1];

// Next renders every client component on the server too, where a layout effect
// can't run and React says so. The reveal stamp below is a client-only concern
// (nothing is `revealed` during SSR), so it falls back to useEffect there
// purely to keep the server render quiet.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// A figure inside a provenance or caption line wears the page title's ember,
// the words around it the line's grey — numbers read as the instrument's
// readout, words as its label (owner correction 2026-09-05, first on the
// Stack plate; every plate's readout uses this one).
export const Figure = ({ children }) => (
  <span className="font-semibold tabular-nums text-[#ff6d05]">{children}</span>
);

// Per-row stagger for plate bodies — shared so every plate's rows land in
// the same cadence.
export const rowMotion = (revealed, reduceMotion, index, base = 0.28) => ({
  initial: reduceMotion ? false : { opacity: 0, y: 8 },
  animate: revealed ? { opacity: 1, y: 0 } : { opacity: 0, y: reduceMotion ? 0 : 8 },
  transition: reduceMotion
    ? { duration: 0 }
    : { duration: 0.5, ease: PLATE_EASE, delay: base + index * 0.04 },
});

export default function Plate({
  slug,
  ordinal,
  eyebrow,
  title,
  provenance,
  children,
  className,
}) {
  const ref = useRef(null);
  // `amount: 'some'` + a negative bottom root margin, NOT a fraction of the
  // plate: the Stack ledger is ~6000px tall on a phone, and 15% of that can
  // never fit an 844px viewport — the plate would never reveal (found on the
  // phone pass, 2026-09-06). This reveals a plate once its top has climbed
  // 12% of the viewport in from the bottom edge, whatever its height: the
  // same beat as the old 15%-of-a-short-plate for the short plates, and a
  // working one for the tall.
  const inView = useInView(ref, { once: true, amount: 'some', margin: '0px 0px -12% 0px' });
  const loaderRevealed = useLoaderRevealed();
  const prefersReduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduceMotion = mounted && !!prefersReduced;
  const revealed = reduceMotion || (inView && loaderRevealed);

  // When this plate revealed, for the children's per-element gates
  // (useStagedReveal): an element arriving in the same beat cascades with its
  // siblings; one arriving later plays alone.
  //
  // The ORDERING is the whole difficulty, and it is why this was a render-phase
  // latch until now. React runs passive effects child-first, so a plain
  // `useEffect` here would stamp the time AFTER every row had already read it
  // as null — each row would see "no beat", take the arrived-alone branch, and
  // the plate would land as one slab with its cascade gone.
  //
  // A LAYOUT effect resolves it without writing during render. Layout effects
  // are also child-first among themselves, but the parent's layout effect still
  // runs before EVERY child's passive effect, so `useStagedReveal` finds the
  // stamp waiting for it one paint later. The read is if anything tighter than
  // before: the gap the children measure against SAME_BEAT_MS shrinks from
  // "parent render → child effect" to "parent layout effect → child effect".
  //
  // Writing it during render made the component impure — React may abandon a
  // render, and the stamp would then outlive a reveal that never committed
  // (React Doctor `no-ref-current-in-render`). A commit-phase write cannot.
  const revealedAtRef = useRef(null);
  useIsoLayoutEffect(() => {
    if (revealed && revealedAtRef.current == null && typeof performance !== 'undefined') {
      revealedAtRef.current = performance.now();
    }
  }, [revealed]);

  const headingId = `uses-${slug}-title`;
  const rise = (delay) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 8 },
    animate: revealed ? { opacity: 1, y: 0 } : { opacity: 0, y: reduceMotion ? 0 : 8 },
    transition: reduceMotion
      ? { duration: 0 }
      : { duration: 0.5, ease: PLATE_EASE, delay },
  });

  return (
    <section
      ref={ref}
      id={`uses-${slug}`}
      aria-labelledby={headingId}
      data-revealed={revealed ? 'true' : 'false'}
      // scroll-mt clears the fixed home-button island when the palette jumps
      // here (block:'start' would otherwise land the title under it).
      className={cn('uses-plate relative scroll-mt-24', className)}
    >
      <header
        className="grid grid-cols-[auto_1fr] items-end"
        style={{ columnGap: fluid(1) }}
      >
        {/* Ordinal — decorative: the heading carries the name. */}
        <motion.span
          aria-hidden="true"
          className="uses-anim uses-ordinal font-mono leading-none"
          {...rise(0.06)}
        >
          {ordinal}
        </motion.span>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <div className="min-w-0">
            <motion.p
              className="uses-anim uses-eyebrow font-mono uppercase"
              {...rise(0.06)}
            >
              {eyebrow}
            </motion.p>
            <motion.h2
              id={headingId}
              className="uses-anim uses-title font-semibold"
              {...rise(0.1)}
            >
              {title}
            </motion.h2>
          </div>
          {provenance ? (
            <motion.p
              className="uses-anim uses-provenance font-mono uppercase text-foreground/60"
              {...rise(0.16)}
            >
              {provenance}
            </motion.p>
          ) : null}
        </div>
      </header>

      {/* The hairline draws left→right as the plate arrives, then holds. */}
      <motion.div
        aria-hidden="true"
        className="uses-anim uses-rule"
        style={{ marginBlock: fluid(0.9) }}
        initial={reduceMotion ? false : { scaleX: 0 }}
        animate={{ scaleX: revealed ? 1 : reduceMotion ? 1 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: PLATE_EASE }}
      />

      <div className="uses-plate__body">
        {typeof children === 'function'
          ? children({ revealed, reduceMotion, revealedAtRef })
          : children}
      </div>
    </section>
  );
}
