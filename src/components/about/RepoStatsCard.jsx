"use client";

import { motion, useAnimation, useInView, useReducedMotion } from "framer-motion";
import { useViewportCountTrigger } from "@/hooks/useViewportCountTrigger";
import { UpdateBanner } from "./UpdateBanner";
import {
  Clock,
  GitCommitHorizontal,
  GitFork,
  GitMerge,
  Monitor,
  Star,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { fastStartSlowFinish } from "@/utils/animationCurves";

// Convert a 3- or 6-digit hex color to an `rgba(r, g, b, a)` string. The
// language-dot glow used to concat an alpha suffix onto `languageColor`
// (e.g. `${color}80`), which only produced valid CSS against a 6-digit
// hex — a 3-digit input would yield the invalid 5-char `#99980`. Going
// through rgba covers both digit widths uniformly and degrades to a
// neutral gray on malformed input so the glow style stays valid no
// matter what reaches this component.
function hexToRgba(hex, alpha) {
  const fallback = `rgba(136, 136, 136, ${alpha})`;
  if (typeof hex !== "string") return fallback;
  const sixDigit = /^#([0-9a-f]{6})$/i.exec(hex);
  const threeDigit = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  let r, g, b;
  if (sixDigit) {
    r = parseInt(sixDigit[1].slice(0, 2), 16);
    g = parseInt(sixDigit[1].slice(2, 4), 16);
    b = parseInt(sixDigit[1].slice(4, 6), 16);
  } else if (threeDigit) {
    r = parseInt(threeDigit[1] + threeDigit[1], 16);
    g = parseInt(threeDigit[2] + threeDigit[2], 16);
    b = parseInt(threeDigit[3] + threeDigit[3], 16);
  } else {
    return fallback;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ----- Card-level variants -----
const cardVariants = {
  hidden: { opacity: 0, y: 56, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 70,
      damping: 18,
      staggerChildren: 0.07,
      delayChildren: 0.15,
    },
  },
};

const childVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 120, damping: 20 },
  },
};

const metricContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const metricRowVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

// ----- Per-character title (blur-fade in) -----
function AnimatedTitle({ text, play }) {
  // Reduced-motion path: render a plain heading. The blur-fade-per-character
  // effect is purely decorative, and the staggered blur(6px) → blur(0) ramp
  // is exactly the kind of vestibular trigger the OS preference exists to
  // avoid. No motion, no per-char wrappers, no DOM bloat.
  const prefersReducedMotion = useReducedMotion();
  if (prefersReducedMotion) {
    return (
      <h3
        className="text-xl font-semibold break-words"
        style={{ color: "#ff6d05", textShadow: "none" }}
      >
        {text}
      </h3>
    );
  }

  const chars = Array.from(text);
  const container = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.035, delayChildren: 0.2 } },
  };
  const charVariant = {
    hidden: { opacity: 0, filter: "blur(6px)", y: 8 },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: { duration: 0.35, ease: "easeOut" },
    },
  };
  return (
    // Per-char spans make some screen readers announce the title letter-by-letter; aria-label + aria-hidden chars restores a clean accessible name.
    <motion.h3
      variants={container}
      initial="hidden"
      animate={play ? "visible" : "hidden"}
      className="text-xl font-semibold break-words"
      style={{ color: "#ff6d05", textShadow: "none" }}
      aria-label={text}
    >
      {chars.map((c, i) => (
        <motion.span
          key={i}
          variants={charVariant}
          style={{ display: "inline-block" }}
          aria-hidden="true"
        >
          {c === " " ? " " : c}
        </motion.span>
      ))}
    </motion.h3>
  );
}

// ----- Single metric row: count-up + optional post-count pulse -----
function MetricRow({ icon: Icon, label, value, playToken, isDate = false, pulseOnComplete = false, prefersReducedMotion = false }) {
  // When reduced motion is requested, initialize the display directly at the
  // target so the value reads instantly with no animated progression.
  const target = isDate ? value : Number(value) || 0;
  const [display, setDisplay] = useState(
    isDate ? value : prefersReducedMotion ? target : 0
  );
  const [pulse, setPulse] = useState(false);
  const rafRef = useRef(null);
  // 2 s gives the slow-settle phase room to breathe — at the previous 1.1 s
  // the settle phase compressed into ~800 ms and the elite landing felt rushed.
  const DURATION = 2000;

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (isDate) {
      setDisplay(value);
      return;
    }
    // Reduced-motion: skip the RAF count-up entirely and land on the final
    // value immediately. No pulse either — that's another motion event.
    if (prefersReducedMotion) {
      setDisplay(target);
      setPulse(false);
      return;
    }
    // Pre-trigger state: the hook hasn't seen a true viewport entry yet,
    // so leave `display` at its initial 0 and wait. No reset on later
    // viewport exits — the new playToken-driven contract holds the
    // final value in place until the next *real* entry cycle.
    if (playToken === 0) {
      setPulse(false);
      return;
    }
    // Zero-target fast path: the easing produces 0 every frame, so the
    // RAF loop would schedule ~120 frames over the full DURATION just to
    // call setDisplay(0) repeatedly. React bails on identical state but
    // the scheduled frames still run. Skip the loop entirely. We exclude
    // `pulseOnComplete` here so the elite-landing pulse can still fire on
    // a 0 metric if a caller ever wants it — rare, but the cost of the
    // loop is only the timing delay in that case.
    if (target === 0 && !pulseOnComplete) {
      setDisplay(0);
      setPulse(false);
      return;
    }

    // Snap to 0 before the first RAF frame so a re-entry trigger
    // (display currently holding the previous final `target`) starts
    // the count-up from 0 instead of flashing the final value for one
    // frame. The initial-render case is a no-op because display is
    // already 0.
    setDisplay(0);

    let startTime = null;
    const tick = (ts) => {
      if (!startTime) startTime = ts;
      const t = Math.min((ts - startTime) / DURATION, 1);
      setDisplay(Math.floor(fastStartSlowFinish(t) * target));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
        if (pulseOnComplete) setPulse(true);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playToken, target, isDate, value, pulseOnComplete, prefersReducedMotion]);

  return (
    <motion.div
      variants={metricRowVariants}
      // Hover transforms (`x: 5` slide, icon scale/rotate) are tiny but they
      // are still motion. Skip them when the user has opted out.
      whileHover={prefersReducedMotion ? undefined : { x: 5, transition: { duration: 0.18 } }}
      className="flex items-center justify-between gap-2 w-full px-2 py-1 rounded-md hover:bg-[#ff6d05]/5 transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0">
        <motion.span
          whileHover={prefersReducedMotion ? undefined : { scale: 1.25, rotate: 6 }}
          transition={{ type: "spring", stiffness: 400 }}
          className="flex-shrink-0"
        >
          <Icon className="w-4 h-4" style={{ color: "#ffaa2a" }} />
        </motion.span>
        <span
          className="text-xs sm:text-sm truncate text-fire-amber"
          style={{ textShadow: "none" }}
        >
          {label}
        </span>
      </div>
      <motion.span
        animate={pulse ? { scale: [1, 1.18, 1], transition: { duration: 0.4, ease: "easeOut" } } : { scale: 1 }}
        onAnimationComplete={() => pulse && setPulse(false)}
        className="text-xs sm:text-sm font-semibold tabular-nums whitespace-nowrap"
        style={{
          color: "#ff6d05",
          textShadow: "none",
        }}
      >
        {/* `display` cycles through 0 → target during the count-up, then
            holds at `target` across subsequent viewport exits — it only
            snaps back to 0 immediately before a fresh count-up triggered
            by a real re-entry (see the playToken-driven effect above).
            Even so, before the first entry the value sits at 0, so a
            keyboard / non-visual user navigating to the card before it
            entered the viewport would otherwise hear "0 stars" / "0
            forks". The sr-only span carries the final, correct value
            unconditionally; the visible span is `aria-hidden` so the
            animated digits never reach the accessibility tree. */}
        <span className="sr-only">{isDate ? target : target.toLocaleString()}</span>
        <span aria-hidden="true">{isDate ? display : display.toLocaleString()}</span>
      </motion.span>
    </motion.div>
  );
}

// ----- Activity score arc (SVG) -----
function ActivityArc({ score, maxScore = 10000, playToken, prefersReducedMotion = false }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const controls = useAnimation();
  const target = Math.min(Math.round(score), maxScore);
  // Initialize at the final value when reduced motion is requested so the
  // displayed number is correct on the very first paint, no count-up.
  const [displayScore, setDisplayScore] = useState(prefersReducedMotion ? target : 0);
  const rafRef = useRef(null);
  const DURATION = 2000;
  // Final arc fill amount — also used as the resting state for the
  // reduced-motion branch so the arc paints at its destination immediately.
  // Derive from `target` (the same rounded + clamped value used for the
  // displayed number) so the arc and the digits inside it always agree.
  // Previously this used the raw `score`, which let a fractional
  // `activityScore` (e.g. 869.1271) produce a slightly different arc fill
  // than the displayed `869`. `target` is already in [0, maxScore], so
  // the explicit `Math.min(...)` clamp is no longer needed.
  const finalOffset = circumference * (1 - target / maxScore);

  // Arc fill: drives strokeDashoffset from "empty" to the final fill amount
  // using the same easing the numeric counters use, so the arc and the number
  // inside it land together as a single elite gesture. Under reduced motion
  // the same final offset is set with `duration: 0`, so the arc paints in
  // place without any sweep. Otherwise we wait for a real viewport entry
  // (`playToken > 0`) and snap back to `circumference` first so a re-entry
  // trigger animates the sweep again from empty — without that the second
  // play would have nothing to animate (already at `finalOffset`).
  useEffect(() => {
    if (prefersReducedMotion) {
      controls.start({
        strokeDashoffset: finalOffset,
        transition: { duration: 0 },
      });
      return;
    }
    if (playToken === 0) return;
    controls.set({ strokeDashoffset: circumference });
    controls.start({
      strokeDashoffset: finalOffset,
      transition: { duration: DURATION / 1000, ease: fastStartSlowFinish },
    });
  }, [playToken, finalOffset, circumference, controls, prefersReducedMotion]);

  // Numeric count-up: identical sprint-then-settle behaviour as MetricRow.
  // Skipped entirely under reduced motion — the score reads as the final
  // value immediately.
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (prefersReducedMotion) {
      setDisplayScore(target);
      return;
    }
    // Pre-trigger: stay at the initial 0 until the first real viewport
    // entry. Holds value between true exits and re-entries (no reset).
    if (playToken === 0) return;
    // Zero-target fast path — same rationale as MetricRow's: the easing
    // produces 0 every frame so the loop would just call setDisplayScore(0)
    // ~120 times across the full DURATION. The arc effect above also
    // resolves to `finalOffset = circumference` (fully empty) instantly,
    // so neither half needs an animated sweep.
    if (target === 0) {
      setDisplayScore(0);
      return;
    }

    // Snap to 0 before the first RAF frame so a re-entry trigger
    // animates from 0 again instead of flashing the previous final.
    setDisplayScore(0);

    let startTime = null;
    const tick = (ts) => {
      if (!startTime) startTime = ts;
      const t = Math.min((ts - startTime) / DURATION, 1);
      setDisplayScore(Math.floor(fastStartSlowFinish(t) * target));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayScore(target);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playToken, target, prefersReducedMotion]);

  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      <div className="relative w-20 h-20">
        <svg className="absolute inset-0" width="80" height="80" viewBox="0 0 90 90">
          <circle
            cx="45"
            cy="45"
            r={radius}
            stroke="rgba(255,109,5,0.12)"
            strokeWidth="5"
            fill="transparent"
          />
          <motion.circle
            cx="45"
            cy="45"
            r={radius}
            stroke="#ff6d05"
            strokeWidth="5"
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={circumference}
            // Initial offset depends on motion preference:
            //   - Animated path: start empty (`circumference`) so the arc
            //     can sweep up to `finalOffset` during the entrance.
            //   - Reduced-motion path: start AT the final offset so the
            //     arc is already filled on first paint. Without this, the
            //     useAnimation effect below would only adjust the offset
            //     after first paint, producing a single-frame flash of an
            //     empty arc — exactly the kind of motion artifact users
            //     who opted out of animation should not see.
            initial={{
              strokeDashoffset: prefersReducedMotion ? finalOffset : circumference,
            }}
            animate={controls}
            style={{ rotate: -90, transformOrigin: "45px 45px" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-xs font-bold leading-none tabular-nums"
            style={{ color: "#ff6d05", textShadow: "none" }}
          >
            {/* Same accessibility split as MetricRow: `displayScore` cycles
                through 0 → target and resets to 0 when out of view, so
                exposing it to AT would announce "score 0" to keyboard /
                non-visual nav until the user scrolls the card on-screen.
                The sr-only span carries the final truthful score; the
                visible span is aria-hidden so the animated digits never
                reach the accessibility tree. */}
            <span className="sr-only">{target.toLocaleString()}</span>
            <span aria-hidden="true">{displayScore.toLocaleString()}</span>
          </span>
          <span
            className="text-[9px] leading-none mt-0.5 text-fire-amber"
            style={{ textShadow: "none" }}
          >
            score
          </span>
        </div>
      </div>
      <span
        className="text-[10px] text-fire-amber"
        style={{ textShadow: "none" }}
      >
        Activity Score
      </span>
    </div>
  );
}

// ----- Main card -----
export default function ReadmeStatsCard({ data, isUpdated, diffMessage }) {
  const ref = useRef(null);
  // Two visibility signals, intentionally separated:
  //   - `isInView` (raw observer) still drives the card's outer fade-in
  //     variants, the AnimatedTitle's `play`, and the diff-message banner
  //     gate — those should respond immediately to visibility flips.
  //   - `playToken` (latched + hysteresis-debounced) drives the numeric
  //     count-ups, so brief in/out scroll oscillations near the viewport
  //     edge don't restart the animation mid-flight. Passed down to
  //     MetricRow and ActivityArc; both depend on it instead of raw
  //     `isInView` for their RAF loops. `amount: 0.3` fires when ~30% of
  //     the card crosses the viewport.
  const { isInView, playToken } = useViewportCountTrigger(ref, {
    amount: 0.3,
  });
  // Mirrors the CSS `prefers-reduced-motion` override in globals.css so the
  // decorative pulse on the language-color dot also holds still for users
  // who've opted out of motion.
  const prefersReducedMotion = useReducedMotion();

  if (!data) return null;

  const {
    name = "",
    description = "",
    language = "Unknown",
    // Any CSS color the API or a legacy localStorage payload supplies —
    // the glow below routes through `hexToRgba`, which normalizes 3- and
    // 6-digit hex and falls back to gray on anything else.
    languageColor = "#888888",
    stars = 0,
    forks = 0,
    mergedPRs = 0,
    commitCount = 0,
    pushedAt = "—",
    activityScore = 0,
  } = data;

  const metrics = [
    { icon: Star, label: "Stars", value: stars, pulseOnComplete: true },
    { icon: GitFork, label: "Forks", value: forks },
    { icon: GitMerge, label: "Merged PRs", value: mergedPRs },
    { icon: GitCommitHorizontal, label: "Total Commits", value: commitCount },
    { icon: Clock, label: "Last Pushed", value: pushedAt, isDate: true },
  ];

  return (
    <motion.div
      ref={ref}
      variants={cardVariants}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      className="repo-card-breathe w-full p-6 relative overflow-hidden rounded-lg"
    >
      <UpdateBanner
        message={isUpdated && diffMessage ? diffMessage : null}
        visible={isInView}
        srPrefix="Repository update: "
      />

      {/* Title + Most-Active badge */}
      <motion.div variants={childVariants} className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Monitor
            className="w-5 h-5 flex-shrink-0"
            style={{ color: "#ffaa2a" }}
          />
          <AnimatedTitle text={name} play={isInView} />
        </div>
        <span
          // Eyebrow microlabel — same role as "CAREER SNAPSHOT" on the
          // modal and "YEARS IN THE CRAFT" on the years card, so it
          // takes the same eyebrow amber palette token.
          // `badge-shimmer` paints its own moving gradient as the element
          // background, which would override the fire-amber background-clip
          // gradient if both lived on the same node. Keep the shimmer on
          // the outer pill and apply `text-fire-amber` to an inner span so
          // the text itself can still clip its own gradient.
          className="badge-shimmer relative text-xs font-light px-2 py-0.5 rounded-full overflow-hidden whitespace-nowrap"
          style={{
            textShadow: "none",
            border: "1px solid #ffaa2a",
          }}
        >
          <span className="text-fire-amber">Most Active Repository</span>
        </span>
      </motion.div>

      {/* Description */}
      <motion.p
        variants={childVariants}
        className="text-sm font-light mb-4 text-fire-amber"
        style={{ textShadow: "none" }}
      >
        {description}
      </motion.p>

      {/* Language */}
      <motion.div variants={childVariants} className="flex items-center gap-2 mb-4">
        <motion.div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{
            backgroundColor: languageColor,
            // Static, resting glow for reduced-motion mode — keeps the dot
            // visually consistent with the animated state's midpoint instead
            // of dropping to a flat, glowless circle.
            ...(prefersReducedMotion && {
              boxShadow: `0 0 4px ${hexToRgba(languageColor, 0.5)}`,
            }),
          }}
          animate={
            prefersReducedMotion
              ? undefined
              : {
                  scale: [1, 1.35, 1],
                  boxShadow: [
                    `0 0 4px ${hexToRgba(languageColor, 0.5)}`,
                    `0 0 12px ${hexToRgba(languageColor, 0.8)}`,
                    `0 0 4px ${hexToRgba(languageColor, 0.5)}`,
                  ],
                }
          }
          transition={
            prefersReducedMotion
              ? undefined
              : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
          }
        />
        <span
          className="text-sm font-light text-fire-amber"
          style={{ textShadow: "none" }}
        >
          {language}
        </span>
      </motion.div>

      {/* Metric column + activity arc. On mobile the column takes full width
          (so labels sit at the left edge and values at the right edge of the
          card) and the arc stacks beneath, centered. On sm+ they sit
          side-by-side, centered as a pair. */}
      <motion.div variants={childVariants} className="flex flex-col items-center gap-4 sm:flex-row sm:flex-wrap sm:justify-center">
        <motion.div
          variants={metricContainerVariants}
          // On mobile: w-full so each MetricRow's justify-between pins the
          // label to the card's left edge and the value to the right edge.
          // On sm+: flex-1 + min-w-[200px] keeps the longest label
          // ("Total Commits 2,844") from truncating; if the container is
          // narrower than that + the arc + gap, the arc wraps below.
          className="flex flex-col gap-1 w-full sm:w-auto sm:flex-1 sm:min-w-[200px]"
        >
          {metrics.map((m) => (
            <MetricRow key={m.label} {...m} playToken={playToken} prefersReducedMotion={prefersReducedMotion} />
          ))}
        </motion.div>
        <ActivityArc score={activityScore} playToken={playToken} prefersReducedMotion={prefersReducedMotion} />
      </motion.div>
    </motion.div>
  );
}
