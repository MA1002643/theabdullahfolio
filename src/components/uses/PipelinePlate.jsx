'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { fluid } from '@/lib/fluidScale';
import { USES_FLAGS } from '@/lib/flags';
import { PAD_X, buildGraph, buildTimeline, scheduleWindow } from '@/lib/uses/pipelineGraph';
import Plate, { Figure, PLATE_EASE } from './Plate';

// 03 · THE PIPELINE — one inline SVG schematic of how a commit becomes the
// page you are reading: GitHub → GitHub Actions (the real workflow names,
// read from .github/workflows at build — one CI lane per workflow) → Vercel
// build (the Node major Vercel resolves from `engines`) → Fluid compute (the
// counted API routes), with every external system the routes talk to hung
// off a service bus below and the daily cron dropping in from above. The
// geometry, labels and choreography come from src/lib/uses/pipelineGraph.js;
// this file renders them and runs the clock.
//
// Nothing overflows: the graph is laid out from each label's width. The
// server render uses calibrated glyph estimates; on mount the plate measures
// every <text> with getComputedTextLength() (user units, so the CSS scale is
// irrelevant) and re-lays with the real widths — a box is always wide enough
// for its words, and the viewBox grows rather than clipping if it must.
//
// Reveal (§9D): edges draw with framer's `pathLength` 0→1 in sequence, nodes
// rise in as their edge arrives, ONE ember rake crosses the plate — and then
// the flow starts: a commit packet rides the rail, the CI lanes fill one
// workflow at a time, the build hairline fills, the deploy lands and the
// runtime fans requests out along the bus (responses return in gold), then
// the cron drops in and warms GraphQL. Nodes go hot as packets land, with a
// ripple at the point of entry. The loop is a single requestAnimationFrame
// clock writing SVG attributes through refs — no React state per frame —
// that runs only while the plate is on screen and the tab is visible, and
// carries its phase across pauses. Strokes use `vector-effect:
// non-scaling-stroke` so they stay 1.25px at any width; below 768px the
// schematic scrolls inside its own overflow-x container instead of
// shrinking its type. Reduced motion (OS or ⌘K) → fully drawn, still, lanes
// and hairline full, no comets, no drift, no rake.
//
// Accessibility: role="img" + <title>, plus a visually-hidden ordered list of
// the nodes so the schematic reads as text.
const TAIL_UNITS = 44;
const RAKE_DELAY = 2.55;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (q) => (q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2);
const easeOut = (q) => 1 - Math.pow(1 - q, 3);

// A small arrowhead at the end of an edge.
const headPath = ({ x, y, dir }) =>
  dir === 'down'
    ? `M${x - 5} ${y} L${x + 5} ${y} L${x} ${y + 8} Z`
    : `M${x} ${y - 5} L${x} ${y + 5} L${x + 8} ${y} Z`;

const sameMeasure = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function PipelinePlate({ facts }) {
  const workflows = facts?.pipeline?.workflows ?? null;
  // The count is the readout (ember); the words are the label (grey).
  const provenance = workflows ? (
    <>
      <Figure>{workflows.length}</Figure> workflows · read from .github at build
    </>
  ) : (
    'schematic · hand-set'
  );

  return (
    <Plate
      slug="pipeline"
      ordinal="03"
      eyebrow="Delivery · commit to compute"
      title="The pipeline"
      provenance={provenance}
    >
      {({ revealed, reduceMotion }) => (
        <Schematic facts={facts} revealed={revealed} reduceMotion={reduceMotion} />
      )}
    </Plate>
  );
}

function Schematic({ facts, revealed, reduceMotion }) {
  const [measure, setMeasure] = useState(null);
  const graph = useMemo(() => buildGraph(facts, measure), [facts, measure]);
  const timeline = useMemo(() => buildTimeline(graph), [graph]);
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  // Every element the engine writes to, keyed by id — filled by callback refs.
  const els = useRef({ edges: {}, nodes: {}, ripples: {}, lanes: [], progress: null, hot: {} });

  // Measure the labels once mounted (and again when the web fonts settle).
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const next = {};
      for (const el of svg.querySelectorAll('text[data-m]')) {
        const [id, row] = el.dataset.m.split('|');
        let len = 0;
        try {
          len = el.getComputedTextLength();
        } catch {
          len = 0;
        }
        if (!(len > 0)) continue;
        (next[id] ||= {})[row] = len;
      }
      if (Object.keys(next).length === 0) return;
      setMeasure((prev) => {
        const merged = {};
        for (const [id, rows] of Object.entries(next)) merged[id] = { ...(prev?.[id] || {}), ...rows };
        return sameMeasure(prev, merged) ? prev : merged;
      });
    };
    run();
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(run).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const play = revealed;
  const draw = USES_FLAGS.pipelineDraw && !reduceMotion;
  const flow = USES_FLAGS.pipelineFlow && !reduceMotion;

  // The clock runs only while the schematic is on screen and the tab is
  // visible — nothing is spent on a plate nobody is looking at.
  const inView = useInView(wrapRef, { amount: 0.2 });
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden');
    onChange();
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  useFlowEngine({
    active: flow && play && inView && visible,
    timeline,
    els,
    startDelay: draw ? RAKE_DELAY + 1.1 : 0.4,
  });

  const drawn = play || !draw;
  const strokeMotion = (delay) => ({
    initial: draw ? { pathLength: 0 } : false,
    animate: { pathLength: drawn ? 1 : 0 },
    transition: draw ? { duration: 0.45, ease: PLATE_EASE, delay } : { duration: 0 },
  });
  const fadeMotion = (delay, duration = 0.2) => ({
    initial: draw ? { opacity: 0 } : false,
    animate: { opacity: drawn ? 1 : 0 },
    transition: draw ? { duration, delay } : { duration: 0 },
  });

  const visibleStrokes = [...graph.edges.filter((e) => e.visible), ...graph.strokes];
  const crons = facts?.pipeline?.crons ?? null;
  const singleCron = crons && crons.length === 1 ? crons[0] : null;

  return (
    <div>
      <div
        ref={wrapRef}
        className="uses-pipeline custom-bg-abt relative overflow-x-auto rounded-xl"
        style={{ padding: fluid(1) }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${graph.vb.w} ${graph.vb.h}`}
          role="img"
          aria-labelledby="uses-pipeline-title"
          className="uses-pipeline__svg block h-auto w-full"
        >
          <title id="uses-pipeline-title">
            Delivery pipeline: GitHub to GitHub Actions to Vercel build to Fluid compute, fanning
            out over a service bus to Upstash Redis, the AI Gateway, GitHub GraphQL, Spotify and
            SMTP, with a daily cron dropping in from above.
          </title>
          <defs>
            <linearGradient id="uses-node-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0f1426" stopOpacity="0.97" />
              <stop offset="1" stopColor="#050812" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="uses-node-stroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffcd5b" stopOpacity="0.62" />
              <stop offset="0.55" stopColor="#ffcd5b" stopOpacity="0.22" />
              <stop offset="1" stopColor="#ffcd5b" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="uses-node-stroke-hot" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff6d05" stopOpacity="0.95" />
              <stop offset="1" stopColor="#ffaa2a" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="uses-rake" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#ff6d05" stopOpacity="0" />
              <stop offset="0.5" stopColor="#ff6d05" stopOpacity="0.16" />
              <stop offset="1" stopColor="#ff6d05" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Edges — the rail, the cron drop, and the service bus, drawn in
              sequence; the ambient drift fades in behind each once drawn. */}
          {visibleStrokes.map((e) => (
            <g key={e.id}>
              <motion.path
                d={e.d}
                className="uses-pipeline__edge"
                fill="none"
                vectorEffect="non-scaling-stroke"
                {...strokeMotion(e.drawDelay)}
              />
              {flow ? (
                <motion.path
                  d={e.d}
                  className="uses-pipeline__drift"
                  fill="none"
                  aria-hidden="true"
                  {...fadeMotion(e.drawDelay + 0.5, 0.6)}
                />
              ) : null}
              {e.head ? (
                <motion.path
                  d={headPath(e.head)}
                  className="uses-pipeline__head"
                  {...fadeMotion(e.drawDelay + 0.42)}
                />
              ) : null}
            </g>
          ))}

          {/* Nodes — rise in as their edge lands. */}
          {graph.nodes.map((n) => (
            <motion.g
              key={n.id}
              className="uses-anim"
              ref={(el) => {
                els.current.nodes[n.id] = el;
              }}
              initial={draw ? { opacity: 0, y: 6 } : false}
              animate={drawn ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              transition={draw ? { duration: 0.4, ease: PLATE_EASE, delay: n.delay } : { duration: 0 }}
            >
              <rect
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx="5"
                className="uses-pipeline__node"
                fill="url(#uses-node-fill)"
                stroke="url(#uses-node-stroke)"
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx="5"
                className="uses-pipeline__node-hot"
                fill="none"
                stroke="url(#uses-node-stroke-hot)"
                vectorEffect="non-scaling-stroke"
                aria-hidden="true"
              />
              <circle className="uses-pipeline__led-halo" cx={n.x + n.w - 13} cy={n.y + 13} r="6" aria-hidden="true" />
              <circle className="uses-pipeline__led" cx={n.x + n.w - 13} cy={n.y + 13} r="2.2" aria-hidden="true" />
              <text x={n.x + PAD_X} y={n.y + n.text.kind} className="uses-pipeline__kind" data-m={`${n.id}|kind`}>
                {n.kind}
              </text>
              <text x={n.x + PAD_X} y={n.y + n.text.title} className="uses-pipeline__title" data-m={`${n.id}|title`}>
                {n.title}
              </text>
              <text x={n.x + PAD_X} y={n.y + n.text.sub} className="uses-pipeline__sub" data-m={`${n.id}|sub`}>
                {n.sub}
              </text>
              {n.id === 'actions' && graph.laneBox.count > 0 ? (
                <Lanes
                  box={graph.laneBox}
                  flow={flow}
                  register={(i, el) => {
                    els.current.lanes[i] = el;
                  }}
                />
              ) : null}
              {n.id === 'build' ? (
                <Bar
                  box={graph.progressBox}
                  flow={flow}
                  register={(el) => {
                    els.current.progress = el;
                  }}
                />
              ) : null}
              <circle
                className="uses-pipeline__ripple"
                r="0"
                aria-hidden="true"
                vectorEffect="non-scaling-stroke"
                ref={(el) => {
                  els.current.ripples[n.id] = el;
                }}
              />
            </motion.g>
          ))}

          {/* Comets — one rider per edge, positioned by the engine. */}
          {flow
            ? graph.edges.map((e) => (
                <g
                  key={`c-${e.id}`}
                  className="uses-pipeline__comet"
                  data-tone="ember"
                  aria-hidden="true"
                  ref={(el) => {
                    const E = els.current.edges;
                    if (!el) {
                      delete E[e.id];
                      return;
                    }
                    E[e.id] = {
                      ...(E[e.id] || {}),
                      group: el,
                      tail: el.querySelector('.uses-pipeline__comet-tail'),
                      head: el.querySelector('.uses-pipeline__comet-head'),
                      halo: el.querySelector('.uses-pipeline__comet-halo'),
                      tag: el.querySelector('.uses-pipeline__tag'),
                    };
                  }}
                >
                  <path
                    d={e.d}
                    pathLength="1"
                    className="uses-pipeline__comet-tail"
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle className="uses-pipeline__comet-halo" r="7" />
                  <circle className="uses-pipeline__comet-head" r="2.6" />
                  <text className="uses-pipeline__tag" />
                </g>
              ))
            : null}

          {/* The single rake of light — once, after the draw, then gone. */}
          {draw ? (
            <motion.rect
              aria-hidden="true"
              y="0"
              width="170"
              height={graph.vb.h}
              fill="url(#uses-rake)"
              style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}
              initial={{ x: -180 }}
              animate={{ x: play ? graph.vb.w + 20 : -180 }}
              transition={{ duration: 0.9, ease: 'easeInOut', delay: RAKE_DELAY }}
            />
          ) : null}
        </svg>
      </div>

      {/* Text equivalent of the schematic. */}
      <ol className="sr-only">
        {graph.nodes.map((n) => (
          <li key={n.id}>
            {n.kind.toLowerCase()} — {n.title}: {n.sub}
          </li>
        ))}
      </ol>

      {/* Honest terminal caption — the workflow `name:` fields verbatim
          (the footer CTA's caption vocabulary), and the cron's expression
          with the window Vercel's Hobby plan actually fires it in. Hidden
          when the build could not read the workflows: never a typed list. */}
      {graph.workflows ? (
        <motion.p
          className="uses-anim uses-caption font-mono text-foreground/60"
          style={{ marginTop: fluid(0.8) }}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: revealed ? 1 : reduceMotion ? 1 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.5, delay: 1.2 }}
        >
          <span className="text-[#ff6d05]" aria-hidden="true">
            ❯
          </span>{' '}
          <span className="text-[#ffaa2a]">main</span> · {graph.workflows.join(', ')}
          {singleCron ? (
            <>
              {' '}
              · <span className="text-[#ffaa2a]">cron</span>{' '}
              {singleCron.path.replace(/^\/api\//, '')}
              {singleCron.schedule ? (
                <>
                  {' '}
                  · <Figure>{singleCron.schedule}</Figure>
                  {scheduleWindow(singleCron.schedule) ? (
                    <>
                      {' '}
                      · fires <Figure>{scheduleWindow(singleCron.schedule).replace(/ UTC$/, '')}</Figure>{' '}
                      UTC (Hobby precision)
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          ) : graph.cron ? (
            <>
              {' '}
              · <span className="text-[#ffaa2a]">cron</span> {graph.cron.sub}
            </>
          ) : null}
        </motion.p>
      ) : null}
    </div>
  );
}

// One lane per workflow along the bottom of the CI node. Under the flow they
// start empty and fill in turn; still, they render full.
function Lanes({ box, flow, register }) {
  const laneW = (box.w - (box.count - 1) * box.gap) / box.count;
  return (
    <g aria-hidden="true">
      {Array.from({ length: box.count }, (_, i) => {
        const x = box.x + i * (laneW + box.gap);
        return (
          <g key={i}>
            <rect className="uses-pipeline__lane-track" x={x} y={box.y} width={laneW} height={box.h} rx="1" />
            <rect
              className="uses-pipeline__lane"
              x={x}
              y={box.y}
              width={flow ? 0 : laneW}
              height={box.h}
              rx="1"
              data-w={laneW}
              ref={(el) => register(i, el)}
            />
          </g>
        );
      })}
    </g>
  );
}

// The build's progress hairline.
function Bar({ box, flow, register }) {
  return (
    <g aria-hidden="true">
      <rect className="uses-pipeline__lane-track" x={box.x} y={box.y} width={box.w} height={box.h} rx="1" />
      <rect
        className="uses-pipeline__lane"
        x={box.x}
        y={box.y}
        width={flow ? 0 : box.w}
        height={box.h}
        rx="1"
        data-w={box.w}
        ref={register}
      />
    </g>
  );
}

// The clock. One rAF loop over the timeline, writing attributes straight to
// the SVG through the refs map. `phase` survives a pause (off screen, tab
// hidden, a re-layout after measuring) so the loop resumes where it stopped.
function useFlowEngine({ active, timeline, els, startDelay }) {
  const phaseRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    const { period, comets, hots, lanes, progress, drain } = timeline;
    const byEdge = {};
    for (const c of comets) (byEdge[c.edge] ||= []).push(c);
    const byNode = {};
    for (const h of hots) (byNode[h.node] ||= []).push(h);
    const startAt =
      performance.now() + (phaseRef.current == null ? startDelay * 1000 : -phaseRef.current * 1000);
    let raf = 0;
    let t = -1;

    const paint = (t, first) => {
      const E = els.current;

      // Comets: find the beat riding each edge right now.
      for (const [id, beats] of Object.entries(byEdge)) {
        const e = E.edges[id];
        if (!e || !e.tail) continue;
        const beat = t < 0 ? null : beats.find((b) => t >= b.t0 && t <= b.t0 + b.dur);
        if (!beat) {
          if (e.shown) {
            e.group.style.opacity = '0';
            e.shown = false;
          }
          continue;
        }
        const d = e.tail.getAttribute('d');
        if (e.d !== d) {
          e.d = d;
          e.len = e.tail.getTotalLength();
        }
        const q = (t - beat.t0) / beat.dur;
        const p = easeInOut(q);
        const pos = beat.dir < 0 ? 1 - p : p;
        const pt = e.tail.getPointAtLength(pos * e.len);
        if (e.beat !== beat) {
          e.beat = beat;
          const tail = Math.min(TAIL_UNITS / e.len, 0.6);
          e.tailFrac = tail;
          e.tail.setAttribute('stroke-dasharray', `${tail} 1`);
          e.group.dataset.tone = beat.tone;
          e.tag.textContent = beat.tag || '';
          e.tag.setAttribute('text-anchor', beat.tagSide === 'right' ? 'start' : 'middle');
        }
        e.tail.setAttribute('stroke-dashoffset', String(beat.dir < 0 ? -pos : e.tailFrac - pos));
        e.head.setAttribute('cx', pt.x);
        e.head.setAttribute('cy', pt.y);
        e.halo.setAttribute('cx', pt.x);
        e.halo.setAttribute('cy', pt.y);
        if (beat.tag) {
          if (beat.tagSide === 'right') {
            e.tag.setAttribute('x', pt.x + 10);
            e.tag.setAttribute('y', pt.y + 3);
          } else {
            e.tag.setAttribute('x', pt.x);
            e.tag.setAttribute('y', pt.y - 9);
          }
        }
        e.group.style.opacity = String(Math.min(1, q * 6, (1 - q) * 6));
        e.shown = true;
      }

      // Nodes: hot while a landing beat is live, with its ripple.
      for (const [id, beats] of Object.entries(byNode)) {
        const g = E.nodes[id];
        if (!g) continue;
        const beat = t < 0 ? null : beats.find((b) => t >= b.t0 && t <= b.t0 + b.dur);
        const hot = beat ? '1' : '';
        if (E.hot[id] !== hot) {
          E.hot[id] = hot;
          if (hot) g.dataset.hot = '1';
          else delete g.dataset.hot;
        }
        const rp = E.ripples[id];
        if (!rp) continue;
        if (!beat) {
          if (rp.getAttribute('opacity') !== '0') rp.setAttribute('opacity', '0');
          continue;
        }
        const q = (t - beat.t0) / beat.dur;
        if (rp.rippleBeat !== beat) {
          rp.rippleBeat = beat;
          rp.setAttribute('cx', beat.at.x);
          rp.setAttribute('cy', beat.at.y);
        }
        rp.setAttribute('r', String(3 + (beat.big ? 30 : 16) * easeOut(q)));
        rp.setAttribute('opacity', String((1 - q) * 0.55));
      }

      // Lanes and the build hairline: drain at the top of a new loop (never
      // on the first), fill during their beat, hold full until the next.
      const fill = (rect, q) => {
        const w = Number(rect.dataset.w) * clamp01(q);
        if (rect.laneW !== w) {
          rect.laneW = w;
          rect.setAttribute('width', String(w));
        }
      };
      const barQ = (t0, dur) => {
        if (t < 0) return 0;
        if (t < drain) return first ? 0 : 1 - t / drain;
        if (t < t0) return 0;
        return (t - t0) / dur;
      };
      if (lanes.count && E.lanes.length) {
        const slot = lanes.dur / lanes.count;
        E.lanes.forEach((rect, i) => rect && fill(rect, barQ(lanes.t0 + i * slot, slot)));
      }
      if (E.progress) fill(E.progress, barQ(progress.t0, progress.dur));
    };

    const frame = (now) => {
      const elapsed = (now - startAt) / 1000;
      t = elapsed < 0 ? -1 : elapsed % period;
      paint(t, elapsed < period);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      phaseRef.current = t >= 0 ? t : null;
    };
  }, [active, timeline, els, startDelay]);
}
