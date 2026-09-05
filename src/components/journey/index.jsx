'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'framer-motion';
import { journeyData } from '@/app/data';
import { resumeUrl } from '@/components/footer/footer-data';
import FireText from '@/components/shared/FireText';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import TimelineSpine from './TimelineSpine';
import TimelineNode from './TimelineNode';
import TimelineAtlas from './TimelineAtlas';
import GhostYear from './GhostYear';
import EraRail from './EraRail';
import JourneyPalette from './JourneyPalette';

// The end-cap tally — the whole record in three figures. All three derive
// from the DATA, never the clock (the span is newest era year − earliest
// start year), so the line is SSR-deterministic: it moves when an entry is
// added, which is exactly when the story it summarises moves.
const TALLY = (() => {
  const firstYear = Math.min(
    ...journeyData.map((m) => Number(m.start.slice(0, 4))),
  );
  return {
    years: journeyData[0].year - firstYear,
    entries: journeyData.length,
    tracks: new Set(journeyData.map((m) => m.type)).size,
  };
})();

// /journey (issue #38) — the scroll-driven career timeline. This container
// owns every piece of shared scroll state so the four instruments can never
// disagree with each other:
//
//   · one scroll progress (the 62%-viewport line crossing the list) drives the
//     spine fill AND the comet — spring-smoothed so the charge glides instead
//     of ticking, raw under reduced motion (the fill is a user-driven scrub,
//     the /about word-reveal category, so it stays; the smoothing inertia is
//     motion and goes),
//   · one IntersectionObserver band (the middle 10% of the viewport) elects
//     the active era for the ghost-year odometer and the era dial,
//   · one ResizeObserver survey (height + every marker centre) shapes the
//     serpentine spine and gives the comet its ride along the curve,
//   · one visibility gate (timeline on screen + intro loader lifted) fades the
//     two fixed instruments in and out so neither ever floats over the footer,
//   · one era election + one track filter also feed the inline overlap atlas
//     (TimelineAtlas, between the title and the list): the elected year lights
//     that era's bars, and the atlas's chips dim non-matching bars AND cards
//     through the same state — the two views can never disagree.
//
// `useReducedMotion` is gated behind a mounted flag — it returns null on the
// server, so reading it raw makes SSR and the first client render disagree
// under prefers-reduced-motion (the footer components document the same
// pattern; PageTitle's unguarded read is a known pre-existing mismatch we're
// not adding to).
const SCROLL_LINE = 0.62;

const JourneyTimeline = () => {
  const listRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const prefersReduced = useReducedMotion();
  const reduceMotion = mounted && !!prefersReduced;
  const revealed = useLoaderRevealed();

  useEffect(() => {
    setMounted(true);
  }, []);

  const { scrollYProgress } = useScroll({
    target: listRef,
    offset: [`start ${SCROLL_LINE}`, `end ${SCROLL_LINE}`],
  });
  const smoothed = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 28,
    mass: 0.4,
    restDelta: 0.001,
  });
  const fill = reduceMotion ? scrollYProgress : smoothed;

  // Spine survey: container height, every marker centre, and the serpentine
  // amplitude for the current layout — one measurement pass feeding the snake
  // path AND the comet track. Observed unconditionally (a conditional
  // observer that only exists at some widths goes stale on a cold load at the
  // other — the home hero's ring-fit lesson). Marker centres come from the
  // marker wrappers themselves (data-spine-marker), not from re-deriving the
  // node padding stack, so a spacing tweak in TimelineNode can never desync
  // the curve. The amplitude tracks the axis: md+ centres the spine between
  // the card columns (4rem clear each side — 46px sways inside that), below
  // md the axis is the left rail with cards starting at 3rem (12px fits).
  const [spineHeight, setSpineHeight] = useState(0);
  const [markerYs, setMarkerYs] = useState([]);
  const [eraAnchors, setEraAnchors] = useState([]);
  const [amplitude, setAmplitude] = useState(46);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const measure = () => {
      setSpineHeight(el.offsetHeight);
      setAmplitude(window.matchMedia('(min-width: 768px)').matches ? 46 : 12);
      const listTop = el.getBoundingClientRect().top;
      const ys = Array.from(
        el.querySelectorAll('[data-spine-marker]'),
        (marker) => {
          const rect = marker.getBoundingClientRect();
          return rect.top - listTop + rect.height / 2;
        },
      );
      // Keep the previous array identity when nothing moved — every new
      // identity rebuilds the path geometry downstream.
      setMarkerYs((prev) =>
        prev.length === ys.length &&
        prev.every((y, i) => Math.abs(y - ys[i]) < 0.5)
          ? prev
          : ys,
      );
      // Era anchors — the measured y of each era's FIRST marker, in the same
      // DOM order as journeyData. They give the era dial its continuous
      // scroll↦angle map, so the bezel winds between eras instead of
      // stepping on election.
      const anchors = [];
      journeyData.forEach((m, i) => {
        if (
          ys[i] !== undefined &&
          (i === 0 || journeyData[i - 1].year !== m.year)
        ) {
          anchors.push({ year: m.year, y: ys[i] });
        }
      });
      setEraAnchors((prev) =>
        prev.length === anchors.length &&
        prev.every(
          (a, i) =>
            a.year === anchors[i].year && Math.abs(a.y - anchors[i].y) < 0.5,
        )
          ? prev
          : anchors,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Era election: whichever node's box crosses the middle band of the viewport
  // last is the era on the instruments. Node list is static after mount, so
  // one query is enough.
  const [activeYear, setActiveYear] = useState(journeyData[0].year);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        // One delivery can carry several newly-intersecting nodes — a dial
        // jump landing on a card boundary, a fast scroll batching
        // transitions (the band is 10% of the viewport, so two adjacent
        // nodes can share it). Elect ONCE, from the node occupying the most
        // of the band: intersectionRect height, not intersectionRatio,
        // which divides by the node's OWN height and would hand the
        // election to a short card covering less of the band. Entry order
        // is spec-defined (observe() insertion order), but the election
        // shouldn't hang off that subtlety.
        let best = null;
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          if (
            !best ||
            entry.intersectionRect.height > best.intersectionRect.height
          ) {
            best = entry;
          }
        });
        if (best) setActiveYear(Number(best.target.dataset.eraYear));
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    el.querySelectorAll('[data-era-year]').forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, []);

  // The fixed instruments live only while the reader is genuinely IN the
  // timeline. A bare `amount: 0` lit them the moment any pixel of the list
  // touched the viewport — i.e. while the atlas was still the content on the
  // way down, and the moment the EST. end-cap peeked in on the way up from
  // the footer (owner correction, both directions). The asymmetric band
  // fixes both edges: the list must reach 45% down the viewport before the
  // instruments ignite (the first era pill crossing mid-screen — the
  // timeline has actually arrived), and its tail must still hang below the
  // upper 35% for them to stay lit (so they cut out as the last card leaves,
  // not while the end-cap and footer own the screen).
  const timelineOnScreen = useInView(listRef, {
    amount: 0,
    margin: '-45% 0px -35% 0px',
  });
  const instrumentsVisible = revealed && timelineOnScreen;

  // The atlas's track filter — held here, not in the atlas, because it dims
  // BOTH views: the atlas bars and the timeline cards below them.
  const [trackFilter, setTrackFilter] = useState('all');

  const years = [...new Set(journeyData.map((m) => m.year))];

  return (
    // overflow-x-CLIP, not hidden: cards waiting on their entrance sit at
    // x ±56, which is past the viewport edge on phone widths where every card
    // hugs the right rail — clip trims that without minting a scroll container
    // (the issue #47 sticky lesson). The fixed instruments (GhostYear, EraRail)
    // are untouched: position:fixed under a transform-free ancestor is laid
    // out against the viewport, outside this clip.
    //
    // px-2: breathing room for the card glow (owner correction, pixel-
    // verified). A card whose edge lands ON the section edge — the outer
    // edge of every alternating desktop card, and every card's right edge
    // on mobile — had custom-bg-abt's 6px ember box-shadow amputated by
    // this very clip, so one side read flatter than the other three. 8px
    // of padding keeps every card clear of the clip line.
    <section
      aria-label="Journey timeline"
      className="relative mx-auto mt-16 w-full max-w-5xl overflow-x-clip px-2 md:mt-20"
    >
      <GhostYear
        year={activeYear}
        visible={instrumentsVisible}
        reduceMotion={reduceMotion}
      />
      <EraRail
        years={years}
        active={activeYear}
        visible={instrumentsVisible}
        progress={scrollYProgress}
        height={spineHeight}
        anchors={eraAnchors}
        reduceMotion={reduceMotion}
      />

      {/* The overlap atlas — between the page title and the timeline: the
          parallel view first, the sequential story under it. */}
      <TimelineAtlas
        activeYear={activeYear}
        filter={trackFilter}
        onFilter={setTrackFilter}
        revealed={revealed}
        reduceMotion={reduceMotion}
      />

      <div ref={listRef} className="relative pt-10">
        <TimelineSpine
          progress={fill}
          height={spineHeight}
          markerYs={markerYs}
          amplitude={amplitude}
          revealed={revealed}
          reduceMotion={reduceMotion}
        />

        <ol className="relative list-none">
          {journeyData.map((milestone, index) => (
            <TimelineNode
              key={milestone.id}
              milestone={milestone}
              isLeft={index % 2 !== 0}
              isEraStart={
                index === 0 || journeyData[index - 1].year !== milestone.year
              }
              revealed={revealed}
              reduceMotion={reduceMotion}
              dimmed={trackFilter !== 'all' && milestone.type !== trackFilter}
            />
          ))}
        </ol>
      </div>

      {/* Origin end-cap — where the spine's gold finally lands: the EST.
          flourish, the whole record tallied in three figures, and the page's
          one outbound hand-off. The scroll story IS the interactive CV, so
          it ends by offering the paper one (same PDF the footer's Résumé
          link serves — imported from footer-data, never a second path). */}
      {/* All three lines wear the contact intro's per-word fire ink (owner
          correction — the flat gold/amber tints were superseded). The link's
          hover flips the whole phrase to the page-title ember: FireText
          words carry INLINE clip fills, so the flip lives in globals.css
          (.journey-cv-link) where !important can beat them. */}
      <div className="mt-6 pb-4 text-center">
        <p
          aria-hidden
          className="font-mono text-[10px] tracking-[0.35em]"
        >
          <FireText text="EST. 2018 · BOLTON, UK" />
        </p>
        <p className="mt-2 font-mono text-[10px] tracking-[0.3em]">
          <FireText
            text={`${TALLY.years} YRS · ${TALLY.entries} ENTRIES · ${TALLY.tracks} TRACKS`}
          />
        </p>
        <a
          href={resumeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the CV PDF (new tab)"
          className="journey-cv-link mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.2em]"
        >
          <FireText text="THE PAPER VERSION →" />
        </a>
      </div>

      {/* ⌘K — /journey's action set for the shared command palette. */}
      <JourneyPalette />
    </section>
  );
};

export default JourneyTimeline;
