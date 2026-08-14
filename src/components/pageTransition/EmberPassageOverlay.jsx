'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { MONO_D, MONO_VIEWBOX } from '@/components/emblem/monogram';
import { getSwarm } from './emberSwarm';
import { EMBER_PALETTE } from './passagePalette';
import { GATHER_MS, LABEL_IN, LABEL_OUT, REVEAL_MS } from './constants';

// The visual body of the Ember Passage — mounted by PageTransitionProvider for
// the covering / holding / revealing phases of a navigation.
//
// This component owns almost no visuals. Its job is to turn the provider's three
// phases into the ONE scalar the shader consumes (uT, 0..1 across the whole
// gesture) on a single requestAnimationFrame loop, and to place the destination
// name, which belongs in the DOM so it can carry the site's own
// `.text-glow-stroke-neon` utility — the very same treatment the homepage hero
// name uses, hollow #ff6d05 tube and three-layer drop-shadow halo — rather than
// an approximation drawn into a canvas.
//
// The name rides that SAME scalar, not a wall clock. Everything the visitor sees
// is therefore driven by one number, so the label physically cannot drift out of
// step with the mark it belongs to.
//
// Everything else is one canvas borrowed from the module-level swarm singleton.
// See emberSwarm.js for why it is a singleton rather than a per-mount context.
//
// Reduced motion, and any browser without WebGL, take the static branch: the
// mark at rest, a plain cross-fade, and no GL context created at all.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// uT is one continuous 0..1 gesture, but it advances on two different clocks:
// LIFT+CONVERGE+HOLD run on the overlay's own timer and are allowed to STALL at
// the hold point for as long as a slow route needs, while SCATTER only starts
// once the provider says the destination has committed.
const HOLD_T = 0.8;

export default function EmberPassageOverlay({ phase, label, reduced, origin }) {
  const revealing = phase === 'revealing';

  // Resolved DURING RENDER, not in an effect. The host div for the canvas only
  // exists in the live branch, so deciding this in an effect would be circular:
  // no host on the first render means nothing to attach to, means never live.
  // init() is idempotent and memoised behind a `tried` flag, so per-render calls
  // are a boolean read — and if the context is ever lost it flips to false here,
  // which demotes every later navigation to the static branch for free.
  const swarm = getSwarm();
  const live = !reduced && typeof window !== 'undefined' && swarm.init();

  const hostRef = useRef(null);
  const [layout, setLayout] = useState(null);

  // Stamped the moment the provider says the route has landed. A ref, not state,
  // because the rAF loop must not be torn down and restarted to learn about it —
  // that would reset its own t0 and snap the swarm back to frame zero.
  const scatterAtRef = useRef(null);

  // The master progress, shared by the shader and the label. Held as a motion
  // value rather than React state so the label tracks it every frame without
  // re-rendering the component sixty times a second.
  const tMV = useMotionValue(0);

  useEffect(() => {
    if (revealing && scatterAtRef.current === null) {
      scatterAtRef.current = performance.now();
    }
  }, [revealing]);

  useEffect(() => {
    if (!live) return undefined;
    const host = hostRef.current;
    if (!host) return undefined;
    swarm.attach(host);
    return () => swarm.detach();
  }, [live, swarm]);

  // The clock.
  useEffect(() => {
    if (!live) return undefined;
    const t0 = performance.now();
    let raf = 0;

    const frame = (now) => {
      const elapsed = now - t0;

      // Gather walks uT to the hold point and then STOPS there. A slow route
      // parks on a fully-formed, breathing mark rather than scattering early or
      // freezing mid-flight — the loading state is the artwork holding its pose.
      const gather = clamp01(elapsed / GATHER_MS) * HOLD_T;

      const scatterAt = scatterAtRef.current;
      const scatter = scatterAt
        ? clamp01((now - scatterAt) / REVEAL_MS) * (1 - HOLD_T)
        : 0;

      // Never let the scatter begin before the swarm has actually landed: on a
      // very fast route the provider can reach 'revealing' while embers are
      // still inbound, and blowing them apart mid-flight reads as a glitch.
      const t = Math.max(gather, Math.min(gather + scatter, 1));
      tMV.set(t);

      const cover =
        clamp01(elapsed / 380) * (1 - clamp01((t - HOLD_T - 0.06) / 0.14));

      // The pool of light the mark sits in. Keyed to uT like everything else,
      // so it swells as the swarm converges, HOLDS lit for as long as a slow
      // route parks at the hold point, and is gone before the embers are —
      // a bloom outliving the thing casting it is the tell that it was on a
      // separate clock.
      const bloom =
        clamp01((t - 0.16) / 0.42) * (1 - clamp01((t - HOLD_T) / 0.12));

      const layoutNow = swarm.render({
        t,
        time: elapsed / 1000,
        cover,
        bloom,
        originX: origin?.x,
        originY: origin?.y,
      });

      // The label rides the shader's own layout, so the DOM and the canvas can
      // never disagree about where the mark is — including mid-rotation.
      if (layoutNow) {
        setLayout((prev) =>
          prev &&
          prev.markY === layoutNow.markY &&
          prev.fieldCss === layoutNow.fieldCss &&
          prev.cssW === layoutNow.cssW
            ? prev
            : layoutNow,
        );
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // `origin` is safe to depend on: it is fixed the moment `navigate` is called
    // and the overlay unmounts between navigations, so it cannot change
    // mid-flight and restart this loop (which would reset t0 and snap the swarm
    // back to frame zero).
  }, [live, swarm, origin, tMV]);

  // --- the destination name, welded to the swarm's progress ------------------
  // Four stops: dark until the swarm is legible, lit through the hold (however
  // long a slow route stretches it), gone by the time the embers have.
  const labelStops = [LABEL_IN[0], LABEL_IN[1], LABEL_OUT[0], LABEL_OUT[1]];
  const labelOpacity = useTransform(tMV, labelStops, [0, 1, 1, 0]);
  // It arrives from below with the swarm and lifts away with it, so the two
  // read as one object rather than as text sitting on top of an animation.
  const labelY = useTransform(tMV, labelStops, [12, 0, 0, -14]);
  // Tracking closes as the name settles. The narrow-screen pair is tighter
  // because QUALIFICATIONS (14 characters) at desktop tracking overruns both
  // edges of a 390px phone, and whitespace-nowrap cannot wrap out of it.
  const narrow = !!layout && layout.cssW < 480;
  const labelTracking = useTransform(
    tMV,
    LABEL_IN,
    narrow ? ['0.42em', '0.26em'] : ['0.62em', '0.44em'],
  );

  // ---------------------------------------------------------------------------
  // static branch: reduced motion, or no WebGL
  // ---------------------------------------------------------------------------
  if (!live) {
    return (
      <motion.div
        className="fixed inset-0 z-[9980] flex flex-col items-center justify-center"
        role="presentation"
        aria-hidden="true"
        style={{
          // The same ember the live branch burns, expressed as a still: the
          // mark's own light at the centre, falling away to the darkness the
          // swarm would otherwise have converged into.
          background:
            'radial-gradient(circle at 50% 46%, ' +
            EMBER_PALETTE.ink +
            '1f 0%, ' +
            EMBER_PALETTE.veil +
            ' 46%, #000 100%)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: revealing ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <svg
          viewBox={MONO_VIEWBOX}
          className="h-[clamp(9rem,34vmin,17rem)] w-[clamp(9rem,34vmin,17rem)]"
          aria-hidden="true"
          // The homepage headline's colour and its three-layer halo, restated
          // for an <svg> that cannot carry `.text-glow-stroke-neon` itself.
          style={{ filter: EMBER_PALETTE.glow }}
        >
          <path d={MONO_D} fillRule="evenodd" fill={EMBER_PALETTE.ink} />
        </svg>
        <div
          // Colour and glow come from the utility itself — see the live branch.
          className="text-glow-stroke-neon mt-8 text-sm font-[500] uppercase sm:text-base"
          style={{
            letterSpacing: '0.42em',
            color: '#000e1700',
            WebkitTextStrokeWidth: '1px',
          }}
        >
          {label}
        </div>
      </motion.div>
    );
  }

  // ---------------------------------------------------------------------------
  // live branch
  // ---------------------------------------------------------------------------
  return (
    <motion.div
      className="fixed inset-0 z-[9980]"
      role="presentation"
      aria-hidden="true"
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
    >
      {/* The shared canvas is appended here. */}
      <div ref={hostRef} className="absolute inset-0" />

      {layout ? (
        <motion.div
          // The SAME utility the homepage hero name uses, so the colour and the
          // glow are shared rather than re-approximated: #ff6d05 stroke, hollow
          // fill, and the three-layer drop-shadow halo.
          className="text-glow-stroke-neon pointer-events-none absolute left-1/2 whitespace-nowrap text-center text-sm font-[500] uppercase sm:text-base"
          // Everything positional and temporal lives in `style` as motion values.
          // Nothing here uses initial/animate, so there is no keyframe timeline
          // that could run to a different beat than the swarm — and no Tailwind
          // -translate-x-1/2 to be silently overwritten, since framer-motion owns
          // the whole transform and x is declared alongside y.
          style={{
            top: layout.markY + layout.fieldCss * 0.42,
            x: '-50%',
            y: labelY,
            opacity: labelOpacity,
            letterSpacing: labelTracking,
            // Transparent fill, exactly as the hero does it inline — the shared
            // class paints a SOLID fill for the sub-page titles, and the hollow
            // tube is what makes the homepage name read as neon.
            color: '#000e1700',
            // Nothing overrides the utility's `-webkit-text-stroke` colour or
            // its filter, so the stroke is #ff6d05 and the halo is the hero's
            // own three drop-shadows, by inheritance rather than by copy. The
            // label and the swarm above it therefore cannot disagree about the
            // colour: both trace back to the homepage headline.
            //
            // The one value that cannot be copied verbatim. The hero carries a
            // 3px stroke at 42-80px type (~3.75% of its size); at label size
            // that is wider than the letter stems, so the tube fills in solid
            // and the whole thing reads as an orange smudge. Scaled to hold the
            // same proportion, so the LOOK matches even though the number does not.
            WebkitTextStrokeWidth: '1px',
          }}
        >
          {label}
        </motion.div>
      ) : null}
    </motion.div>
  );
}
