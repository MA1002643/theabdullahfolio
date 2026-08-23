'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { journeyData } from '@/app/data';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import TimelineSpine from './TimelineSpine';
import TimelineNode from './TimelineNode';
import GhostYear from './GhostYear';
import EraRail from './EraRail';

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
//     two fixed instruments in and out so neither ever floats over the footer.
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
      setAmplitude(
        window.matchMedia('(min-width: 768px)').matches ? 46 : 12,
      );
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
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveYear(Number(entry.target.dataset.eraYear));
          }
        });
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    el.querySelectorAll('[data-era-year]').forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, []);

  // The fixed instruments live only while the timeline itself is on screen.
  const timelineOnScreen = useInView(listRef, { amount: 0 });
  const instrumentsVisible = revealed && timelineOnScreen;

  const years = [...new Set(journeyData.map((m) => m.year))];

  return (
    // overflow-x-CLIP, not hidden: cards waiting on their entrance sit at
    // x ±56, which is past the viewport edge on phone widths where every card
    // hugs the right rail — clip trims that without minting a scroll container
    // (the issue #47 sticky lesson). The fixed instruments (GhostYear, EraRail)
    // are untouched: position:fixed under a transform-free ancestor is laid
    // out against the viewport, outside this clip.
    <section
      aria-label="Journey timeline"
      className="relative mx-auto mt-16 w-full max-w-5xl overflow-x-clip md:mt-20"
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
            />
          ))}
        </ol>
      </div>

      {/* Origin end-cap — where the spine's gold finally lands. */}
      <p
        aria-hidden
        className="mt-6 pb-4 text-center font-mono text-[10px] tracking-[0.35em] text-[#f9d174]/60"
      >
        EST. 2018 · BOLTON, UK
      </p>
    </section>
  );
};

export default JourneyTimeline;
