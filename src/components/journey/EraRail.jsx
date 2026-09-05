'use client';

import React, { useEffect } from 'react';
import clsx from 'clsx';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

// The instrument panel, rebuilt as a clock: the years sit on the rim of a
// 300px-radius dial whose CENTRE is parked off-screen right, so only the
// leftmost sliver of the face arches into the page. The bezel is WOUND BY THE
// SCROLL ITSELF — a continuous scroll↦angle map over the measured era
// anchors, smoothed by one spring — so the dial creeps between eras like a
// coupled instrument instead of stepping, and each year swings onto the fixed
// ember needle at the midline just as the IntersectionObserver election
// ignites it (geometry and semantics agree by construction: both are driven
// by the same era boundaries).
//
// THE SAME FACE RENDERS TWICE off one shared rotor MotionValue:
//
//   · lg+ — the interactive instrument: a real <nav> of real <button>s at
//     z-30. aria-current carries the active state, clicking jumps to the era
//     anchor, and years swung far around the rim drop out of the tab order,
//   · below lg — a DECORATIVE echo behind the cards (owner direction: the
//     clock should survive small screens as background, untouchable): same
//     dial, same winding, but negative z under the cards' backdrop-blur (the
//     ghost-year depth trick), half opacity, aria-hidden, pointer-events-none
//     throughout, and <span>s where the buttons were — nothing focusable,
//     nothing touchable, purely the machinery showing through the gaps.
//
// Geometry, from one 0×0 anchor fixed at (viewport right edge, 50vh):
//
//   · the dial is a 2R square whose centre sits at x = R − DEPTH right of the
//     anchor, i.e. (R − DEPTH)px off-screen — DEPTH is how deep the rim cuts
//     into the viewport,
//   · every year/tick is placed `rotate(β) translateX(−R)`: rotate FIRST,
//     then push to the rim. framer-motion always composes translate before
//     rotate, the wrong order for orbital placement, so placement is a plain
//     CSS transform string and framer only ever owns properties on OTHER
//     elements (the rotor's rotation, each label's opacity/scale) — the same
//     never-share-a-transform rule as the cards' hover lift,
//   · angles come from YEAR VALUES, not list indices: β = −(maxYear − year) ·
//     STEP, so the dial is TRUE TO TIME — the 2021→2019 gap spans two steps,
//     and the silent 2020 exists as a position on the scale, marked by its
//     own slightly longer graduation even though no button lives there,
//   · the rotor angle for a year is +(maxYear − year) · STEP, so the year on
//     the needle always has total tilt β + ρ = 0 — exactly horizontal while
//     its neighbours tilt like numerals on a watch bezel.
//
// Reduced motion drops the continuous winding (scroll-scrubbed SPATIAL
// rotation — the same category as the cards' parallax, which also goes) and
// snaps the dial per elected era instead.
const STEP = 11.5; // degrees per YEAR of real time
const RADIUS = 300; // dial radius, px
const DEPTH = 80; // how far the rim reaches into the viewport, px
const TICKS_PER_YEAR = 4; // minute-style graduations per year of scale
const TAB_WINDOW = 40; // degrees from the needle within which a year is tabbable

// One year on the rim. Opacity tracks the LIVE rotor angle (not just the
// elected era), so labels dim continuously while the bezel is mid-swing.
// `interactive` picks the element: a real button on the lg+ instrument, an
// inert span on the decorative small-screen echo.
const DialYear = ({
  year,
  beta,
  isActive,
  rotor,
  canTab,
  interactive,
  reduceMotion,
  onJump,
}) => {
  const opacity = useTransform(rotor, (r) => {
    const away = Math.abs(beta + r);
    return Math.max(0.12, Math.min(1, 1.08 - away / 52));
  });

  const Tag = interactive ? motion.button : motion.span;

  return (
    <motion.div
      className="absolute left-1/2 top-1/2 h-0 w-0"
      style={{
        transform: `rotate(${beta}deg) translateX(-${RADIUS}px)`,
        opacity,
      }}
    >
      {/* Anchored by its RIGHT edge just past the rim point, so the label
          reads INTO the page — graduations outside the arc, numerals inside,
          gauge-style — and no year can ever clip off the viewport's right
          edge as the bezel turns. The -8px overhang lets the year's own
          radial tick straddle the bezel ring like the minute marks do. */}
      <div className="absolute top-0 -translate-y-1/2" style={{ right: -8 }}>
        <Tag
          {...(interactive
            ? {
                type: 'button',
                onClick: onJump,
                'aria-label': `Jump to ${year}`,
                'aria-current': isActive ? 'true' : undefined,
                tabIndex: canTab ? 0 : -1,
              }
            : {})}
          className={clsx(
            'group flex items-center gap-2 whitespace-nowrap py-1',
            // The wrapper is pointer-events-none (a 600px dial mostly
            // off-screen must never eat clicks); on the interactive face only
            // reachable years opt back in — beyond the tab window a year is
            // off the rim's visible arc anyway, and everything stays inert
            // while the rail is faded out. The decorative face never opts in.
            interactive && canTab
              ? 'pointer-events-auto'
              : 'pointer-events-none',
          )}
          style={{ originX: 1 }}
          animate={{ scale: isActive ? 1.16 : 1 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 260, damping: 22 }
          }
        >
          {/* Resting numerals wear the bezel's own Architect amber (#ffbb55),
              not grey — the last of the owner's grey-clock correction: with
              the rings, graduations and needle already on the site triad, a
              white/40 numeral was the one cold element left on a warm gilt
              instrument. Dim amber at rest, brighter amber on hover, and only
              the elected year ignites the needle's ember. */}
          <span
            className={clsx(
              'font-mono text-[10px] tracking-[0.25em] transition-colors duration-300',
              isActive
                ? 'text-[#ff6d05]'
                : 'text-[#ffbb55]/45 group-hover:text-[#ffbb55]/90',
            )}
          >
            {year}
          </span>
          {/* Radial tick — crosses the bezel ring at the rim, clock-mark
              style, and stretches when its year is on the needle. Resting
              ticks wear the subtitle pink (the "larger dashes" of the owner's
              palette correction); the active one stays the needle ember. */}
          <span
            className={clsx(
              'h-[2px] rounded-full transition-all duration-300',
              isActive
                ? 'w-7 bg-[#ff6d05] shadow-[0_0_8px_rgba(255,109,5,0.7)]'
                : 'w-4 bg-[#fc83ff]/50 group-hover:bg-[#fc83ff]/80',
            )}
          />
        </Tag>
      </div>
    </motion.div>
  );
};

// The complete face — bezel, rotor with graduations and years, needle —
// rendered once per breakpoint variant off the SAME rotor MotionValue (a
// MotionValue drives any number of subscribers, so both faces stay in
// perfect lockstep for free).
const DialFace = ({
  years,
  active,
  rotor,
  ticks,
  interactive,
  visible,
  maxYear,
  reduceMotion,
  onJump,
}) => (
  <>
    {/* The dial. Everything below is ornament except the interactive face's
        year buttons. */}
    <div
      className="absolute"
      style={{
        left: -DEPTH,
        top: -RADIUS,
        width: RADIUS * 2,
        height: RADIUS * 2,
      }}
    >
      {/* Static bezel — a hairline double ring; only its left arc is ever on
          screen. Warm amber (the Architect-paragraph #ffbb55), not grey —
          owner correction: the grey clock sat outside the site's palette. */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full border border-[#ffbb55]/25"
      />
      <div
        aria-hidden
        className="absolute -inset-[9px] rounded-full border border-[#ffbb55]/10"
      />

      {/* The rotor — the one element the spring rotates. */}
      <motion.div className="absolute inset-0" style={{ rotate: rotor }}>
        <div aria-hidden>
          {ticks.map(({ angle, silent }) => (
            <div
              key={angle}
              className="absolute left-1/2 top-1/2 h-0 w-0"
              style={{
                transform: `rotate(${angle}deg) translateX(-${RADIUS}px)`,
              }}
            >
              {/* Graduations in the theme, not grey (owner correction):
                  minor quarter-year marks take the eyebrow amber, the longer
                  silent-year marks the subtitle pink — same split as the
                  year ticks below (small = amber family, large = pink). */}
              <span
                className={clsx(
                  'absolute left-0 top-0 -translate-y-1/2',
                  silent
                    ? 'h-[1px] w-2.5 bg-[#fc83ff]/60'
                    : 'h-[1px] w-1.5 bg-[#ffaa2a]/60',
                )}
              />
            </div>
          ))}
        </div>

        {years.map((year) => (
          <DialYear
            key={year}
            year={year}
            beta={-(maxYear - year) * STEP}
            isActive={active === year}
            rotor={rotor}
            canTab={
              interactive &&
              visible &&
              Math.abs(year - active) * STEP <= TAB_WINDOW
            }
            interactive={interactive}
            reduceMotion={reduceMotion}
            onJump={() => onJump(year)}
          />
        ))}
      </motion.div>
    </div>

    {/* The needle — anchored to the screen edge in the gutter OUTSIDE the
        bezel, pointing left at whichever year the rotor has swung onto the
        midline; echoes the NOW beacon's ember. */}
    <div
      aria-hidden
      className="absolute top-0 -translate-y-1/2"
      style={{ right: 6 }}
    >
      <div className="flex items-center">
        <span
          className="h-0 w-0 border-y-4 border-r-[6px] border-y-transparent border-r-[#ff6d05]"
          style={{ filter: 'drop-shadow(0 0 4px rgba(255,109,5,0.8))' }}
        />
        <span
          className="h-[2px] w-10"
          style={{
            background: 'linear-gradient(to right, #ff6d05, transparent)',
          }}
        />
      </div>
    </div>
  </>
);

const EraRail = ({
  years,
  active,
  visible,
  progress,
  height,
  anchors,
  reduceMotion,
}) => {
  const maxYear = years[0];
  const rotorFor = (year) => (maxYear - year) * STEP;

  // The continuous winding: scroll y → piecewise-lerp over the measured era
  // anchors → rotor angle, smoothed by ONE spring. Before the first anchor
  // (the lead-in under the title) the dial rests on the newest year; past the
  // last it holds the oldest.
  const trackAngle = useTransform(progress, (v) => {
    if (!anchors.length || !height) return 0;
    const y = v * height;
    if (y <= anchors[0].y) return rotorFor(anchors[0].year);
    const last = anchors[anchors.length - 1];
    if (y >= last.y) return rotorFor(last.year);
    for (let i = 0; i < anchors.length - 1; i += 1) {
      if (y <= anchors[i + 1].y) {
        const t = (y - anchors[i].y) / (anchors[i + 1].y - anchors[i].y);
        const a0 = rotorFor(anchors[i].year);
        return a0 + t * (rotorFor(anchors[i + 1].year) - a0);
      }
    }
    return rotorFor(last.year);
  });
  const wound = useSpring(trackAngle, {
    stiffness: 55,
    damping: 15,
    mass: 0.9,
  });

  // Reduced-motion rotor: stepped per elected era, snapped, no winding.
  const stepped = useMotionValue(rotorFor(active));
  useEffect(() => {
    stepped.set((maxYear - active) * STEP);
  }, [stepped, active, maxYear]);

  const rotor = reduceMotion ? stepped : wound;

  const jump = (year) => {
    document.getElementById(`era-${year}`)?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  };

  // Graduations over the REAL year span (quarter-year subdivisions plus a
  // short run-out past each end so the scale never looks cropped). Whole-year
  // positions carry no minor tick when a listed year's own radial tick is the
  // major graduation there — but a SILENT year (2020: lived, nothing to
  // show) gets a longer, brighter mark: the scale stays true to time and
  // says so.
  const spanYears = maxYear - years[years.length - 1];
  const ticks = [];
  for (let q = -(TICKS_PER_YEAR - 1); q <= spanYears * TICKS_PER_YEAR + (TICKS_PER_YEAR - 1); q += 1) {
    const yearsBack = q / TICKS_PER_YEAR;
    if (q % TICKS_PER_YEAR === 0) {
      if (years.includes(maxYear - yearsBack)) continue;
      ticks.push({ angle: -yearsBack * STEP, silent: true });
    } else {
      ticks.push({ angle: -yearsBack * STEP, silent: false });
    }
  }

  const faceProps = {
    years,
    active,
    rotor,
    ticks,
    visible,
    maxYear,
    reduceMotion,
    onJump: jump,
  };

  return (
    <>
      {/* lg+ — the interactive instrument. */}
      <motion.nav
        aria-label="Timeline eras"
        className="pointer-events-none fixed right-0 top-1/2 z-30 hidden lg:block"
        initial={false}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.4, ease: 'easeOut' }}
      >
        <DialFace {...faceProps} interactive />
      </motion.nav>

      {/* Below lg — the decorative echo: same face, same rotor, behind the
          cards at negative z where their backdrop-blur softens it (the
          ghost-year depth trick), half strength, and inert to every input.
          A div, not a nav — it navigates nothing. */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed right-0 top-1/2 -z-10 select-none lg:hidden"
        initial={false}
        animate={{ opacity: visible ? 0.5 : 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.4, ease: 'easeOut' }}
      >
        <DialFace {...faceProps} interactive={false} />
      </motion.div>
    </>
  );
};

export default EraRail;
