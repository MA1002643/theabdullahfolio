"use client";

import { motion, useAnimation, useReducedMotion } from "framer-motion";
import {
    Activity,
    AlertCircle,
    Clock,
    GitBranch,
    Package,
    Star,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { fastStartSlowFinish } from "@/utils/animationCurves";
import { useViewportCountTrigger } from "@/hooks/useViewportCountTrigger";
import { UpdateBanner } from "./UpdateBanner";
import { fluid, fluidText } from "@/lib/fluidScale";

// ---------------------------------------------------------------------------
// Palette — deliberately the SAME tokens the "Most Active Repository" card
// uses (RepoStatsCard.jsx), so the two cards read as one design system:
//   - ORANGE   #ff6d05  → all metric numbers, the title, the rank arc fill
//   - text-fire-amber   → labels (vertical fire gradient utility)
//   - AMBER    #ffaa2a  → icons + eyebrow microlabel
//   - arc track rgba(255,109,5,0.12) — faded ghost of the fill
// ---------------------------------------------------------------------------
const ORANGE = "#ff6d05";
const AMBER = "#ffaa2a";
const ARC_TRACK = "rgba(255,109,5,0.12)";

// Count-up window — 2s lets the sprint-then-settle easing land deliberately
// (matches RepoStatsCard's DURATION so every counter across the two cards
// settles on the same cadence).
const DURATION_MS = 2000;
// Banner lingers 4.5s, then auto-hides — local to the card so it dismisses
// well before the parent's coarser 10s changedFields reset.
const BANNER_VISIBLE_MS = 4500;
// "Just changed" heartbeat window — two clean 1s cycles of `skill-heartbeat`,
// matching the Languages / Repo cards.
const HEARTBEAT_MS = 2000;
// Short beat between the banner clearing and the heartbeat starting, so the
// pulse plays just AFTER the banner rather than overlapping its fade-out.
const POST_BANNER_BEAT_MS = 400;
// Stable empty Set so "nothing pulsing" keeps a constant identity across renders.
const EMPTY_FIELD_SET = new Set();

// ----- Card-level choreography (mirrors RepoStatsCard) -----
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

/* ----------------------------- ANIMATED TITLE -----------------------------
   Per-character blur-fade-in, exactly like the repo card's title — only the
   palette (ORANGE) and the responsive sizing differ. Reduced motion renders a
   plain heading; the per-char spans are aria-hidden with an aria-label so the
   accessible name stays clean. */
function AnimatedTitle({ text, play }) {
    const prefersReducedMotion = useReducedMotion();
    // `abt-title` re-derives the size from --fluid-scale under the /about
    // fluid scope (issue #25); the utilities stay as the out-of-scope base.
    const className =
        "abt-title text-lg sm:text-xl md:text-2xl font-semibold break-words leading-tight";

    if (prefersReducedMotion) {
        return (
            <h2 className={className} style={{ color: ORANGE, textShadow: "none" }}>
                {text}
            </h2>
        );
    }

    const chars = Array.from(text);
    const container = {
        hidden: {},
        visible: { transition: { staggerChildren: 0.025, delayChildren: 0.2 } },
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
        <motion.h2
            variants={container}
            initial="hidden"
            animate={play ? "visible" : "hidden"}
            className={className}
            style={{ color: ORANGE, textShadow: "none" }}
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
        </motion.h2>
    );
}

/* ------------------------------- METRIC ROW -------------------------------
   One stat line: amber icon (scale/rotate on hover), fire-amber label, and an
   orange count-up value. The count-up runs on `fastStartSlowFinish` and starts
   simultaneously for every row (issue #19 — metrics move as one unit; the
   per-row *entrance* slide is what's staggered, via metricRowVariants). The
   headline stat (Stars) gets a single scale-pulse the instant it lands.
   Accessibility: the animated digits are aria-hidden and an sr-only span
   carries the final value so AT never hears "0". */
function MetricRow({ icon: Icon, label, value, playToken, pulseOnComplete = false, heartbeat = false, prefersReducedMotion }) {
    const target = Number(value) || 0;
    const [display, setDisplay] = useState(prefersReducedMotion ? target : 0);
    const [pulse, setPulse] = useState(false);
    const rafRef = useRef(null);

    useEffect(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        if (prefersReducedMotion) {
            setDisplay(target);
            setPulse(false);
            return;
        }
        // Not yet entered the viewport — hold at 0 so the first entry plays a
        // full 0 → target sweep.
        if (playToken === 0) {
            setPulse(false);
            return;
        }
        // Zero-target fast path: the easing yields 0 every frame, so skip the
        // ~120-frame RAF loop that would only call setDisplay(0) repeatedly.
        // This applies even to a `pulseOnComplete` row (e.g. Stars on a brand-
        // new account with 0 stars): a "landing" pulse on a number that never
        // counted up from 0 is meaningless, so we skip both the loop and the
        // pulse rather than burning renders to celebrate a static 0.
        if (target === 0) {
            setDisplay(0);
            setPulse(false);
            return;
        }

        // Snap to 0 before the first frame so a re-entry trigger animates from
        // 0 again rather than flashing the previous final value.
        setDisplay(0);
        let startTime = null;
        const tick = (ts) => {
            if (!startTime) startTime = ts;
            const t = Math.min((ts - startTime) / DURATION_MS, 1);
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
    }, [playToken, target, pulseOnComplete, prefersReducedMotion]);

    return (
        <motion.div
            variants={metricRowVariants}
            whileHover={prefersReducedMotion ? undefined : { x: 5, transition: { duration: 0.18 } }}
            className="flex items-center justify-between gap-2 w-full px-2 py-1.5 rounded-md hover:bg-[#ff6d05]/5 transition-colors"
        >
            <div className="flex items-center gap-2 min-w-0">
                <motion.span
                    whileHover={prefersReducedMotion ? undefined : { scale: 1.25, rotate: 6 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className="flex-shrink-0"
                >
                    <Icon
                        className="w-4 h-4 sm:w-5 sm:h-5"
                        style={{ color: AMBER, width: fluidText(1.25, 1), height: fluidText(1.25, 1) }}
                    />
                </motion.span>
                <span
                    className={`text-xs sm:text-sm md:text-base truncate text-fire-amber${heartbeat ? " skill-heartbeat" : ""}`}
                    style={{ textShadow: "none", fontSize: fluidText(1, 0.75) }}
                >
                    {label}
                </span>
            </div>
            <motion.span
                animate={pulse ? { scale: [1, 1.18, 1], transition: { duration: 0.4, ease: "easeOut" } } : { scale: 1 }}
                onAnimationComplete={() => pulse && setPulse(false)}
                // `heartbeat` is the post-banner "this stat just rose" opacity pulse
                // (skill-heartbeat) on BOTH the label (above) and this number,
                // independent of the local `pulse` scale-bounce on count-up landing.
                className={`text-xs sm:text-sm md:text-base font-semibold tabular-nums whitespace-nowrap${heartbeat ? " skill-heartbeat" : ""}`}
                style={{ color: ORANGE, textShadow: "none", fontSize: fluidText(1, 0.75) }}
            >
                <span className="sr-only">{target.toLocaleString()}</span>
                <span aria-hidden="true">{display.toLocaleString()}</span>
            </motion.span>
        </motion.div>
    );
}

/* -------------------------------- RANK ARC --------------------------------
   The rank circle, elevated past the repo card's ActivityArc: a faded orange
   track, an orange progress arc that sweeps in on the same easing, a breathing
   radial glow behind it, and the level letter rendered in orange with a soft
   heat halo. Responsive diameter (120 → 144 → 160px) via the wrapper; the SVG
   fills it and keeps its 160-unit viewBox so the geometry scales cleanly. */
function RankArc({ level, percentile, playToken, prefersReducedMotion }) {
    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const controls = useAnimation();
    // Fraction filled follows the prior contract (percentile/100), clamped so
    // a stray >100 / <0 percentile can't over/under-draw the arc.
    const fraction = Math.min(Math.max(Number(percentile) || 0, 0), 100) / 100;
    const finalOffset = circumference * (1 - fraction);

    useEffect(() => {
        if (prefersReducedMotion) {
            controls.start({ strokeDashoffset: finalOffset, transition: { duration: 0 } });
            return;
        }
        if (playToken === 0) {
            controls.set({ strokeDashoffset: circumference });
            return;
        }
        controls.set({ strokeDashoffset: circumference });
        controls.start({
            strokeDashoffset: finalOffset,
            transition: { duration: DURATION_MS / 1000, ease: fastStartSlowFinish },
        });
    }, [playToken, finalOffset, circumference, controls, prefersReducedMotion]);

    return (
        <div
            className="relative w-[120px] h-[120px] sm:w-36 sm:h-36 lg:w-40 lg:h-40 flex-shrink-0"
            // Fluid ring: 10rem = the lg:w-40 anchor; 7.5rem floor = the
            // legacy 120px mobile size. The SVG inside is viewBox-drawn, so
            // scaling the wrapper scales the whole arc proportionally.
            style={{ width: fluidText(10, 7.5), height: fluidText(10, 7.5) }}
        >
            {/* Breathing radial glow behind the ring — the "beyond elite"
                flourish. Held static (no pulse) under reduced motion. */}
            <motion.div
                aria-hidden="true"
                className="absolute inset-2 rounded-full"
                style={{
                    background: "radial-gradient(circle, rgba(255,109,5,0.28) 0%, transparent 68%)",
                }}
                animate={
                    prefersReducedMotion
                        ? undefined
                        : { opacity: [0.5, 0.9, 0.5], scale: [0.96, 1.04, 0.96] }
                }
                transition={
                    prefersReducedMotion ? undefined : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }
                }
            />
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 160 160">
                {/* Faded track — a dim ghost of the fill, same relationship as
                    the repo card's arc track. */}
                <circle cx="80" cy="80" r={radius} stroke={ARC_TRACK} strokeWidth="6" fill="transparent" />
                {/* Progress arc — orange, sweeps in on entry. */}
                <motion.circle
                    cx="80"
                    cy="80"
                    r={radius}
                    stroke={ORANGE}
                    strokeWidth="6"
                    fill="transparent"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: prefersReducedMotion ? finalOffset : circumference }}
                    animate={controls}
                    style={{ rotate: -90, transformOrigin: "80px 80px" }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                    className="text-3xl sm:text-4xl font-bold leading-none"
                    style={{
                        color: ORANGE,
                        textShadow: "0 0 10px rgba(255,109,5,0.55), 0 0 22px rgba(255,109,5,0.3)",
                        fontSize: fluidText(2.25, 1.875),
                    }}
                >
                    {level}
                </span>
                <span className="abt-micro text-[10px] uppercase tracking-[0.22em] mt-1 text-fire-amber" style={{ textShadow: "none" }}>
                    Rank
                </span>
            </div>
        </div>
    );
}

/* ---------------------------------- CARD ---------------------------------- */
export default function GitHubStatsCard({ data, userName = "GitHub User", isUpdated, diffMessage = null, pulseFields, isLive = false }) {
    const cardRef = useRef(null);
    // `playToken` (latched, hysteresis-debounced, monotonic) drives the
    // count-ups/arc, which key off its value and replay each entry on their
    // own. `settledInView` (debounced + reversible, so flicker-immune like
    // playToken but able to revert) drives the entrance fade + title play so
    // they REPLAY on every true viewport re-entry rather than once on first
    // load. `isInView` is kept only for the banner gate.
    const { isInView, playToken, settledInView } = useViewportCountTrigger(cardRef, { amount: 0.3, margin: "-50px" });
    const prefersReducedMotion = useReducedMotion();

    // Incoming change copy from the parent — prefer the specific per-stat diff,
    // fall back to a generic line for non-value changes (e.g. display name).
    const incomingMessage = diffMessage ?? (isUpdated ? "GitHub stats updated" : null);

    // Self-contained banner state — mirrors LanguagesCard / SkillsCard so the
    // banner can NEVER get stuck. The parent's message is captured into LOCAL
    // state the MOMENT it arrives (NOT gated on in-view), then displayed and
    // auto-hidden only once the card has settled in view.
    //
    // Capturing immediately is load-bearing. The parent (index.jsx) clears
    // `statsDiffMessage` / `statsChangedFields` on a coarse 10s timer, so an
    // update that lands while this card is off-screen would otherwise vanish from
    // props before an in-view-gated capture could copy it — taking the banner AND
    // (via the `statsBannerGone` gate below, which only flips on this local
    // banner's shown→hidden edge) the heartbeat with it. The local copy outlives
    // the parent's reset, so a later scroll-in still shows both. This matches the
    // `pendingStats` capture further down, which is already view-independent.
    //
    // Display + auto-hide gate on `settledInView` (debounced, flicker-immune),
    // which is what keeps the banner from getting stuck — the original bug keyed
    // on raw `isInView`, which flickers while scrolling, so every flicker
    // re-opened the banner and restarted the auto-hide timer and it never settled
    // to hidden. `settledInView` only flips on a genuine enter/exit, so the 4.5s
    // window is spent on real in-view time and always resolves to hidden.
    const [bannerMessage, setBannerMessage] = useState(null);
    const lastShownRef = useRef(null);

    // Capture a genuinely NEW message into local state as soon as it arrives,
    // regardless of viewport (see the rationale above — survives the parent's 10s
    // reset). The ref guards against re-capturing the SAME message after it has
    // hidden; showing it is deferred to `settledInView` by the banner + auto-hide.
    useEffect(() => {
        if (!incomingMessage) return;
        if (lastShownRef.current === incomingMessage) return;
        lastShownRef.current = incomingMessage;
        setBannerMessage(incomingMessage);
    }, [incomingMessage]);

    // When the upstream message clears, drop the guard so an identical future
    // change can show again.
    useEffect(() => {
        if (!incomingMessage) lastShownRef.current = null;
    }, [incomingMessage]);

    // Auto-hide — gated on the local message AND `settledInView`, so the 4.5s
    // visible window is measured from when the card is actually seen (a message
    // captured off-screen waits to be shown), and only the debounced, flicker-
    // immune `settledInView` can start/clear it — a raw isInView flicker never
    // could. Always resolves to hidden after BANNER_VISIBLE_MS of in-view time.
    useEffect(() => {
        if (!bannerMessage || !settledInView) return undefined;
        const timer = setTimeout(() => setBannerMessage(null), BANNER_VISIBLE_MS);
        return () => clearTimeout(timer);
    }, [bannerMessage, settledInView]);

    // ── "Just rose" heartbeat ───────────────────────────────────────────────
    // Pulse the label + number of every stat that went UP, AFTER the banner and
    // once the card is in view (same model as the Languages / Repo cards).
    // `pulseFields` is the risen-stat list (['stars','commits',…]) from the
    // parent's stats diff.
    //
    // Capture the risen-stat fields locally, held until the pulse consumes them —
    // the parent clears `pulseFields` on its 10s reset, so relying on the live
    // prop could strip them before the (post-banner) pulse runs.
    const [pendingStats, setPendingStats] = useState([]);
    const statsFieldsKey = Array.isArray(pulseFields) ? pulseFields.join(",") : "";
    // Snapshot the fields per NEW banner message — the EMPTY case included. The
    // old `if (statsFieldsKey) …` capture ran ONLY for a non-empty list, so a
    // newer message carrying no risen stats (a decrease, or a non-stat change like
    // a display-name edit) left the PREVIOUS update's fields in `pendingStats`,
    // which then heart-beat stale rows right after the new banner. Keying on the
    // message clears them for the empty case too, while the `null` branch ignores
    // the parent's later 10s reset (it nulls the message AND empties `pulseFields`)
    // so a not-yet-run pulse keeps the fields it still needs.
    const pendingMsgRef = useRef(null);
    useEffect(() => {
        if (!incomingMessage) {
            pendingMsgRef.current = null;
            return;
        }
        if (pendingMsgRef.current === incomingMessage) return;
        pendingMsgRef.current = incomingMessage;
        setPendingStats(statsFieldsKey ? statsFieldsKey.split(",") : []);
    }, [incomingMessage, statsFieldsKey]);

    // Banner-gone gate, keyed on the card's OWN local banner: a fresh banner
    // un-gates (so its later clear arms a new pulse); when the banner clears
    // (shown → hidden) a short beat opens the gate so the pulse plays just AFTER
    // it, never under the still-fading overlay.
    const [statsBannerGone, setStatsBannerGone] = useState(false);
    const prevBannerRef = useRef(bannerMessage);
    const beatTimerRef = useRef(null);
    useEffect(() => () => clearTimeout(beatTimerRef.current), []);
    useEffect(() => {
        const prev = prevBannerRef.current;
        prevBannerRef.current = bannerMessage;
        if (bannerMessage) {
            setStatsBannerGone(false);
            clearTimeout(beatTimerRef.current);
        } else if (prev && !bannerMessage) {
            clearTimeout(beatTimerRef.current);
            beatTimerRef.current = setTimeout(() => setStatsBannerGone(true), POST_BANNER_BEAT_MS);
        }
    }, [bannerMessage]);

    // Fire the one-shot pulse once the gate is open and the card is in view.
    const [pulsingStats, setPulsingStats] = useState(EMPTY_FIELD_SET);
    const statsArmedRef = useRef(false);
    const statsPulseTimerRef = useRef(null);
    useEffect(() => () => clearTimeout(statsPulseTimerRef.current), []);
    useEffect(() => {
        if (prefersReducedMotion || statsArmedRef.current) return;
        if (!statsBannerGone || !isInView || pendingStats.length === 0) return;
        statsArmedRef.current = true;
        // Snapshot the exact fields this pulse covers so the timer can tell
        // whether a newer update replaced them mid-window.
        const armedKey = pendingStats.join(",");
        setPulsingStats(new Set(pendingStats));
        statsPulseTimerRef.current = setTimeout(() => {
            setPulsingStats(EMPTY_FIELD_SET);
            statsArmedRef.current = false;
            // Clear pendingStats ONLY if it's still the set we just pulsed. If a
            // new pulseFields update landed during the window, the capture effect
            // already replaced pendingStats with different fields — clearing
            // unconditionally would wipe them and lose that change's heartbeat.
            // Leaving them intact lets the banner-gone gate re-arm once the new
            // change's banner clears (a fresh statsBannerGone edge re-runs this).
            setPendingStats((cur) => (cur.join(",") === armedKey ? [] : cur));
        }, HEARTBEAT_MS);
    }, [statsBannerGone, isInView, pendingStats, prefersReducedMotion]);

    const stats = [
        { label: "Total Stars Earned", value: data.stars, icon: Star, field: "stars", pulseOnComplete: true },
        { label: "Total Commits (last year)", value: data.commits, icon: Clock, field: "commits" },
        { label: "Total PRs", value: data.prs, icon: GitBranch, field: "prs" },
        { label: "Total Issues", value: data.issues, icon: AlertCircle, field: "issues" },
        { label: "Contributed to (last year)", value: data.contributedTo, icon: Package, field: "contributedTo" },
    ];

    return (
        <motion.div
            ref={cardRef}
            variants={cardVariants}
            initial="hidden"
            animate={settledInView ? "visible" : "hidden"}
            className="repo-card-breathe w-full p-6 relative overflow-hidden rounded-lg h-full"
            // Card padding + glow radius ride the factor (issue #25); the
            // p-6 rounded-lg utilities stay as the out-of-scope base.
            style={{ padding: fluid(1.5), borderRadius: fluid(0.5) }}
        >
            <UpdateBanner
                message={bannerMessage}
                visible={Boolean(bannerMessage) && settledInView}
                srPrefix="Stats update: "
            />

            {/* Header — title first, then the live-status meta line BELOW it,
                mirroring the adjacent "Most Used Languages" card's
                title-over-meta structure so the side-by-side pair reads as one
                system. The "Live GitHub Metrics" line (pulse dot + text) renders
                ONLY when the stats are genuinely live from GitHub (`isLive`); if
                the API is down or we're showing kept/snapshot data it's omitted
                entirely rather than asserting "live" over stale data. The title
                + icon always render. */}
            <motion.div variants={childVariants} className="mb-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Activity className="w-5 h-5 flex-shrink-0" style={{ color: AMBER }} />
                    <AnimatedTitle text={`${userName}'s GitHub Stats`} play={settledInView} />
                </div>
                {isLive && (
                    <div className="flex items-center gap-2 mt-1.5">
                        <motion.span
                            aria-hidden="true"
                            className="inline-block w-1.5 h-1.5 rounded-full"
                            style={{ background: ORANGE, boxShadow: `0 0 6px ${ORANGE}` }}
                            animate={prefersReducedMotion ? undefined : { opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }}
                            transition={prefersReducedMotion ? undefined : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        />
                        <span className="abt-micro text-[10px] uppercase tracking-[0.22em] text-fire-amber" style={{ textShadow: "none" }}>
                            Live GitHub Metrics
                        </span>
                    </div>
                )}
            </motion.div>

            {/* Animated hairline divider — fills from the left on entry. */}
            <motion.div
                aria-hidden="true"
                className="h-px elite-divider mb-4 origin-left"
                variants={{
                    hidden: { scaleX: 0, opacity: 0 },
                    visible: { scaleX: 1, opacity: 1, transition: { duration: 0.6, ease: "easeOut" } },
                }}
            />

            {/* Metric column + rank arc — column full-width on mobile (labels
                left, values right), side-by-side and centered at sm+. */}
            <motion.div
                variants={childVariants}
                className="flex flex-col items-center gap-4 sm:gap-6 sm:flex-row sm:flex-wrap sm:justify-center"
                style={{ gap: fluid(1.5) }}
            >
                <motion.div
                    variants={metricContainerVariants}
                    className="flex flex-col gap-1 w-full sm:w-auto sm:flex-1 sm:min-w-[220px]"
                >
                    {stats.map((stat) => (
                        <MetricRow
                            key={stat.label}
                            icon={stat.icon}
                            label={stat.label}
                            value={stat.value}
                            pulseOnComplete={stat.pulseOnComplete}
                            heartbeat={pulsingStats.has(stat.field)}
                            playToken={playToken}
                            prefersReducedMotion={prefersReducedMotion}
                        />
                    ))}
                </motion.div>

                <motion.div variants={childVariants} className="flex items-center justify-center flex-shrink-0">
                    <RankArc
                        level={data.level}
                        percentile={parseFloat(data.percentile)}
                        playToken={playToken}
                        prefersReducedMotion={prefersReducedMotion}
                    />
                </motion.div>
            </motion.div>
        </motion.div>
    );
}
