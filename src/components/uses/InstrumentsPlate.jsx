'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { projectGithubUrl } from '@/components/footer/footer-data';
import { useViewportCountUp } from '@/hooks/useViewportCountUp';
import { fluid } from '@/lib/fluidScale';
import Plate, { Figure } from './Plate';
import { riseProps, staged, useStagedReveal } from './useStagedReveal';

// 04 · THE INSTRUMENTS — three meter tiles: unit suites, e2e suites, API
// routes. Every figure AND every sub-line is COUNTED at build
// (buildFacts.js), never typed — the case counts the way the runner counts
// them (each-tables expanded), the routes' handlers per HTTP verb — and each
// tile links to the directory on GitHub so a recruiter can check the number
// against the files. (The routes tile once carried a typed "cached,
// fail-open"; true of the GET routes, not the POST ingest or the webhook —
// owner audit 2026-09-06.) A tile whose fact could not be read at build is
// simply absent — no fake zero.
//
// Reveal (owner ask, same day — "more noticeable"): each tile owns its
// viewport gate (useStagedReveal) and is DEALT onto the plate the way the
// ledger's cards are — it rises 26px while its top leans back from 9° and
// lands flat, the frame's glow settling from a soft bloom to the About rest
// value once it is down (`data-lit`, CSS). Then the instrument is etched:
// the graduation ruler along the top edge draws left→right behind a lit
// cutter that rides its front and burns out at the end (the Machine plate's
// engraving vocabulary), the figure counts up from zero once the tile has
// landed (the About page's shared `useViewportCountUp` — replay on
// re-entry, static under reduced motion), the label rises through its line
// mask, the note fades up and the arrow slides in last. Tiles sharing the
// row land left→right; tiles on screen when the plate reveals cascade 120ms
// apart. Reduced motion: at rest, figures at their final value.
const STEP_S = 0.12;
const COLUMN_S = 0.18;
const LAND_S = 0.6;
const ETCH_AT_S = 0.2;
const ETCH_S = 0.75;
const COUNT_AT_MS = 280;

function Meter({
  figure,
  label,
  sub,
  href,
  gridInView,
  revealed,
  reduceMotion,
  revealedAtRef,
  index,
}) {
  const { ref, on, delay } = useStagedReveal({
    revealed,
    reduceMotion,
    revealedAtRef,
    index,
    step: STEP_S,
    base: 0.1,
    columnStagger: COLUMN_S,
  });
  const at = (offset, duration) => staged(reduceMotion, delay, offset, duration);

  // The count starts once the tile is down — watched from zero, not caught
  // mid-climb behind the deal — and replays on re-entry via the grid's live
  // observer.
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (!on || landed) return undefined;
    if (reduceMotion) {
      setLanded(true);
      return undefined;
    }
    const id = setTimeout(() => setLanded(true), Math.round(delay * 1000) + COUNT_AT_MS);
    return () => clearTimeout(id);
  }, [on, landed, reduceMotion, delay]);
  const nodeRef = useRef(null);
  useViewportCountUp(nodeRef, {
    to: figure,
    inView: on && landed && gridInView,
    prefersReducedMotion: reduceMotion,
  });

  const rest = (x, y) => (reduceMotion ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x, y });
  const etch = at(ETCH_AT_S, ETCH_S);

  return (
    <motion.a
      ref={ref}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${figure} ${label} — ${sub} (opens the folder on GitHub in a new tab)`}
      data-lit={on ? 'true' : 'false'}
      className="uses-anim uses-meter custom-bg-abt group relative block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]"
      style={{
        padding: `${fluid(1.25)} ${fluid(1.25)} ${fluid(1)}`,
        transformPerspective: 900,
        originY: 1,
      }}
      initial={reduceMotion ? false : { opacity: 0, y: 26, rotateX: 9 }}
      animate={
        on
          ? { opacity: 1, y: 0, rotateX: 0 }
          : { opacity: 0, y: reduceMotion ? 0 : 26, rotateX: reduceMotion ? 0 : 9 }
      }
      transition={at(0, LAND_S)}
    >
      {/* The ruler etches in left→right behind its cutter. */}
      <motion.span
        aria-hidden="true"
        className="uses-anim uses-meter__ticks"
        style={{ originX: 0 }}
        initial={reduceMotion ? false : { scaleX: 0 }}
        animate={{ scaleX: on ? 1 : reduceMotion ? 1 : 0 }}
        transition={etch}
      />
      {reduceMotion ? null : (
        <motion.span
          aria-hidden="true"
          className="uses-meter__etch"
          initial={{ left: '0%', opacity: 0 }}
          animate={on ? { left: ['0%', '100%'], opacity: [0, 1, 1, 0] } : { left: '0%', opacity: 0 }}
          transition={
            on
              ? { left: etch, opacity: { ...etch, ease: 'linear', times: [0, 0.08, 0.85, 1] } }
              : { duration: 0 }
          }
        />
      )}

      <span className="flex items-baseline justify-between gap-3">
        {/* The digits are aria-hidden while they climb; the link's label
            carries the final value. */}
        <motion.span
          className="uses-anim uses-figure font-semibold"
          aria-hidden="true"
          initial={reduceMotion ? false : rest(0, 8)}
          animate={on ? { opacity: 1, x: 0, y: 0 } : rest(0, 8)}
          transition={at(0.16, 0.45)}
        >
          <span ref={nodeRef}>{reduceMotion ? figure : 0}</span>
        </motion.span>
        <motion.span
          aria-hidden="true"
          className="uses-anim inline-flex"
          initial={reduceMotion ? false : rest(-6, 6)}
          animate={on ? { opacity: 1, x: 0, y: 0 } : rest(-6, 6)}
          transition={at(0.42, 0.45)}
        >
          <ArrowUpRight className="h-4 w-4 shrink-0 text-[#ffaa2a] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </motion.span>
      </span>
      <span
        className="uses-label uses-mask mt-2 block font-mono uppercase text-[#ffaa2a]"
        aria-hidden="true"
      >
        <motion.span
          className="uses-anim uses-mask__in"
          initial={reduceMotion ? false : { y: '140%' }}
          animate={{ y: on ? '0%' : reduceMotion ? '0%' : '140%' }}
          transition={at(0.3, 0.55)}
        >
          {label}
        </motion.span>
      </span>
      <motion.span
        className="uses-anim uses-note mt-1 block text-foreground/60"
        aria-hidden="true"
        {...riseProps(on, reduceMotion, at(0.38, 0.5), 6)}
      >
        {sub}
      </motion.span>
    </motion.a>
  );
}

export default function InstrumentsPlate({ facts }) {
  const ref = useRef(null);
  // Live (not once): the count-ups replay when the grid comes back.
  const gridInView = useInView(ref, { amount: 0.4 });
  const unit = facts?.instruments?.unit ?? null;
  const e2e = facts?.instruments?.e2e ?? null;
  const apiRoutes = facts?.instruments?.apiRoutes ?? null;
  const apiMethods = facts?.instruments?.apiMethods ?? null;
  // "13 GET · 8 POST · 1 DELETE" — verbs present, HTTP order (the reader's).
  const methodsSub =
    apiMethods && Object.keys(apiMethods).length > 0
      ? Object.entries(apiMethods)
          .map(([verb, n]) => `${n} ${verb}`)
          .join(' · ')
      : null;

  // `slug` is the React key, peeled off before the spread below — React
  // refuses a `key` that arrives inside a spread object.
  const tiles = [
    unit && {
      slug: 'unit',
      figure: unit.suites,
      label: unit.suites === 1 ? 'unit suite' : 'unit suites',
      sub: `${unit.cases} test cases · Vitest`,
      href: `${projectGithubUrl}/tree/main/tests/unit`,
    },
    e2e && {
      slug: 'e2e',
      figure: e2e.suites,
      label: e2e.suites === 1 ? 'e2e suite' : 'e2e suites',
      sub: `${e2e.cases} scenarios · Playwright`,
      href: `${projectGithubUrl}/tree/main/tests/e2e`,
    },
    apiRoutes != null && {
      slug: 'api',
      figure: apiRoutes,
      label: apiRoutes === 1 ? 'API route' : 'API routes',
      sub: methodsSub ? `route handlers · ${methodsSub}` : 'route handlers',
      href: `${projectGithubUrl}/tree/main/src/app/api`,
    },
  ].filter(Boolean);

  if (tiles.length === 0) return null;

  return (
    <Plate
      slug="instruments"
      ordinal="04"
      eyebrow="Quality · counted at build"
      title="The instruments"
      provenance={
        facts?.builtAtLabel ? (
          <>
            counted at build · <Figure>{facts.builtAtLabel}</Figure>
          </>
        ) : (
          'counted at build'
        )
      }
    >
      {({ revealed, reduceMotion, revealedAtRef }) => (
        <div ref={ref} className="grid sm:grid-cols-3" style={{ gap: fluid(1) }}>
          {tiles.map(({ slug, ...t }, i) => (
            <Meter
              key={slug}
              {...t}
              index={i}
              gridInView={gridInView}
              revealed={revealed}
              reduceMotion={reduceMotion}
              revealedAtRef={revealedAtRef}
            />
          ))}
        </div>
      )}
    </Plate>
  );
}
