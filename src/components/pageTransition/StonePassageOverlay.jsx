'use client';

import { useEffect, useState } from 'react';
import {
  animate as fmAnimate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import { REVEAL_MS } from './constants';

// The visual body of the "Stone Passage" — mounted by PageTransitionProvider for
// the covering / holding / revealing phases of a navigation.
//
// The ritual, on the artwork's own clock:
//   1. a blank, rough-hewn basalt slab settles up out of the dark void
//   2. the MA monogram is ENGRAVED into it, DRAWN stroke by stroke — a chisel
//      traces the letterforms and the recessed grooves appear in its wake, a
//      glint of light riding the cutting tip; NOT a stamp, not a wipe
//   3. the destination name engraves beneath
//   4. the radial mask wipe (same language as the intro loader) uncovers the page
//
// How the draw works: two pixel-identical slabs are stacked in one <svg> (viewBox
// 1024²) — a PLAIN one and a CARVED twin that differs ONLY in the grooves. An SVG
// <mask> holds a single stroked path that traces a CENTERLINE of the monogram;
// animating its stroke-dashoffset "draws it on", revealing the carved twin along
// the letterforms in order. Real path-length units are used for the dash (NOT
// pathLength=1, which some engines treat as a dotted pattern and reveal at once).
// No WebGL — just an animated stroke over two baked images (made via AI Gateway).
//
// Layering note: the radial reveal mask sits on the inner "surface" div, NOT the
// root — the portal ring is the surface's sibling so the mask can't clip it.

const PLAIN = '/textures/rock/ma-slab-plain.webp';
const CARVED = '/textures/rock/ma-slab-carved.webp';
const INK = [0.65, 0, 0.35, 1];
const SOFT_OUT = [0.22, 1, 0.36, 1];
// Steady "engraving" pace — a touch of momentum, settles at the end.
const DRAW_EASE = [0.42, 0.03, 0.24, 1];

// Monogram → slab placement (matches how the carved twin was baked).
const S = 1.55;
const TX = 512 - 508 * S;
const TY = 512 - 520 * S;
// Hand-authored centerline of the MA, in MONO (1024) space, ordered = the drawing
// order: left leg → centre diagonal + hook → bottom interlock → right diagonal →
// right leg. Each sub-path is one chisel stroke (the pen lifts between them).
const STROKES = [
  [[388, 398], [386, 465], [376, 535], [362, 586]],
  [[510, 404], [470, 492], [435, 578], [420, 624], [436, 634], [470, 604], [500, 600]],
  [[470, 548], [500, 600], [535, 642], [568, 657], [601, 646], [623, 598], [610, 550], [580, 512]],
  [[515, 528], [560, 488], [602, 447]],
  [[641, 406], [643, 505], [652, 585], [668, 617]],
];
const MONO_PATH = STROKES.map((s) => 'M' + s.map((p) => p.join(' ')).join(' L ')).join(' ');
const MONO_TF = `translate(${TX} ${TY}) scale(${S})`;
const L = 1193.9; // getTotalLength of MONO_PATH, in mono units
const STROKE_W = 60; // mono units → ~93px on the slab; covers the groove widths
const TIP_LEN = 0.03 * L;

// The square slab image fades into the backdrop at its edges so no hard box
// shows; the image's own background is pure black to match the cavern.
const SLAB_FADE = 'radial-gradient(circle at 50% 50%, #000 64%, transparent 84%)';

export default function StonePassageOverlay({ phase, label, reduced }) {
  const revealing = phase === 'revealing';
  const wipeActive = revealing && !reduced;

  // The engrave fires on the artwork's own clock, a beat after the slab lands.
  const [carving, setCarving] = useState(false);
  const [drawn, setDrawn] = useState(reduced); // gap-fill: full carved visible
  const [showName, setShowName] = useState(reduced);

  // `draw` 0→1 drives the stroke-dashoffset (the chisel tracing the mark) and the
  // hot-cut tip that rides its leading edge.
  const draw = useMotionValue(reduced ? 1 : 0);
  const revealOffset = useTransform(draw, (d) => L * (1 - d));
  const tipOffset = useTransform(draw, (d) => TIP_LEN - d * L);
  const tipOpacity = useTransform(draw, [0, 0.06, 0.9, 1], [0, 1, 1, 0]);

  useEffect(() => {
    if (reduced) return;
    const t1 = setTimeout(() => setCarving(true), 500);
    const t2 = setTimeout(() => setShowName(true), 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [reduced]);

  useEffect(() => {
    if (!carving) return;
    const controls = fmAnimate(draw, 1, {
      duration: 1.3,
      ease: DRAW_EASE,
      onComplete: () => setDrawn(true),
    });
    return () => controls.stop();
  }, [carving, draw]);

  // Re-derive the engrave state if the user toggles OS "reduced motion" while the
  // overlay is still mounted. `drawn`, `showName` and `draw` are seeded from
  // `reduced` only on the mount render (useState / useMotionValue ignore their
  // argument afterwards), so without this the mark can be left stuck — half-drawn
  // if reduced flips ON mid-carve, or shown finished with no draw if it flips OFF.
  // Clearing `carving` also halts any in-flight draw animation via the carve
  // effect's cleanup (so `draw.set` isn't clobbered by a live rAF tick) and lets
  // the timed carve restart cleanly once reduced is off again.
  useEffect(() => {
    setCarving(false);
    setDrawn(reduced);
    setShowName(reduced);
    draw.set(reduced ? 1 : 0);
  }, [reduced, draw]);

  // Radial reveal — identical language to the intro loader's exit wipe.
  const revealRadius = useMotionValue(0);
  const maskImage = useMotionTemplate`radial-gradient(circle at 50% 50%, transparent ${revealRadius}%, black calc(${revealRadius}% + 5%))`;

  // Half-diagonal of the viewport — the ring's full-bleed radius. Seeded from
  // window on the first client render (not 0) so a fast route transition that
  // begins the wipe before the mount effect runs never flashes a 0px ring that
  // then pops to size; kept current on resize. SSR-guarded because a 'use
  // client' overlay's first render can still execute on the server.
  const cornerPx = () =>
    typeof window !== 'undefined'
      ? Math.hypot(window.innerWidth / 2, window.innerHeight / 2)
      : 0;
  const [farthestCornerPx, setFarthestCornerPx] = useState(cornerPx);
  useEffect(() => {
    const update = () => setFarthestCornerPx(cornerPx());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const ringDiameter = useTransform(
    revealRadius,
    (r) => `${(r / 100) * farthestCornerPx * 2}px`,
  );
  const ringOpacity = useTransform(revealRadius, [0, 12, 80, 120, 150], [0, 0.7, 0.7, 0.35, 0]);

  useEffect(() => {
    if (!wipeActive) return;
    const controls = fmAnimate(revealRadius, 150, { duration: REVEAL_MS / 1000, ease: INK });
    return () => controls.stop();
  }, [wipeActive, revealRadius]);

  const surfaceMaskStyle = wipeActive ? { maskImage, WebkitMaskImage: maskImage } : undefined;
  const enter = (initial) => (reduced ? false : initial);

  return (
    <motion.div
      className="fixed inset-0 z-[9980]"
      role="presentation"
      aria-hidden="true"
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
    >
      {/* ——— masked surface: backdrop + slab + engraving ——— */}
      <motion.div
        className="absolute inset-0 overflow-hidden"
        style={surfaceMaskStyle}
        initial={reduced ? { opacity: 0 } : false}
        animate={{ opacity: reduced && revealing ? 0 : 1 }}
        transition={{ duration: reduced ? 0.2 : 0 }}
      >
        {/* Dark stone-cavern backdrop — matches the slab image's near-black. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 50% 46%, #101014 0%, #08080b 52%, #030304 100%)',
          }}
        />

        {/* Centrepiece: the slab + destination name. On reveal it scales up and
            dissolves as the destination page emerges. */}
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center"
          animate={wipeActive ? { scale: 1.16, opacity: 0 } : { scale: 1, opacity: 1 }}
          transition={
            wipeActive
              ? { duration: REVEAL_MS / 1000, ease: [0.55, 0, 0.45, 1] }
              : { duration: 0 }
          }
        >
          {/* Entrance: the blank slab rises out of the void. */}
          <motion.div
            initial={enter({ opacity: 0, scale: 0.9, y: 16 })}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: reduced ? 0.25 : 0.62, ease: SOFT_OUT }}
          >
            {/* Strike flinch: the slab flinches as the chisel first bites. */}
            <motion.div
              animate={
                carving && !reduced
                  ? { x: [0, -2.5, 2, -1.4, 1, 0], y: [0, 1.6, -1.2, 0.6, 0] }
                  : { x: 0, y: 0 }
              }
              transition={{ duration: 0.42, ease: 'easeOut' }}
            >
              {/* Slab: one SVG holds PLAIN + CARVED (drawn on) + the hot-cut tip.
                  Edge-fade blends the square into the void. */}
              <div
                className="relative"
                style={{
                  width: 'clamp(15rem, 62vmin, 33rem)',
                  height: 'clamp(15rem, 62vmin, 33rem)',
                  filter: 'drop-shadow(0 20px 44px rgba(0,0,0,0.62))',
                }}
              >
                <svg
                  viewBox="0 0 1024 1024"
                  width="100%"
                  height="100%"
                  style={{ maskImage: SLAB_FADE, WebkitMaskImage: SLAB_FADE, display: 'block' }}
                >
                  <defs>
                    <mask id="ma-carve-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
                      <motion.path
                        d={MONO_PATH}
                        transform={MONO_TF}
                        fill="none"
                        stroke="#fff"
                        strokeWidth={STROKE_W}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={`${L} ${L}`}
                        style={{ strokeDashoffset: revealOffset }}
                      />
                    </mask>
                    <filter id="ma-hotcut" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="5" />
                    </filter>
                  </defs>

                  {/* PLAIN underneath */}
                  <image href={PLAIN} x="0" y="0" width="1024" height="1024" preserveAspectRatio="xMidYMid meet" />
                  {/* CARVED drawn on along the stroke */}
                  <image
                    href={CARVED}
                    x="0"
                    y="0"
                    width="1024"
                    height="1024"
                    preserveAspectRatio="xMidYMid meet"
                    mask="url(#ma-carve-reveal)"
                  />
                  {/* Gap-fill: guarantee the finished engraving is 100% shown. */}
                  <image
                    href={CARVED}
                    x="0"
                    y="0"
                    width="1024"
                    height="1024"
                    preserveAspectRatio="xMidYMid meet"
                    style={{ opacity: drawn ? 1 : 0, transition: 'opacity 240ms ease-out' }}
                  />
                  {/* Hot-cut tip riding the chisel's leading edge. */}
                  {!reduced && (
                    <motion.path
                      d={MONO_PATH}
                      transform={MONO_TF}
                      fill="none"
                      stroke="rgba(255,109,5,0.85)"
                      strokeWidth={STROKE_W * 0.46}
                      strokeLinecap="round"
                      strokeDasharray={`${TIP_LEN} ${L}`}
                      filter="url(#ma-hotcut)"
                      style={{ strokeDashoffset: tipOffset, opacity: tipOpacity, mixBlendMode: 'screen' }}
                    />
                  )}
                </svg>
              </div>
            </motion.div>
          </motion.div>

          {/* Destination engraving, beneath the slab. */}
          <motion.div
            className="mt-7 flex items-center gap-4"
            initial={enter({ opacity: 0, y: 10 })}
            animate={reduced || showName ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: reduced ? 0.2 : 0.55, ease: SOFT_OUT }}
          >
            <span className="h-1.5 w-1.5 rotate-45 bg-[#ff6d05]" />
            <motion.span
              className="text-xs font-extrabold uppercase text-[#ff6d05] sm:text-sm"
              style={{
                fontFamily:
                  "var(--font-montserrat), 'Helvetica Neue', Helvetica, Arial, sans-serif",
                textShadow: '0 2px 5px rgba(0,0,0,0.85), 0 0 12px rgba(255,109,5,0.18)',
              }}
              initial={enter({ letterSpacing: '0.7em' })}
              animate={reduced || showName ? { letterSpacing: '0.42em' } : { letterSpacing: '0.7em' }}
              transition={{ duration: reduced ? 0 : 0.6, ease: SOFT_OUT }}
            >
              {label}
            </motion.span>
            <span className="h-1.5 w-1.5 rotate-45 bg-[#ff6d05]" />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* ——— ember portal ring: sibling of the masked surface ——— */}
      {wipeActive && (
        <motion.div
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: ringDiameter,
            height: ringDiameter,
            x: '-50%',
            y: '-50%',
            opacity: ringOpacity,
            border: '1.5px solid rgba(255, 109, 5, 0.7)',
            boxShadow:
              '0 0 18px 2px rgba(255, 109, 5, 0.5), 0 0 60px 8px rgba(255, 109, 5, 0.22), inset 0 0 24px 4px rgba(255, 180, 80, 0.3)',
          }}
        />
      )}
    </motion.div>
  );
}
