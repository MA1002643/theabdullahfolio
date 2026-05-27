"use client";

import { Fragment } from "react";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// Visual variants. Each variant ships every token needed by the full
// banner choreography (entrance flash, sweep, aurora drift, ember
// sparks, box-shadow breath) so the orange and elite palettes can
// diverge cleanly without grafting one onto the other at runtime.
const VARIANT_STYLES = {
  orange: {
    background:
      "radial-gradient(circle at 50% 50%, rgba(255,179,71,0.18) 0%, rgba(177,102,18,0.10) 35%, rgba(10,6,3,0.92) 75%)",
    boxShadow:
      "inset 0 0 0 1px rgba(255,179,71,0.35), inset 0 0 40px rgba(255,109,5,0.08), 0 0 28px rgba(255,109,5,0.14)",
    boxShadowBright:
      "inset 0 0 0 1px rgba(255,209,120,0.65), inset 0 0 70px rgba(255,109,5,0.2), 0 0 56px rgba(255,109,5,0.36)",
    flashCenter: "rgba(255, 220, 130, 0.75)",
    flashMid: "rgba(255, 109, 5, 0.22)",
    shimmer: "rgba(255, 220, 130, 0.6)",
    aurora:
      "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,179,71,0.32) 0%, rgba(255,109,5,0.10) 40%, transparent 75%)",
    emberColor: "#ffd27d",
    emberShadow:
      "0 0 6px rgba(255, 210, 125, 0.95), 0 0 14px rgba(255, 170, 42, 0.55)",
  },
  elite: {
    background:
      "radial-gradient(circle at 50% 50%, rgba(244,227,184,0.18) 0%, rgba(212,175,122,0.10) 35%, rgba(2,6,23,0.95) 75%)",
    boxShadow:
      "inset 0 0 0 1px rgba(244,227,184,0.4), inset 0 0 40px rgba(212,175,122,0.08), 0 0 28px rgba(212,175,122,0.2)",
    boxShadowBright:
      "inset 0 0 0 1px rgba(244,227,184,0.75), inset 0 0 70px rgba(212,175,122,0.22), 0 0 56px rgba(212,175,122,0.5)",
    flashCenter: "rgba(244, 227, 184, 0.75)",
    flashMid: "rgba(212, 175, 122, 0.22)",
    shimmer: "rgba(244, 227, 184, 0.6)",
    aurora:
      "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(244,227,184,0.32) 0%, rgba(212,175,122,0.10) 40%, transparent 75%)",
    emberColor: "#f4e3b8",
    emberShadow:
      "0 0 6px rgba(244, 227, 184, 0.95), 0 0 14px rgba(212, 175, 122, 0.55)",
  },
};

// Stagger choreography — every duration / delay lives here so the
// banner's "shape" can be retuned without hunting through six
// motion.span blocks. Times are in seconds.
const TIMING = {
  containerSpring: { type: "spring", stiffness: 200, damping: 26 },
  containerOpacity: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  flash: { duration: 0.95, ease: [0.22, 1, 0.36, 1] },
  shimmer: { duration: 1.8, delay: 0.45, ease: "easeInOut" },
  auroraFade: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  auroraDrift: { duration: 9, repeat: Infinity, ease: "easeInOut" },
  textStagger: 0.028,
  textDelay: 0.55,
  charDuration: 0.7,
  boxBreath: {
    duration: 3.8,
    delay: 1.4,
    repeat: Infinity,
    ease: "easeInOut",
    times: [0, 0.5, 1],
  },
};

const SMOOTH_OUT = [0.22, 1, 0.36, 1];

// Pre-randomized ember trajectories so each remount looks alive but is
// deterministic across renders (no useEffect / Math.random in render).
const EMBERS = [
  { left: "10%", delay: 0.7, duration: 2.4, drift: 8, size: 3 },
  { left: "25%", delay: 1.2, duration: 2.8, drift: -6, size: 2 },
  { left: "42%", delay: 0.95, duration: 2.6, drift: 11, size: 3 },
  { left: "58%", delay: 1.45, duration: 2.5, drift: -9, size: 2 },
  { left: "74%", delay: 0.8, duration: 2.7, drift: 7, size: 3 },
  { left: "88%", delay: 1.3, duration: 2.3, drift: -7, size: 2 },
];

// Continuously rising warm sparks. Each ember starts at the bottom
// of the banner, drifts up and slightly sideways, fades and shrinks
// as it rises, then loops. The `repeatDelay` keeps re-emissions from
// landing exactly in phase so the field feels organic, not pulsed.
function EmberLayer({ emberColor, emberShadow }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {EMBERS.map((e, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            left: e.left,
            bottom: "-6px",
            width: `${e.size}px`,
            height: `${e.size}px`,
            background: emberColor,
            boxShadow: emberShadow,
          }}
          initial={{ opacity: 0, y: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.95, 0.75, 0],
            y: [0, -22, -52, -88],
            x: [0, e.drift * 0.35, e.drift * 0.75, e.drift],
            scale: [0, 1, 0.95, 0.35],
          }}
          transition={{
            duration: e.duration,
            delay: e.delay,
            repeat: Infinity,
            repeatDelay: 0.35,
            ease: "easeOut",
            times: [0, 0.2, 0.6, 1],
          }}
        />
      ))}
    </div>
  );
}

// Per-character text reveal. Each character is its own motion.span
// with `text-fire-amber` applied individually so it carries the warm
// gradient fill, then blurs + lifts + scales in with a stagger so the
// message reads like it's being written by a wand of light. The
// parent carries `aria-label={message}` and every char span is
// `aria-hidden`, so assistive tech still hears the message once,
// cleanly.
function AnimatedMessage({ message, prefersReducedMotion }) {
  if (prefersReducedMotion) {
    return (
      <span className="relative z-10 font-medium text-lg md:text-xl tracking-wide text-center px-6 text-fire-amber">
        {message}
      </span>
    );
  }
  const chars = Array.from(message);
  const container = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: TIMING.textStagger,
        delayChildren: TIMING.textDelay,
      },
    },
    exit: {
      transition: { staggerChildren: 0.012, staggerDirection: -1 },
    },
  };
  const charVariant = {
    hidden: { opacity: 0, y: 14, filter: "blur(10px)", scale: 0.92 },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      scale: 1,
      transition: { duration: TIMING.charDuration, ease: SMOOTH_OUT },
    },
    exit: {
      opacity: 0,
      y: -6,
      filter: "blur(6px)",
      transition: { duration: 0.3, ease: "easeIn" },
    },
  };
  return (
    <motion.span
      variants={container}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="relative z-10 inline-block max-w-full font-medium text-lg md:text-xl tracking-wide text-center px-6 break-words"
      aria-label={message}
    >
      {chars.map((c, i) => {
        // Space chars are invisible — drop the motion wrapper so they
        // render as plain text nodes, which restores their role as the
        // default line-break opportunity. The previous shape wrapped
        // every space in an inline-block, which let the parent's
        // (now removed) `whitespace-nowrap` keep the whole message on
        // one line and overflow long sentences into `overflow-hidden`.
        // A keyed Fragment is used (rather than a bare " ") so every
        // entry in the mapped array carries a stable key — React tolerates
        // unkeyed text nodes in lists today but the keyed form is more
        // defensive against future versions and clearer at a glance.
        if (c === " ") {
          return <Fragment key={i}> </Fragment>;
        }
        return (
          <motion.span
            key={i}
            variants={charVariant}
            aria-hidden="true"
            className="inline-block text-fire-amber"
          >
            {c}
          </motion.span>
        );
      })}
    </motion.span>
  );
}

// Shared "this card just changed" overlay. Six visual layers stacked
// back-to-front:
//
//   1. Backdrop blur + radial ambient gradient (resting surface)
//   2. Aurora ribbon — slow horizontal drift, ambient life
//   3. Pinprick flash — pinprick of warm light blooms on entrance
//   4. Shimmer sweep — single diagonal pass, like light on a bevel
//   5. Embers — continuously rising warm sparks
//   6. Per-character text reveal — message written by stagger
//
// Sustain: box-shadow slowly breathes, aurora keeps drifting,
// embers keep rising — the banner stays alive instead of going
// static after entrance. Exit: container fade + scale, chars
// dissolve back out in reverse stagger order.
//
// Anchor parent must be `position: relative` (caller's responsibility)
// — every existing consumer in the about-page cards already is.
//
// @param {object} props
// @param {string|null} props.message - the change message; null/empty hides
// @param {boolean} props.visible     - render visual overlay this paint?
// @param {string} [props.srPrefix]   - prefix for the SR announcement
// @param {"orange"|"elite"} [props.variant] - visual palette
export function UpdateBanner({ message, visible, srPrefix = "", variant = "orange" }) {
  const prefersReducedMotion = useReducedMotion();
  const showVisual = Boolean(visible && message);
  const palette = VARIANT_STYLES[variant] ?? VARIANT_STYLES.orange;

  const containerInitial = prefersReducedMotion
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.93 };
  const containerAnimate = prefersReducedMotion
    ? { opacity: 1 }
    : {
        opacity: 1,
        scale: 1,
        boxShadow: [
          palette.boxShadow,
          palette.boxShadowBright,
          palette.boxShadow,
        ],
      };
  const containerExit = prefersReducedMotion
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.97 };

  const containerTransition = prefersReducedMotion
    ? { duration: 0.4 }
    : {
        ...TIMING.containerSpring,
        opacity: TIMING.containerOpacity,
        boxShadow: TIMING.boxBreath,
      };

  return (
    <>
      {/* SR announcer is always mounted, and its text is gated on
          `message` ONLY — intentionally NOT on `visible` / `showVisual`.
          AT users navigate by structure, not by viewport scrolling, so
          they shouldn't be forced to find a card before hearing that
          it changed. The `polite` live region queues the announcement
          to fire after the user's current speech finishes, which is
          the right cadence for a background data update. Wrapping in
          AnimatePresence would also unmount the node before the live
          region had time to announce on transition, swallowing the
          message — another reason this sits outside the AnimatePresence
          block below. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {message ? `${srPrefix}${message}` : ""}
      </div>

      <AnimatePresence>
        {showVisual && (
          <motion.div
            key="update-banner"
            initial={containerInitial}
            animate={containerAnimate}
            exit={containerExit}
            transition={containerTransition}
            // pointer-events-none so the banner overlay doesn't
            // swallow clicks on the card beneath (e.g. the years card
            // opens a modal on click — the banner shouldn't block it).
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none rounded-lg overflow-hidden"
            style={{
              background: palette.background,
              backdropFilter: "blur(16px) saturate(140%)",
              WebkitBackdropFilter: "blur(16px) saturate(140%)",
            }}
          >
            {!prefersReducedMotion && (
              <>
                {/* Layer 2 — Aurora ribbon drifting behind everything */}
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-0"
                  initial={{ opacity: 0, x: "-15%" }}
                  animate={{
                    opacity: [0, 0.95, 0.75, 0.95, 0.75],
                    x: ["-15%", "15%", "-10%", "12%", "-15%"],
                  }}
                  transition={{
                    opacity: TIMING.auroraFade,
                    x: TIMING.auroraDrift,
                  }}
                  style={{
                    background: palette.aurora,
                    filter: "blur(10px)",
                  }}
                />

                {/* Layer 3 — Radial pinprick flash on entrance */}
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-lg"
                  initial={{ opacity: 0.9, scale: 0 }}
                  animate={{ opacity: 0, scale: 1.6 }}
                  transition={TIMING.flash}
                  style={{
                    background: `radial-gradient(circle at 50% 50%, ${palette.flashCenter} 0%, ${palette.flashMid} 35%, transparent 70%)`,
                    mixBlendMode: "screen",
                  }}
                />

                {/* Layer 4 — Single-pass shimmer sweep */}
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-y-0 w-[60%]"
                  initial={{ x: "-180%" }}
                  animate={{ x: "260%" }}
                  transition={TIMING.shimmer}
                  style={{
                    background: `linear-gradient(105deg, transparent 30%, ${palette.shimmer} 50%, transparent 70%)`,
                    mixBlendMode: "screen",
                  }}
                />

                {/* Layer 5 — Rising warm embers (continuous) */}
                <EmberLayer
                  emberColor={palette.emberColor}
                  emberShadow={palette.emberShadow}
                />
              </>
            )}

            {/* Layer 6 — Per-character text reveal */}
            <AnimatedMessage
              message={message}
              prefersReducedMotion={prefersReducedMotion}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
