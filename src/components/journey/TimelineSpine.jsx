'use client';

import React, { useMemo } from 'react';
import { motion, useTransform } from 'framer-motion';
import { buildSpineGeometry } from './spineGeometry';

// The serpentine rail the whole page hangs off. The container measures every
// marker centre (plus height and a breakpoint-aware amplitude) and this
// component draws one snake through all of them — the curve passes EXACTLY
// through each marker, so the markers, connectors and cards keep the straight
// spine's alignment contract without knowing the line now sways.
//
// Layer order inside one axis-centred wrapper (width = 2·(amplitude + pad),
// so the SVG raster stays a narrow column instead of the whole page):
//
//   1. the unlit track — the full snake in a faint white stroke that fades
//      out toward the foot,
//   2. the charged fill — the SAME path stroked with the ember → amethyst →
//      gold gradient (userSpaceOnUse, pinned to page space so each colour
//      stays with its era) plus a soft wide halo pass, both revealed by a
//      scroll-linked clip-path inset on a plain wrapper div. Clip, NOT
//      stroke-dashoffset: the clip animates composited while a dash write
//      repaints the whole stroke every scroll frame — and the horizontal clip
//      edge is exactly the 62%-viewport line the markers elect eras on, which
//      arc-length reveals drift away from,
//   3. the comet — riding the curve via the geometry's x(y) lookup and
//      ROTATED to the local tangent, so its tail trails along the path
//      through every bend instead of hanging vertically.
//
// `progress` is the spring-smoothed scroll value from the container (raw
// under reduced motion — the fill is a user-driven scrub and stays; the comet
// and pulse are ornament and go).
const SPINE_PAD = 12; // stroke + halo clearance inside the wrapper

// The container's spring overshoots [0,1] at both ends of the scroll — raw
// v would clip negative insets and park the comet past the spine's ends.
// Clamped inline in each transform, not via a chained clamped MotionValue,
// which would add a frame of lag to every derived write.
const clamp01 = (v) => Math.min(1, Math.max(0, v));

const TimelineSpine = ({
  progress,
  height,
  markerYs,
  amplitude,
  revealed,
  reduceMotion,
}) => {
  const width = 2 * (amplitude + SPINE_PAD);
  const cx = width / 2;

  const geometry = useMemo(
    () => buildSpineGeometry(markerYs, height, amplitude, cx),
    [markerYs, height, amplitude, cx],
  );

  // Percentage clip so the reveal survives resizes without a re-measure; the
  // comet needs pixels anyway, and both read the same progress value.
  const clip = useTransform(
    progress,
    (v) => `inset(0 0 ${(1 - clamp01(v)) * 100}% 0)`,
  );
  const cometY = useTransform(progress, (v) => clamp01(v) * height);
  const cometX = useTransform(progress, (v) =>
    geometry ? geometry.xAtY(clamp01(v) * height) : cx,
  );
  const cometRotate = useTransform(progress, (v) =>
    geometry ? geometry.tangentAtY(clamp01(v) * height) : 0,
  );

  return (
    <div
      aria-hidden
      className="absolute bottom-0 top-0 left-[1.375rem] -translate-x-1/2 md:left-1/2"
      style={{ width }}
    >
      {geometry && (
        <>
          {/* Unlit track — the whole journey, faint, dissolving toward the
              origin end-cap. */}
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="absolute inset-0 overflow-visible"
          >
            <defs>
              <linearGradient
                id="jn-spine-track"
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2="0"
                y2={height}
              >
                <stop offset="0" stopColor="rgba(255,255,255,0.14)" />
                <stop offset="0.88" stopColor="rgba(255,255,255,0.10)" />
                <stop offset="1" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
            </defs>
            {/* Draw-in on arrival: the whole journey sketches itself from the
                NOW beacon downward once the intro loader lifts — a one-shot
                dash animation over the geometry's OWN summed arc length (the
                measured-reality flavour of path length; normalised pathLength
                lies about speed). One-shot, so the per-frame stroke-repaint
                cost that rules dashes out for the scroll reveal never
                applies; reduced motion renders the track already drawn. */}
            <motion.path
              d={geometry.d}
              fill="none"
              stroke="url(#jn-spine-track)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={geometry.total}
              initial={false}
              animate={{
                strokeDashoffset:
                  reduceMotion || revealed ? 0 : geometry.total,
              }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 2.2, ease: [0.3, 0.6, 0.2, 1] }
              }
            />
          </svg>

          {/* Charged fill — clip-path reveal on the wrapper div (composited),
              gradient pinned to page space so ember stays at 2026 and gold
              only ever arrives at the Bolton College foot. */}
          <motion.div
            className="absolute inset-0"
            style={{ clipPath: clip }}
          >
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              className="absolute inset-0 overflow-visible"
            >
              <defs>
                <linearGradient
                  id="jn-spine-fill"
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2={height}
                >
                  <stop offset="0" stopColor="#ff6d05" />
                  <stop offset="0.55" stopColor="#fc83ff" />
                  <stop offset="1" stopColor="#f9d174" />
                </linearGradient>
              </defs>
              {/* Halo pass — the charged air around the lit line. A wider
                  translucent stroke, not a blur filter: same glow read,
                  none of the per-frame filter cost. */}
              <path
                d={geometry.d}
                fill="none"
                stroke="url(#jn-spine-fill)"
                strokeWidth="7"
                strokeLinecap="round"
                opacity="0.22"
              />
              <path
                d={geometry.d}
                fill="none"
                stroke="url(#jn-spine-fill)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </motion.div>
        </>
      )}

      {/* NOW beacon — the path starts on the axis at the wrapper top, so the
          beacon keeps its straight-spine perch. The one perpetual animation
          on the page; reduced motion keeps the dot and label (state, not
          motion) and drops the pulse. */}
      <div className="absolute -top-1 left-1/2 -translate-x-1/2">
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.3em] text-[#ff6d05]">
          NOW
        </span>
        <motion.span
          className="block h-3 w-3 rounded-full bg-[#ff6d05]"
          animate={
            reduceMotion
              ? { boxShadow: '0 0 10px #ff6d05' }
              : {
                  scale: [1, 1.35, 1],
                  boxShadow: [
                    '0 0 2px rgba(255,109,5,0.4)',
                    '0 0 16px rgba(255,109,5,0.9)',
                    '0 0 2px rgba(255,109,5,0.4)',
                  ],
                }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      </div>

      {/* Comet on the reveal edge — x follows the curve, rotate follows the
          tangent so the tail trails through every bend. Animated path only,
          and only once the geometry exists (height 0 would park it on the
          beacon). */}
      {!reduceMotion && geometry && (
        <motion.div
          className="absolute left-0 top-0"
          style={{ x: cometX, y: cometY, rotate: cometRotate }}
        >
          <span
            className="absolute -top-14 left-0 h-14 w-[2px] -translate-x-1/2"
            style={{
              background:
                'linear-gradient(to bottom, transparent, rgba(255,109,5,0.7))',
            }}
          />
          <span
            className="absolute left-0 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ffb066]"
            style={{
              boxShadow:
                '0 0 6px #ff6d05, 0 0 18px rgba(255,109,5,0.75), 0 0 36px rgba(255,109,5,0.35)',
            }}
          />
        </motion.div>
      )}
    </div>
  );
};

export default TimelineSpine;
