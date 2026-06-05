"use client";

import { motion, useReducedMotion } from "framer-motion";
import { GitCommitVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { UpdateBanner } from "./UpdateBanner";
import { useViewportCountTrigger } from "@/hooks/useViewportCountTrigger";
import { useStreakUpdateSignal } from "@/hooks/useStreakUpdateSignal";
import { animateToTarget, fastStartSlowFinish } from "@/utils/animationCurves";

// ---------------------------------------------------------------------------
// Palette — exact parity with the rest of the About design system:
//   ORANGE  #ff6d05      → all numbers + the ring fill (matches the GitHub
//                          Stats card numbers/title and rank arc)
//   text-fire-amber      → block labels (matches the Architect paragraph and
//                          the other cards' stat labels)
//   AMBER   #ffaa2a      → flame icon + eyebrow microlabel
//   DATE_TONE #d4af7a    → muted gold for the date ranges — a softer variant
//                          of the label tone so the hierarchy reads cleanly
//   RING_TRACK           → faded #ff6d05 ghost of the fill (GitHub Stats arc)
// ---------------------------------------------------------------------------
const ORANGE = "#ff6d05";
const AMBER = "#ffaa2a";
const DATE_TONE = "#d4af7a";
const RING_TRACK = "rgba(255,109,5,0.12)";

const COUNT_UP_MS = 2000; // shared window so all three values land together
const BANNER_VISIBLE_MS = 4500;
const RING_RADIUS = 55;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/* ----------------------------- COUNT-UP NUMBER -----------------------------
   Imperative 0 → target count-up on a ref (no per-frame React re-render),
   driven by `playToken` so it re-fires on every TRUE viewport re-entry and
   holds at 0 before the first entry. Uses the shared `animateToTarget`
   (fast-start / slow-finish curve) and clamps exactly on the target. Honours
   reduced motion by painting the final value with no tween. The animated
   digits are `aria-hidden` and an `sr-only` span carries the final value, so
   assistive tech never hears the intermediate "0" (mirrors StatsCard). */
function StreakNumber({
  target = 0,
  playToken,
  prefersReducedMotion,
  className = "",
  style,
  srLabel,
}) {
  const ref = useRef(null);
  const safe = Number(target) || 0;

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (prefersReducedMotion) {
      node.textContent = String(safe);
      return undefined;
    }
    if (playToken === 0) {
      // Pre-entry: hold at 0 so the first true entry plays a full sweep.
      node.textContent = "0";
      return undefined;
    }
    // Reset to 0 SYNCHRONOUSLY before scheduling the tween. animateToTarget
    // paints its first value on the next rAF tick, so without this the node
    // would show its previous final value (e.g. the last streak count) for one
    // frame on a re-entry or data change before dropping to 0 — a visible flash.
    node.textContent = "0";
    const cancel = animateToTarget({
      from: 0,
      to: safe,
      duration: COUNT_UP_MS,
      onUpdate: (v) => {
        node.textContent = String(Math.round(v));
      },
    });
    return cancel;
  }, [playToken, safe, prefersReducedMotion]);

  return (
    <span className={className} style={style}>
      <span className="sr-only">{srLabel ?? safe}</span>
      <span ref={ref} aria-hidden="true">
        {prefersReducedMotion ? safe : 0}
      </span>
    </span>
  );
}

/* ----------------------- STAGGERED ENTRANCE VARIANTS -----------------------
   The card reveals its three sections in sequence on every viewport entry —
   Total Contributions, then the Current Streak ring, then Longest Streak — a
   left-to-right cascade rather than everything popping at once. The row is the
   stagger container; each column (and the dividers between them) is an item, so
   they fade+rise in DOM order. Reduced motion swaps to the "still" item set
   (no transform/opacity tween) while keeping the same structure. */
const STAGGER_CONTAINER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.13, delayChildren: 0.1 } },
};
const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};
const STAGGER_ITEM_STILL = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

/* ------------------------------- STAT BLOCK -------------------------------
   Total Contributions / Longest Streak: a count-up number, a fire-amber
   label, and a static (never animated) muted-gold date range. Rendered as a
   stagger item so it slides into the cascade. */
function StatBlock({ label, value, dateRange, playToken, prefersReducedMotion, variants }) {
  return (
    <motion.div
      variants={variants}
      className="flex flex-col items-center justify-center flex-1 text-center min-w-0"
    >
      <StreakNumber
        target={Number(value) || 0}
        playToken={playToken}
        prefersReducedMotion={prefersReducedMotion}
        className="text-2xl sm:text-3xl lg:text-4xl font-bold tabular-nums mb-2"
        style={{ color: ORANGE, textShadow: "none" }}
      />
      <span
        className="text-sm md:text-base mb-1 font-semibold text-fire-amber"
        style={{ textShadow: "none" }}
      >
        {label}
      </span>
      <span
        className="text-[10px] sm:text-xs md:text-sm font-light break-words"
        style={{ color: DATE_TONE }}
      >
        {dateRange}
      </span>
    </motion.div>
  );
}

// Vertical gradient divider — a faded amber line that dissolves at both ends,
// replacing the previous flat white rule. Hidden on the stacked mobile layout.
// A stagger item so it fades in between its two neighbouring columns.
function Divider({ variants }) {
  return (
    <motion.div
      variants={variants}
      aria-hidden="true"
      className="hidden sm:block w-px self-stretch my-2 mx-1 shrink-0"
      style={{
        background:
          "linear-gradient(to bottom, transparent, rgba(255,170,42,0.45), transparent)",
      }}
    />
  );
}

export default function StreakStatsCard({ data }) {
  const cardRef = useRef(null);
  // Latched, hysteresis-debounced viewport trigger: `playToken` re-fires the
  // count-ups + ring sweep on each TRUE re-entry (never loops while the card
  // stays visible, and absorbs the IntersectionObserver flicker that the raw
  // observer would emit during the parent ItemLayout's scale entrance);
  // `settledInView` (debounced + reversible) drives the card's fade/slide
  // entrance AND gates the banner overlay, so both ride out the same flicker
  // that raw `isInView` would expose as on/off jitter.
  const { playToken, settledInView } = useViewportCountTrigger(cardRef, {
    amount: 0.3,
    margin: "-50px",
  });
  // `hasEntered` (monotonic) still gates the ring/count-up internals, which
  // key off `playToken` and replay on their own. `settledInView` (debounced,
  // reversible) drives the card's fade/slide entrance so it REPLAYS on every
  // true viewport re-entry instead of firing once on first load.
  const hasEntered = playToken > 0;
  const prefersReducedMotion = useReducedMotion();

  const { totalContributions, currentStreak, longestStreak } = data || {};

  // --- Smart update banner (issue #21) ---
  const { pendingMessage, consume } = useStreakUpdateSignal(data);
  const [bannerMessage, setBannerMessage] = useState(null);
  // Capture the pending message as soon as it exists — NOT gated on viewport —
  // so UpdateBanner's always-mounted aria-live region announces the change
  // immediately (AT users navigate by structure, not by scrolling here).
  // consume() advances the localStorage baseline so a reload doesn't replay it.
  useEffect(() => {
    if (!pendingMessage) return;
    setBannerMessage(pendingMessage);
    consume();
  }, [pendingMessage, consume]);
  // Auto-hide the VISUAL banner ~4.5s after it actually paints (timer restarts
  // on each settled entry), so an update detected off-screen isn't dismissed
  // unseen. Gated on `settledInView` — the same signal the banner paints on —
  // so flicker can't restart the timer while the banner stays visible.
  // consume() above only nulls pendingMessage, not this timer.
  useEffect(() => {
    if (!bannerMessage || !settledInView) return undefined;
    const timer = setTimeout(() => setBannerMessage(null), BANNER_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [bannerMessage, settledInView]);

  // Current streak as a fraction of the personal best — the ring visualises
  // "how close is the current streak to your longest?". Clamped to [0,1];
  // falls back to a full ring when there's an active streak but no recorded
  // longest, and an empty ring when there's no current streak.
  const current = Number(currentStreak?.value) || 0;
  const longest = Number(longestStreak?.value) || 0;
  const fraction =
    longest > 0 ? Math.min(current / longest, 1) : current > 0 ? 1 : 0;
  const filledOffset = RING_CIRCUMFERENCE * (1 - fraction);
  const ringSrLabel =
    longest > 0
      ? `${current} day${current === 1 ? "" : "s"}, ${Math.round(
          fraction * 100
        )} percent of your longest streak`
      : `${current} day${current === 1 ? "" : "s"}`;

  // Stagger item variant set — motion when allowed, still under reduced motion.
  const itemVariants = prefersReducedMotion ? STAGGER_ITEM_STILL : STAGGER_ITEM;

  return (
    // `repo-card-breathe rounded-lg` matches the sibling cards' inner chrome
    // (the breathing orange halo on a rounded perimeter inside the ItemLayout's
    // amber `custom-bg-abt` border). The card itself just fades in on
    // `settledInView`; the three stat sections inside cascade in sequence (see
    // the stagger container below), and both replay on every viewport re-entry.
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: settledInView ? 1 : 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4, ease: "easeOut" }}
      className="repo-card-breathe rounded-lg w-full h-full relative overflow-hidden p-5 sm:p-6 flex flex-col justify-center"
    >
      <UpdateBanner
        message={bannerMessage}
        visible={settledInView}
        srPrefix="Streaks update: "
        variant="orange"
      />

      {/* Eyebrow — same microlabel treatment as the sibling cards. */}
      <p
        aria-hidden="true"
        className="text-[10px] uppercase tracking-[0.22em] mb-4 sm:mb-5"
        style={{ color: AMBER, textShadow: "none" }}
      >
        Contribution streaks
      </p>

      {/* Stagger container — reveals Total Contributions → Current Streak →
          Longest Streak in a left-to-right cascade on each viewport entry. */}
      <motion.div
        variants={STAGGER_CONTAINER}
        initial="hidden"
        animate={settledInView ? "visible" : "hidden"}
        className="flex flex-col sm:flex-row items-stretch justify-between gap-5 sm:gap-2"
      >
        {/* Total Contributions */}
        <StatBlock
          label="Total Contributions"
          value={totalContributions?.value}
          dateRange={totalContributions?.dateRange}
          playToken={playToken}
          prefersReducedMotion={prefersReducedMotion}
          variants={itemVariants}
        />

        <Divider variants={itemVariants} />

        {/* Current Streak — count-up centred in a progress ring whose fill
            shows the current streak as a share of the longest. */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center flex-1 text-center min-w-0"
        >
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 flex items-center justify-center mb-2">
            <svg
              className="absolute w-full h-full"
              viewBox="0 0 120 120"
              style={{ transform: "rotate(-90deg)" }}
              aria-hidden="true"
            >
              <circle
                cx="60"
                cy="60"
                r={RING_RADIUS}
                fill="none"
                stroke={RING_TRACK}
                strokeWidth="6"
              />
              {/* `key={playToken}` remounts the arc on each true entry so the
                  sweep replays; pre-entry (playToken 0 → hasEntered false) it
                  holds empty. Reduced motion snaps to the filled offset. No
                  drop-shadow glow — the ring is a flat stroke. */}
              <motion.circle
                key={playToken}
                cx="60"
                cy="60"
                r={RING_RADIUS}
                fill="none"
                stroke={ORANGE}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
                animate={{
                  strokeDashoffset: hasEntered
                    ? filledOffset
                    : RING_CIRCUMFERENCE,
                }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { duration: 1.5, ease: fastStartSlowFinish, delay: 0.2 }
                }
              />
            </svg>
            {/* Git commit node sitting on the streak ring — the latest commit
                on the branch of your contribution streak. A soft amber glow
                lifts it off the ring stroke (no hard mask box); a gentle pulse
                gives it life (held steady under reduced motion). */}
            <span
              aria-hidden="true"
              className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              <motion.span
                className="block origin-center"
                animate={
                  prefersReducedMotion
                    ? undefined
                    : { scale: [1, 1.12, 1], opacity: [0.9, 1, 0.9] }
                }
                transition={
                  prefersReducedMotion
                    ? undefined
                    : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
                }
              >
                <GitCommitVertical
                  size={26}
                  style={{
                    color: AMBER,
                    filter: "drop-shadow(0 0 5px rgba(255,170,42,0.7))",
                  }}
                />
              </motion.span>
            </span>
            <StreakNumber
              target={current}
              playToken={playToken}
              prefersReducedMotion={prefersReducedMotion}
              srLabel={ringSrLabel}
              className="z-10 text-2xl sm:text-3xl lg:text-4xl font-bold tabular-nums"
              style={{ color: ORANGE, textShadow: "none" }}
            />
          </div>
          <span
            className="text-sm md:text-base mb-1 font-semibold text-fire-amber"
            style={{ textShadow: "none" }}
          >
            Current Streak
          </span>
          <span
            className="text-[10px] sm:text-xs md:text-sm font-light break-words"
            style={{ color: DATE_TONE }}
          >
            {currentStreak?.dateRange}
          </span>
        </motion.div>

        <Divider variants={itemVariants} />

        {/* Longest Streak */}
        <StatBlock
          label="Longest Streak"
          value={longestStreak?.value}
          dateRange={longestStreak?.dateRange}
          playToken={playToken}
          prefersReducedMotion={prefersReducedMotion}
          variants={itemVariants}
        />
      </motion.div>
    </motion.div>
  );
}
