'use client';

// Giant footer wordmark drawn as HORIZONTAL "STRINGS" — each letter is built
// from a stack of thin horizontal line segments (à la trionn.com's footer) —
// while keeping this site's look: the wordmark is half-sunk and fades out
// toward the bottom (that fade is the same CSS mask as before, untouched).
//
// Behaviour (a faithful re-implementation of trionn's guitar-string footer; the
// technique only — no third-party code or artwork is reused):
//   • The name is rasterised once to an offscreen canvas, then SCANLINE-SAMPLED:
//     for every few rows we find the filled x-runs and emit one horizontal
//     string per run. That reproduces the "letters made of lines" construction
//     for arbitrary text.
//   • Hovering a string PLUCKS it: the straight segment is redrawn as a pinned-
//     end standing wave — each point displaced by sin(π·t) (zero at both ends,
//     max in the middle) × sin(2π·cycles·t + phase) (a travelling wave). On
//     pluck amp+speed jump, then ring down to zero (~0.9s); a click plucks
//     harder. Sweeping the cursor across the name strums it.
//   • Every pluck plays the NEXT note of a melody (footerMelody.js) and advances
//     a cursor — so "strumming" performs an original qawwali-style phrase from
//     start to finish, then loops; after an idle pause it restarts from note 0.
//   • Physics run on a single rAF, paused off-screen via IntersectionObserver.
//   • Hit-testing is done from window pointer events mapped into the SVG's
//     viewBox, because the SVG sits behind the footer content at -z-10 and is
//     pointer-events:none (so it never steals clicks from the links above).
//
// Purely decorative + aria-hidden. Under reduced motion the strings don't move
// (no wave); hovering still rings the note.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { getPluckSynth } from './pluckSynth';
import { MELODY, PERFORMANCE } from './footerMelody';

// --- Geometry (matches the old wordmark's placement, so the fade is identical)
const VIEW_W = 1200;
const VIEW_H = 240;
const TARGET_W = 1160; // horizontal span the wordmark fills
const BASE_Y = 120; // vertical centre of the text
const FONT_PX = 150;
const OVERSAMPLE = 2; // canvas super-sampling for clean run edges

// --- String sampling
const ROW_STEP = 7.5; // vertical gap between strings, in viewBox units
const MIN_RUN = 4; // ignore filled runs shorter than this (viewBox units)
const ALPHA_CUT = 110; // 0..255 fill threshold

// --- Pluck physics (viewBox units / unitless), tuned to trionn's feel
const HOVER_AMP = 6;
const CLICK_AMP = 10;
const HOVER_SPEED = 16;
const CLICK_SPEED = 24;
const CYCLES = 2.2; // wavelengths along a plucked string
const DECAY_TAU = 0.2; // ring-down time constant (≈0.9s to settle)
const WAVE_STEPS = 20; // points per plucked path
const MIN_NOTE_GAP = 70; // floor between melody notes (ms) — avoids garbling
const RESTART_IDLE_MS = 3500; // after this idle gap, the phrase restarts from note 0

// --- Entrance strum. The first time the wordmark scrolls into view it is
// "strummed on": every string draws itself in left→right, and a gentle pluck
// ripple chases the draw front so each string rings the instant it lands. It is
// a one-shot, gated on the intro loader so it's never spent behind the overlay,
// silent by default (it sets the string physics directly — no melody/audio side
// effects), and the wave is skipped under reduced motion (a plain fade remains).
const REVEAL_SWEEP_MS = 1200; // time for the strum front to cross the whole name
const REVEAL_DRAW_S = 0.5; // per-string draw-in duration
const REVEAL_PLUCK_LAG = 0.42; // ripple trails the draw front (fraction of sweep)
const REVEAL_AMP = 5; // gentle pluck so the entrance rings, never thrashes
const REVEAL_SPEED = 14;

// --- Self-playing strum (touch surfaces). With no hover to perform the melody,
// turning the sound on plays the wordmark FOR the visitor: it performs the
// PHRASED melody (footerMelody.js PERFORMANCE — real note durations, breaths and
// dynamics, so it sounds sung rather than metronomic) while a vertical "strum
// band" marches left→right across the name, plucking the strings it crosses so
// the guitar visibly plays itself, harder on the accented notes. Only ever
// engaged on a coarse/touch pointer (see index.jsx autoPlay) — a mouse/trackpad
// user always plays it by hand.
const AUTO_NOTE_MS = 300; // fallback gap if a performance note is missing a duration
const AUTO_COLUMNS = 22; // strum-band steps to cross the whole name once
const AUTO_AMP = 5.5; // base pluck; scaled per note by the melody's velocity
const AUTO_SPEED = 15;

// Horizontal colour sweep across the wordmark. The footer's ambient plate warms
// the LEFT with an ember (orange) orb and cools the RIGHT with an amethyst one
// (see .footer-atmosphere). A flat-orange wordmark therefore washed out on the
// left (orange strings on an orange glow). So the strings now run amethyst on
// the left → brand orange on the right: each end sits against its OPPOSITE orb,
// for strong contrast on both sides, and the right stays the original orange.
// A magenta bridge stop keeps the violet→orange blend from muddying mid-way.
const STROKE = '#ff7a12'; // brand orange — the wordmark's base + right-hand colour
const STROKE_ACCENT = '#a21cff'; // vivid electric violet — sharp, high-chroma left accent
const STROKE_MID = '#e83cca'; // saturated magenta bridge that keeps the sweep punchy
const GRAD_ID = 'footer-wordmark-strings'; // <linearGradient> id referenced by stroke
const GRAD_X1 = (VIEW_W - TARGET_W) / 2; // left edge of the wordmark span (=20)
const GRAD_X2 = VIEW_W - GRAD_X1; // right edge of the wordmark span (=1180)
const STROKE_OPACITY = 0.95; // near-solid so the lines are bold, not ghosted
const STROKE_W = 1.2; // slightly heavier hairline for a crisper edge

// Resolve next/font's generated Inter family name so canvas can render it.
function resolveInterFamily() {
  if (typeof document === 'undefined') return '700 sans-serif';
  const probe = document.createElement('span');
  probe.style.cssText =
    'position:absolute;left:-9999px;font-weight:700;font-family:var(--font-inter),sans-serif';
  document.body.appendChild(probe);
  const fam = getComputedStyle(probe).fontFamily || 'sans-serif';
  probe.remove();
  return fam;
}

// Rasterise the name and scan it into horizontal string segments.
function buildStrings(name) {
  const cw = VIEW_W * OVERSAMPLE;
  const ch = VIEW_H * OVERSAMPLE;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  const fam = resolveInterFamily();
  ctx.font = `700 ${FONT_PX * OVERSAMPLE}px ${fam}`;
  const natural = ctx.measureText(name).width || 1;
  const scaleX = (TARGET_W * OVERSAMPLE) / natural; // fit to the target span

  ctx.clearRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate((VIEW_W * OVERSAMPLE) / 2, BASE_Y * OVERSAMPLE);
  ctx.scale(scaleX, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(name, 0, 0);
  ctx.restore();

  const { data } = ctx.getImageData(0, 0, cw, ch);
  const rowStepPx = Math.max(1, Math.round(ROW_STEP * OVERSAMPLE));
  const minRunPx = MIN_RUN * OVERSAMPLE;
  const segs = [];

  for (let yPx = Math.floor(rowStepPx / 2); yPx < ch; yPx += rowStepPx) {
    const rowBase = yPx * cw;
    let runStart = -1;
    for (let x = 0; x < cw; x++) {
      const a = data[(rowBase + x) * 4 + 3];
      const on = a >= ALPHA_CUT;
      if (on && runStart < 0) {
        runStart = x;
      } else if (!on && runStart >= 0) {
        if (x - runStart >= minRunPx) {
          segs.push({ x1: runStart / OVERSAMPLE, x2: x / OVERSAMPLE, y: yPx / OVERSAMPLE });
        }
        runStart = -1;
      }
    }
    if (runStart >= 0 && cw - runStart >= minRunPx) {
      segs.push({ x1: runStart / OVERSAMPLE, x2: cw / OVERSAMPLE, y: yPx / OVERSAMPLE });
    }
  }

  // The audible pitch of a pluck comes from the shared melody sequencer (see
  // footerMelody.js), not the string itself — so a string only needs geometry.
  return segs;
}

// Build the path string for a segment at a given amplitude/phase.
function pathFor(s, amp, phase) {
  if (amp <= 0.02) return `M ${s.x1.toFixed(2)} ${s.y.toFixed(2)} H ${s.x2.toFixed(2)}`;
  const dx = s.x2 - s.x1;
  let d = `M ${s.x1.toFixed(2)} ${s.y.toFixed(2)}`;
  for (let i = 1; i <= WAVE_STEPS; i++) {
    const t = i / WAVE_STEPS;
    const env = Math.sin(Math.PI * t); // pinned at both ends
    const wave = Math.sin(2 * Math.PI * CYCLES * t + phase);
    const px = s.x1 + dx * t;
    const py = s.y + wave * amp * env;
    d += ` L ${px.toFixed(2)} ${py.toFixed(2)}`;
  }
  return d;
}

export default function FooterWordmark({
  name,
  reduced = false,
  soundOn = false,
  autoPlay = false,
  canHover = true,
}) {
  const svgRef = useRef(null);
  const elsRef = useRef([]); // <path> DOM nodes, index-aligned with strings
  const physRef = useRef([]); // mutable per-string physics state
  const rectRef = useRef(null); // cached SVG client rect (client→viewBox map)
  const rafRef = useRef(0);
  const lastTRef = useRef(0);
  const hoverIdxRef = useRef(-1);
  const melodyIdxRef = useRef(0); // cursor into MELODY (the "song" position)
  const lastNoteRef = useRef(-1e9); // timestamp of the last note played
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const strumRef = useRef(null); // one-shot entrance strum, set up with the physics
  const sweepRef = useRef(null); // {start, done[]} while the strum front is crossing
  const autoTickRef = useRef(null); // self-strum tick, set up with the physics
  const autoXRef = useRef(0); // x-position of the marching self-strum band
  const songIdxRef = useRef(0); // cursor into PERFORMANCE (the self-play position)

  // The live synth is the sound ONLY where the visitor can hover to play it (a
  // mouse / trackpad). On a touch surface the recorded track is the sound
  // instead, so the synth stays muted there even with sound on — the auto-strum
  // still runs, but purely for its visuals (setMuted makes synth.play a no-op, so
  // the strum and the track never sound at once, and a stray tap-pluck is silent).
  useEffect(() => {
    getPluckSynth().setMuted(!(soundOn && canHover));
  }, [soundOn, canHover]);

  const [strings, setStrings] = useState([]);

  const loaderRevealed = useLoaderRevealed();
  const [revealed, setRevealed] = useState(false);

  // Left/right x-extent of the whole wordmark, so both the CSS draw-in delay and
  // the pluck ripple can be positioned by each string's horizontal spot.
  const xBounds = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const s of strings) {
      if (s.x1 < min) min = s.x1;
      if (s.x2 > max) max = s.x2;
    }
    return { min: Number.isFinite(min) ? min : 0, span: max - min || 1 };
  }, [strings]);

  // 1) Generate the strings once the font is ready.
  useEffect(() => {
    let cancelled = false;
    const gen = () => {
      if (cancelled) return;
      // The decorative "guitar-string" wordmark is always set in all-caps, even
      // though brand.name is stored in normal case (so the masthead + copyright
      // keep their casing). Rasterise the upper-cased text into the strings.
      const segs = buildStrings(name.toUpperCase());
      if (segs.length && !cancelled) setStrings(segs);
    };
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(gen).catch(gen);
    } else {
      gen();
    }
    return () => {
      cancelled = true;
    };
  }, [name]);

  // 2) Build physics state (linked to the rendered <path> nodes) + wire pointer
  //    events, audio and the animation loop.
  useEffect(() => {
    if (!strings.length) return;
    physRef.current = strings.map((s) => ({
      ...s,
      amp: 0,
      phase: 0,
      speed: 0,
      el: null,
    }));
    for (let i = 0; i < physRef.current.length; i++) {
      physRef.current[i].el = elsRef.current[i] || null;
    }

    const synth = getPluckSynth();

    const refreshRect = () => {
      rectRef.current = svgRef.current ? svgRef.current.getBoundingClientRect() : null;
    };
    refreshRect();

    // Map a client point into the SVG viewBox. Aspect ratio matches (h-auto
    // w-full over a 5:1 viewBox), so the mapping is a uniform scale with no
    // letterboxing; the CSS translateY is already baked into the rect.
    const toViewBox = (clientX, clientY) => {
      const r = rectRef.current;
      if (!r || !r.width) return null;
      return {
        x: (clientX - r.left) * (VIEW_W / r.width),
        y: (clientY - r.top) * (VIEW_H / r.height),
      };
    };

    // Find the string nearest a viewBox point (row within ROW_STEP, x inside the
    // run). Returns index or -1.
    const stringAt = (vx, vy) => {
      let best = -1;
      let bestDy = ROW_STEP * 0.85;
      const list = physRef.current;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (vx < s.x1 - 2 || vx > s.x2 + 2) continue;
        const dy = Math.abs(vy - s.y);
        if (dy < bestDy) {
          bestDy = dy;
          best = i;
        }
      }
      return best;
    };

    const ensureRunning = () => {
      if (rafRef.current) return;
      lastTRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    };

    const tick = (now) => {
      const dt = lastTRef.current ? Math.min((now - lastTRef.current) / 1000, 0.05) : 0;
      lastTRef.current = now;

      // Entrance strum: advance the sweep front and pluck each string once the
      // front (trailing the draw-in by REVEAL_PLUCK_LAG) passes its x, so the
      // ripple of rings chases the left→right draw across the name.
      const sw = sweepRef.current;
      if (sw) {
        if (!sw.start) sw.start = now;
        const front = (now - sw.start) / REVEAL_SWEEP_MS;
        const swList = physRef.current;
        for (let i = 0; i < swList.length; i++) {
          if (sw.done[i]) continue;
          const p = swList[i];
          const tx = (p.x1 - xBounds.min) / xBounds.span;
          if (front >= tx + REVEAL_PLUCK_LAG) {
            sw.done[i] = 1;
            p.amp = REVEAL_AMP;
            p.speed = REVEAL_SPEED;
          }
        }
        if (front >= 1 + REVEAL_PLUCK_LAG + 0.05) sweepRef.current = null;
      }

      let active = 0;
      const list = physRef.current;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.amp > 0.02 || p.speed > 0.02) {
          active++;
          p.phase += p.speed * dt;
          const k = Math.exp(-dt / DECAY_TAU);
          p.amp *= k;
          p.speed *= k;
          if (p.el) p.el.setAttribute('d', pathFor(p, p.amp, p.phase));
        } else if (p.amp !== 0) {
          p.amp = 0;
          p.speed = 0;
          p.phase = 0;
          if (p.el) p.el.setAttribute('d', pathFor(p, 0, 0));
        }
      }
      if (active > 0 || sweepRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = 0;
      }
    };

    // Advance the melody by one note and ring it. Throttled so ultra-fast
    // sweeps don't garble; after a longer idle gap the phrase restarts from the
    // beginning, so each "performance" plays start → finish → loop.
    const playNext = (intensity) => {
      const t = performance.now();
      const gap = t - lastNoteRef.current;
      if (gap < MIN_NOTE_GAP) return;
      if (gap > RESTART_IDLE_MS) melodyIdxRef.current = 0;
      lastNoteRef.current = t;
      const freq = MELODY[melodyIdxRef.current];
      melodyIdxRef.current = (melodyIdxRef.current + 1) % MELODY.length;
      synth.play(freq, intensity);
    };

    const pluck = (idx, amp, speed, intensity) => {
      const p = physRef.current[idx];
      if (!p) return;
      if (!reducedRef.current) {
        p.amp = amp;
        p.speed = speed;
        ensureRunning();
      }
      playNext(intensity);
    };

    // One note of the self-playing performance (touch surfaces). Plucks a
    // vertical band of strings left→right across the name so the wordmark visibly
    // strums — harder on the accented notes — and rings the next PHRASED note.
    // Returns the ms until the next note (its duration + trailing breath) so the
    // scheduler below can honour the melody's rhythm instead of an even tick;
    // that phrasing is what makes it read as a sung line, not a scale.
    autoTickRef.current = () => {
      const list = physRef.current;
      if (!list.length) return AUTO_NOTE_MS;
      const ev = PERFORMANCE[songIdxRef.current];
      songIdxRef.current = (songIdxRef.current + 1) % PERFORMANCE.length;

      const step = xBounds.span / AUTO_COLUMNS;
      let cx = autoXRef.current + step;
      if (cx > xBounds.min + xBounds.span + step * 0.5) cx = xBounds.min;
      autoXRef.current = cx;
      const half = step * 0.75; // overlap so no string is skipped between steps
      const amp = AUTO_AMP * (0.7 + ev.vel * 0.7); // accent tracks the note's velocity
      if (!reducedRef.current) {
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          if (p.x1 <= cx + half && p.x2 >= cx - half) {
            p.amp = amp;
            p.speed = AUTO_SPEED;
          }
        }
        ensureRunning();
      }
      synth.play(ev.freq, ev.vel);
      return (ev.dur || AUTO_NOTE_MS) + ev.restAfter;
    };

    const onMove = (e) => {
      const vb = toViewBox(e.clientX, e.clientY);
      if (!vb) return;
      const idx = stringAt(vb.x, vb.y);
      if (idx === hoverIdxRef.current) return;
      hoverIdxRef.current = idx;
      if (idx >= 0) pluck(idx, HOVER_AMP, HOVER_SPEED, 0.5);
    };

    const onDown = (e) => {
      synth.unlock();
      const vb = toViewBox(e.clientX, e.clientY);
      if (!vb) return;
      const idx = stringAt(vb.x, vb.y);
      if (idx >= 0) pluck(idx, CLICK_AMP, CLICK_SPEED, 0.72);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('scroll', refreshRect, { passive: true });
    window.addEventListener('resize', refreshRect);

    // Pause the loop when the footer is off-screen.
    let io = null;
    if (svgRef.current && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting && rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = 0;
          }
        },
        { rootMargin: '120px 0px' },
      );
      io.observe(svgRef.current);
    }

    // Expose the one-shot entrance strum. It only arms a sweep front that the
    // tick advances — driven by the shared rAF, so it's paused off-screen and
    // cancelled on cleanup with everything else (no stray timers to leak).
    strumRef.current = () => {
      if (reducedRef.current) return;
      sweepRef.current = { start: 0, done: new Uint8Array(physRef.current.length) };
      ensureRunning();
    };

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', refreshRect);
      window.removeEventListener('resize', refreshRect);
      if (io) io.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      hoverIdxRef.current = -1;
      autoTickRef.current = null;
    };
  }, [strings, xBounds]);

  // Self-playing performance driver (touch surfaces only). `autoPlay` is true only
  // when the sound is on AND the pointer can't hover (see index.jsx), so a mouse /
  // trackpad visitor always performs the wordmark themselves and this never runs.
  // It (re)starts the phrase from the head and the band from the left edge each
  // time it engages, then SELF-SCHEDULES: each note reports how long to hold
  // before the next (its duration + breath), so the melody keeps its rhythm
  // instead of a metronome tick. On cleanup the pending timer clears and the
  // strings simply ring down.
  useEffect(() => {
    if (!autoPlay || !strings.length || typeof window === 'undefined') return undefined;
    autoXRef.current = xBounds.min;
    songIdxRef.current = 0;
    let stopped = false;
    let timer = 0;
    const step = () => {
      if (stopped) return;
      const delay = autoTickRef.current?.() ?? AUTO_NOTE_MS;
      timer = window.setTimeout(step, delay);
    };
    step(); // sound the first note the instant it's switched on
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [autoPlay, strings, xBounds]);

  // Reveal the wordmark the first time it scrolls into view — but only once the
  // intro loader has lifted, so the strum is never spent behind the overlay.
  useEffect(() => {
    if (!strings.length || revealed || !loaderRevealed) return undefined;
    const el = svgRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [strings, revealed, loaderRevealed]);

  // Once revealed, fire the pluck ripple (the CSS draw-in is per-path, below).
  useEffect(() => {
    if (revealed) strumRef.current?.();
  }, [revealed]);

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-auto w-full translate-y-[10%] select-none [mask-image:linear-gradient(to_bottom,black_0%,black_55%,transparent_90%)] sm:translate-y-[40%] sm:[mask-image:linear-gradient(to_bottom,black_0%,black_12%,transparent_52%)]"
    >
      {/* userSpaceOnUse maps the gradient to absolute viewBox x, so it sweeps
          continuously across ALL strings by screen position (not per-letter). */}
      <defs>
        <linearGradient
          id={GRAD_ID}
          gradientUnits="userSpaceOnUse"
          x1={GRAD_X1}
          y1="0"
          x2={GRAD_X2}
          y2="0"
        >
          {/* Hold the vivid violet solid across the left ~18% so it reads sharp
              and unmistakable, THEN ramp magenta → orange; the right stays orange. */}
          <stop offset="0%" stopColor={STROKE_ACCENT} />
          <stop offset="18%" stopColor={STROKE_ACCENT} />
          <stop offset="40%" stopColor={STROKE_MID} />
          <stop offset="60%" stopColor={STROKE} />
          <stop offset="100%" stopColor={STROKE} />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${GRAD_ID})`} strokeOpacity={STROKE_OPACITY} strokeLinecap="round">
        {strings.map((s, i) => {
          // Each string draws itself in (dash offset 1→0) with a left→right
          // stagger keyed to its x, so the name is "written on" as a sweep; the
          // pluck ripple (rAF) then rings each as it lands. pathLength normalises
          // the dash to 1 so the draw works even while a plucked `d` is a wave,
          // not a straight line. Reduced motion swaps the draw for a plain fade.
          const tx = (s.x1 - xBounds.min) / xBounds.span;
          const drawDelay = reduced ? 0 : (tx * REVEAL_SWEEP_MS) / 1000;
          const style = reduced
            ? { opacity: revealed ? 1 : 0, transition: 'opacity 0.5s ease' }
            : {
                strokeDasharray: 1,
                strokeDashoffset: revealed ? 0 : 1,
                transition: `stroke-dashoffset ${REVEAL_DRAW_S}s cubic-bezier(0.22, 1, 0.36, 1) ${drawDelay.toFixed(3)}s`,
              };
          return (
            <path
              key={i}
              ref={(el) => {
                elsRef.current[i] = el;
              }}
              d={`M ${s.x1.toFixed(2)} ${s.y.toFixed(2)} H ${s.x2.toFixed(2)}`}
              pathLength="1"
              strokeWidth={STROKE_W}
              vectorEffect="non-scaling-stroke"
              style={style}
            />
          );
        })}
      </g>
    </svg>
  );
}
