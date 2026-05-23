"use client";

import { AnimatePresence, motion, useAnimation, useInView, useReducedMotion } from "framer-motion";
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
      <h3 className="text-xl font-semibold text-shadow-neon-orange break-words">
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
    <motion.h3
      variants={container}
      initial="hidden"
      animate={play ? "visible" : "hidden"}
      className="text-xl font-semibold text-shadow-neon-orange break-words"
    >
      {chars.map((c, i) => (
        <motion.span
          key={i}
          variants={charVariant}
          style={{ display: "inline-block" }}
        >
          {c === " " ? " " : c}
        </motion.span>
      ))}
    </motion.h3>
  );
}

// ----- Single metric row: count-up + optional post-count pulse -----
function MetricRow({ icon: Icon, label, value, isInView, isDate = false, pulseOnComplete = false }) {
  const [display, setDisplay] = useState(isDate ? value : 0);
  const [pulse, setPulse] = useState(false);
  const rafRef = useRef(null);
  const target = isDate ? value : Number(value) || 0;
  // 2 s gives the slow-settle phase room to breathe — at the previous 1.1 s
  // the settle phase compressed into ~800 ms and the elite landing felt rushed.
  const DURATION = 2000;

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (isDate) {
      setDisplay(value);
      return;
    }
    if (!isInView) {
      setDisplay(0);
      setPulse(false);
      return;
    }

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
  }, [isInView, target, isDate, value, pulseOnComplete]);

  return (
    <motion.div
      variants={metricRowVariants}
      whileHover={{ x: 5, transition: { duration: 0.18 } }}
      className="flex items-center justify-between gap-2 w-full px-2 py-1 rounded-md hover:bg-orange-500/5 transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0">
        <motion.span
          whileHover={{ scale: 1.25, rotate: 6 }}
          transition={{ type: "spring", stiffness: 400 }}
          className="flex-shrink-0"
        >
          <Icon className="w-4 h-4 text-amber-500" />
        </motion.span>
        <span
          className="text-xs sm:text-sm text-shadow-neon-light-orange truncate"
          style={{ textShadow: "none" }}
        >
          {label}
        </span>
      </div>
      <motion.span
        animate={pulse ? { scale: [1, 1.18, 1], transition: { duration: 0.4, ease: "easeOut" } } : { scale: 1 }}
        onAnimationComplete={() => pulse && setPulse(false)}
        className="text-xs sm:text-sm font-semibold text-shadow-neon-orange tabular-nums whitespace-nowrap"
      >
        {isDate ? display : display.toLocaleString()}
      </motion.span>
    </motion.div>
  );
}

// ----- Activity score arc (SVG) -----
function ActivityArc({ score, maxScore = 10000, isInView }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const controls = useAnimation();
  const target = Math.min(Math.round(score), maxScore);
  const [displayScore, setDisplayScore] = useState(0);
  const rafRef = useRef(null);
  const DURATION = 2000;

  // Arc fill: drives strokeDashoffset from "empty" to the final fill amount
  // using the same easing the numeric counters use, so the arc and the number
  // inside it land together as a single elite gesture.
  useEffect(() => {
    if (isInView) {
      controls.start({
        strokeDashoffset: circumference * (1 - Math.min(score / maxScore, 1)),
        transition: { duration: DURATION / 1000, ease: fastStartSlowFinish },
      });
    } else {
      controls.start({
        strokeDashoffset: circumference,
        transition: { duration: 0.3 },
      });
    }
  }, [isInView, score, maxScore, circumference, controls]);

  // Numeric count-up: identical sprint-then-settle behaviour as MetricRow.
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (!isInView) {
      setDisplayScore(0);
      return;
    }

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
  }, [isInView, target]);

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
            initial={{ strokeDashoffset: circumference }}
            animate={controls}
            style={{ rotate: -90, transformOrigin: "45px 45px" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-bold text-shadow-neon-orange leading-none tabular-nums">
            {displayScore.toLocaleString()}
          </span>
          <span
            className="text-[9px] text-shadow-neon-light-orange leading-none mt-0.5"
            style={{ textShadow: "none" }}
          >
            score
          </span>
        </div>
      </div>
      <span
        className="text-[10px] text-shadow-neon-light-orange"
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
  // `once: false` lets the count-ups and entrance animations replay on every
  // scroll-in. `amount: 0.3` fires when ~30% of the card crosses the viewport.
  const isInView = useInView(ref, { amount: 0.3, once: false });
  // Mirrors the CSS `prefers-reduced-motion` override in globals.css so the
  // decorative pulse on the language-color dot also holds still for users
  // who've opted out of motion.
  const prefersReducedMotion = useReducedMotion();

  if (!data) return null;

  const {
    name = "",
    description = "",
    language = "Unknown",
    // 6-digit hex; the `${languageColor}80` / `${languageColor}cc` alpha
    // suffixes below produce invalid CSS (`#88880`) against a 3-digit color.
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
      <AnimatePresence>
        {isUpdated && isInView && diffMessage && (
          <motion.div
            key="repo-banner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="absolute inset-0 z-10 flex items-center justify-center rounded-lg overflow-hidden"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(255,179,71,0.18) 0%, rgba(177,102,18,0.10) 35%, rgba(10,6,3,0.92) 75%)",
              backdropFilter: "blur(16px) saturate(140%)",
              WebkitBackdropFilter: "blur(16px) saturate(140%)",
              boxShadow:
                "inset 0 0 0 1px rgba(255,179,71,0.35), inset 0 0 40px rgba(255,109,5,0.08), 0 0 28px rgba(255,109,5,0.14)",
            }}
          >
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12, ease: "easeOut" }}
              className="font-medium text-lg md:text-xl tracking-wide text-center px-6"
              style={{
                color: "#ffb347",
                textShadow:
                  "0 0 4px rgba(255,176,58,0.65), 0 0 14px rgba(177,102,18,0.55), 0 0 28px rgba(255,109,5,0.18)",
              }}
            >
              {diffMessage}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Title + Most-Active badge */}
      <motion.div variants={childVariants} className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Monitor className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <AnimatedTitle text={name} play={isInView} />
        </div>
        <span
          className="badge-shimmer relative text-shadow-neon-light-orange text-xs font-light px-2 py-0.5 border border-amber-500/40 rounded-full overflow-hidden whitespace-nowrap"
          style={{ textShadow: "none" }}
        >
          Most Active Repository
        </span>
      </motion.div>

      {/* Description */}
      <motion.p
        variants={childVariants}
        className="text-sm text-shadow-neon-light-orange font-light mb-4"
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
              boxShadow: `0 0 4px ${languageColor}80`,
            }),
          }}
          animate={
            prefersReducedMotion
              ? undefined
              : {
                  scale: [1, 1.35, 1],
                  boxShadow: [
                    `0 0 4px ${languageColor}80`,
                    `0 0 12px ${languageColor}cc`,
                    `0 0 4px ${languageColor}80`,
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
          className="text-sm text-shadow-neon-light-orange font-light"
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
            <MetricRow key={m.label} {...m} isInView={isInView} />
          ))}
        </motion.div>
        <ActivityArc score={activityScore} isInView={isInView} />
      </motion.div>
    </motion.div>
  );
}
