"use client";

import { animate, motion, useReducedMotion } from "framer-motion";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { UpdateBanner } from "./UpdateBanner";

import { useLanguagesUpdateSignal } from "@/hooks/useLanguagesUpdateSignal";
import { useStaggeredScrollReveal } from "@/hooks/useStaggeredScrollReveal";
import { useViewportCountTrigger } from "@/hooks/useViewportCountTrigger";
import { fastStartSlowFinish } from "@/utils/animationCurves";
import { onMediaChange } from "@/lib/mediaQuery";
import { fluid, fluidText } from "@/lib/fluidScale";

// Shared count-up window. Every row animates over the same duration with no
// per-row stagger so all percentages reach their targets *simultaneously*
// (issue #18) — the easing curve, not a stagger, supplies the visual
// interest (fast start, eased landing).
const COUNT_UP_DURATION = 2; // seconds
// How long the change banner lingers once the section scrolls into view.
const BANNER_AUTO_HIDE_MS = 4500;
// "Just changed" heartbeat window — 2000ms = exactly two 1s cycles of the
// shared `skill-heartbeat` animation, so the pulse always ends on its resting
// keyframe (no mid-dip snap when the class is removed). Same value + rationale
// as the Skills card's HEARTBEAT_MS.
const HEARTBEAT_MS = 2000;
// Stable empty Set so a language with no armed popover repos hands the popover a
// constant identity (the default never changes between renders).
const EMPTY_NAME_SET = new Set();

// ----- Card-level entrance choreography — mirrors the GitHub Stats card
// (StatsCard.jsx) 1:1 so the side-by-side pair animate IN identically: the card
// springs up (opacity/y/scale) and its sections cascade via `staggerChildren`,
// with the title typing in per character. Driven off `settledInView`, so the
// whole entrance REPLAYS on every true viewport re-entry.
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

// Row choreography — IDENTICAL to the GitHub Stats card's metric rows
// (Total Stars Earned, Total Commits, …): the list is a stagger container and
// each language row slides in from the left (x: -16 → 0) one after another.
// Because the list is itself a stagger child of the card, this cascade plays
// after the header + bar, and replays on every viewport entry.
const metricContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const metricRowVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

// Reduced-motion no-op: hidden === visible at the resting state with no tween,
// so the card simply appears (no spring, slide, or staggered replay) for users
// who've opted out of motion. Used in place of every variant set above when
// `prefers-reduced-motion` is set — mirroring AnimatedTitle's reduced path so
// the whole card honours the preference, not just the title.
const noMotionVariants = {
  hidden: { opacity: 1, x: 0, y: 0, scale: 1 },
  visible: { opacity: 1, x: 0, y: 0, scale: 1 },
};

/* Per-character blur-fade-in title — the exact treatment the GitHub Stats card
   uses, in the same vivid orange (#ff6d05) so the two headlines read as one
   system. Reduced motion renders a plain heading; the per-char spans are
   aria-hidden with an aria-label so the accessible name stays clean. */
function AnimatedTitle({ text, play }) {
  const prefersReducedMotion = useReducedMotion();
  // `abt-title` re-derives the size from --fluid-scale under the /about
  // fluid scope (issue #25); the utilities stay as the out-of-scope base.
  const className =
    "abt-title text-xl md:text-2xl text-left font-semibold mb-1 break-words leading-tight";

  if (prefersReducedMotion) {
    return (
      <h2 className={className} style={{ color: "#ff6d05", textShadow: "none" }}>
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
    </motion.h2>
  );
}

export default function LanguagesCard({ data, isLive = false }) {
  const cardRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  // Entry-cycle trigger: increments once per *true* viewport entry and is
  // immune to the rapid in/out IntersectionObserver flicker that made the
  // old `useInView`-driven count-up restart mid-scroll (issue #16/17 bug
  // class). Children animate on `playToken`, not raw visibility.
  const { isInView, playToken, settledInView } = useViewportCountTrigger(cardRef, {
    amount: 0.3,
    margin: "-50px",
  });

  // Honour reduced motion across the whole entrance: swap every animated variant
  // set for the resting no-op so nothing springs, slides, or re-plays on
  // re-entry for users who opted out (AnimatedTitle already takes its own
  // reduced path). The count-ups handle reduced motion separately.
  const cardV = prefersReducedMotion ? noMotionVariants : cardVariants;
  const childV = prefersReducedMotion ? noMotionVariants : childVariants;
  const listContainerV = prefersReducedMotion
    ? noMotionVariants
    : metricContainerVariants;
  const rowV = prefersReducedMotion ? noMotionVariants : metricRowVariants;

  const languages = Array.isArray(data) ? data : [];
  // Denominator for the stacked bar. The normalized list sums to ~100, but
  // guard against a 0 total (empty list) so segment widths never divide by
  // zero. `|| 1` keeps the math finite; an empty list renders no segments.
  const total =
    languages.reduce((sum, l) => sum + parseFloat(l.percentage || 0), 0) || 1;

  // Two-way spotlight link between the list and the stacked bar. Hovering
  // (or keyboard-focusing) a row, or hovering a bar segment, sets the active
  // index; every *other* row + segment dims so the active language reads as
  // a measured highlight rather than a flat list. `null` = nothing active.
  const [activeIndex, setActiveIndex] = useState(null);

  // Per-language repo-breakdown popover. `popover` holds the active language
  // index, the anchor row's viewport rect (the portal uses it for fixed
  // positioning, escaping this card's `overflow-hidden`), and the interaction
  // `mode`:
  //   - "hover" — opened by a fine pointer hovering or by keyboard focus.
  //     Closes on leave/blur (with a short grace delay so the pointer can
  //     cross the gap into the popover to reach the repo links).
  //   - "tap"   — opened by a tap on a touch device. Sticky: stays open until
  //     a tap outside, a tap on another row, a re-tap of the same row, or
  //     Escape. Ignores leave/blur so a tap doesn't immediately dismiss it.
  const [popover, setPopover] = useState(null);
  const closeTimerRef = useRef(null);

  // Hover capability — true only for a fine pointer that can hover (desktop
  // mouse, or a tablet/phone with a trackpad). On a touch-only phone/tablet
  // this is false, so the card switches to tap-to-open. Same media query the
  // 404 page uses to gate its pointer affordances.
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHover(mql.matches);
    update();
    return onMediaChange(mql, update);
  }, []);

  // Whether the two-column list is active (`xl`+ / ≥1280px — Tailwind's `xl`).
  // Below it the list renders only its top 5 rows (rows 6–10 are `hidden
  // xl:block`); at `xl`+ every rendered row shows. The meta-line count keys off
  // this so it always reflects the rows ACTUALLY visible, not the full payload
  // length — otherwise mobile shows 5 rows under a "6 languages" (or "10") label.
  // Starts `false` (mobile-first, matching the SSR markup) and corrects on mount,
  // exactly like `canHover` above, so there's no hydration mismatch.
  const [isWideList, setIsWideList] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1280px)");
    const update = () => setIsWideList(mql.matches);
    update();
    return onMediaChange(mql, update);
  }, []);

  // Last-input modality. A keyboard attached to a touch device has no hover
  // pointer, so focus-driven opening can't key off `canHover`; instead we
  // track whether the most recent interaction was the keyboard (Tab) and, if
  // so, treat focus like hover — satisfying "keyboard attached → hover
  // behaviour" even on a phone/tablet.
  const keyboardModalityRef = useRef(false);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Tab") keyboardModalityRef.current = true;
    };
    const onPointer = () => {
      keyboardModalityRef.current = false;
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("touchstart", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("touchstart", onPointer, true);
    };
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const hasBreakdown = useCallback(
    (index) => {
      const lang = languages[index];
      // Stale/snapshot payloads (and the bundled fallback) carry no per-repo
      // breakdown — skip the popover rather than show an empty panel. A
      // language used ONLY in private repos has an empty public list but a
      // private aggregate (`privateRepos.count`), and still gets its popover.
      if (!lang) return false;
      return (
        (Array.isArray(lang.repos) && lang.repos.length > 0) ||
        (lang.privateRepos?.count ?? 0) > 0
      );
    },
    [languages],
  );

  // Open in "hover" mode (fine-pointer hover or keyboard focus).
  const openHover = useCallback(
    (index, anchorEl) => {
      cancelClose();
      if (!hasBreakdown(index)) return;
      setPopover({ index, rect: anchorEl.getBoundingClientRect(), mode: "hover" });
    },
    [cancelClose, hasBreakdown],
  );

  // Toggle in "tap" mode (touch). Re-tapping the open row closes it.
  const toggleTap = useCallback(
    (index, anchorEl) => {
      cancelClose();
      if (!hasBreakdown(index)) {
        setPopover(null);
        return;
      }
      setPopover((cur) =>
        cur && cur.index === index && cur.mode === "tap"
          ? null
          : { index, rect: anchorEl.getBoundingClientRect(), mode: "tap" },
      );
    },
    [cancelClose, hasBreakdown],
  );

  // Grace-delayed close that only dismisses a HOVER popover — a tap popover
  // is sticky and ignores leave/blur, so this is a no-op for it.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setPopover((cur) => (cur && cur.mode === "tap" ? cur : null));
    }, 140);
  }, [cancelClose]);

  // Per-row handlers (mode-gated). Hover/leave only act with a fine pointer;
  // focus opens only when the keyboard drove it; tap toggles only without
  // hover. This is what makes touch → tap, keyboard → hover, mouse → hover.
  const handleRowEnter = useCallback(
    (index, el) => {
      if (canHover) openHover(index, el);
    },
    [canHover, openHover],
  );
  const handleRowFocus = useCallback(
    (index, el) => {
      if (keyboardModalityRef.current) openHover(index, el);
    },
    [openHover],
  );
  const handleRowTap = useCallback(
    (index, el) => {
      if (!canHover) toggleTap(index, el);
    },
    [canHover, toggleTap],
  );

  // While a TAP popover is open, a pointerdown anywhere outside it (and
  // outside any language row, whose own tap handles toggling) dismisses it.
  useEffect(() => {
    if (!popover || popover.mode !== "tap") return undefined;
    const onDown = (e) => {
      const t = e.target;
      if (
        t?.closest &&
        (t.closest("[data-lang-popover]") || t.closest("[data-lang-row]"))
      ) {
        return;
      }
      setPopover(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [popover]);

  // Close on page scroll / resize / Escape — the anchor rect is captured once,
  // so any layout shift would leave the panel floating. A scroll *inside* the
  // popover's own repo list must NOT close it (that's the overflow-scroll the
  // popover relies on), so scrolls originating within it are ignored.
  useEffect(() => {
    if (!popover) return undefined;
    const onScroll = (e) => {
      const t = e.target;
      if (t?.closest && t.closest("[data-lang-popover]")) return;
      setPopover(null);
    };
    const onResize = () => setPopover(null);
    const onKey = (e) => {
      if (e.key === "Escape") setPopover(null);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [popover]);

  // Clear any pending close timer on unmount.
  useEffect(() => () => cancelClose(), [cancelClose]);

  // Change-aware banner. The hook surfaces a contextual message only when
  // the language stats actually changed since this device last saw them;
  // we hold it back until the section is in view, then show + auto-hide. It
  // also surfaces which language ROWS rose (moved up / % increased) and which
  // popover REPOS rose, so we can heartbeat exactly those after the banner.
  const {
    pendingMessage,
    consume,
    changedLanguages,
    changedRepoKeys,
    clearChangedLanguage,
    clearChangedRepo,
  } = useLanguagesUpdateSignal(languages);
  const [bannerMessage, setBannerMessage] = useState(null);
  // True from the moment the banner's message clears until its exit animation
  // has fully finished (UpdateBanner.onExitComplete). The row heartbeat is gated
  // through this so a pulse never plays under the banner's still-fading blur
  // overlay — same guard the Skills card uses (`bannerExiting`).
  const [bannerExiting, setBannerExiting] = useState(false);

  // Promote the pending message to a visible banner once the section is in
  // view, then `consume()` it from the hook so a reload before the next
  // change doesn't replay it. Crucially this effect does NOT own the
  // auto-hide timer: `consume()` nulls `pendingMessage` (a dependency here),
  // which re-runs this effect — so a timer set inside it would be cleared by
  // the re-run's cleanup before it could fire, leaving the banner stuck on
  // screen until a manual refresh. The hide timer lives in its own effect
  // below, keyed on `bannerMessage`, mirroring the experience banner's
  // `shown`-keyed timer.
  useEffect(() => {
    if (!pendingMessage || !isInView) return;
    setBannerMessage(pendingMessage);
    consume();
  }, [pendingMessage, isInView, consume]);

  // Auto-hide once a banner is actually showing. Keyed on `bannerMessage`
  // (not `pendingMessage`), so consuming the pending message can't cancel
  // this timer; a fresh message re-arms it cleanly. On hide we flip
  // `bannerExiting` true so the row heartbeat stays gated until the overlay has
  // fully animated out (cleared by UpdateBanner's onExitComplete below).
  useEffect(() => {
    if (!bannerMessage) return;
    const timer = setTimeout(() => {
      setBannerMessage(null);
      setBannerExiting(true);
    }, BANNER_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [bannerMessage]);

  // The card is clear for the post-banner heartbeat only once no message is
  // pending or showing AND the overlay has finished exiting.
  const bannerGone = !bannerMessage && !pendingMessage && !bannerExiting;

  // ── Language-row heartbeat ──────────────────────────────────────────────────
  // Pulse the name + percentage of every language that rose, once the section is
  // in view and the banner is gone. One-shot per change cycle: `clearChangedLanguage`
  // consumes each name after its window so a later viewport re-entry doesn't
  // replay it, while a genuinely new change cycle re-arms cleanly. `langPulsingRef`
  // guards against re-entering mid-window (e.g. a fresh change arriving while a
  // pulse is still running — its names simply pulse in the next window).
  const [pulsingLanguages, setPulsingLanguages] = useState(EMPTY_NAME_SET);
  const langPulsingRef = useRef(false);
  const langTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(langTimerRef.current), []);
  useEffect(() => {
    if (prefersReducedMotion || langPulsingRef.current) return;
    if (!isInView || !bannerGone || changedLanguages.length === 0) return;
    const names = changedLanguages.slice();
    langPulsingRef.current = true;
    setPulsingLanguages(new Set(names));
    langTimerRef.current = setTimeout(() => {
      setPulsingLanguages(EMPTY_NAME_SET);
      names.forEach((n) => clearChangedLanguage(n));
      langPulsingRef.current = false;
    }, HEARTBEAT_MS);
  }, [
    changedLanguages,
    isInView,
    bannerGone,
    prefersReducedMotion,
    clearChangedLanguage,
  ]);

  // ── Popover repo heartbeat ──────────────────────────────────────────────────
  // The repo rows that rose for the CURRENTLY-open language, keyed back to bare
  // repo names. Handed to the popover, which pulses them on open (the "survives
  // until seen" model — a repo-breakdown is on-demand, so the beat plays the
  // first time the user opens that language's popover after the change).
  // Count shown in the meta line — the number of language rows the current
  // viewport actually renders, not the full payload. The list renders at most
  // 10 rows (`slice(0, 10)`); below `xl` only the top 5 are visible, at `xl`+ all
  // rendered rows show. Kept in lock-step with the list's own slice + responsive
  // hiding so the label can never claim more languages than are on screen.
  const visibleLanguageCount = isWideList
    ? Math.min(languages.length, 10)
    : Math.min(languages.length, 5);

  const activeLang = popover ? languages[popover.index] : null;
  const popoverPulseNames = useMemo(() => {
    if (!activeLang) return EMPTY_NAME_SET;
    const prefix = `${activeLang.language}::`;
    const names = changedRepoKeys
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
    return names.length > 0 ? new Set(names) : EMPTY_NAME_SET;
  }, [activeLang, changedRepoKeys]);

  return (
    <motion.div
      ref={cardRef}
      // Entrance choreography is the GitHub Stats card's, 1:1 (`cardVariants` +
      // `childVariants` + the per-char title). Driven off `settledInView` —
      // debounced and flicker-immune like `playToken` (the parent ItemLayout's
      // scale 0 → 1 entry wobbles this card's observer rect, which raw
      // `isInView` would replay as a glitch), but REVERSIBLE: it flips false
      // after a sustained exit so the whole entrance REPLAYS on every true
      // re-entry instead of firing once. Count-ups still replay via `playToken`.
      variants={cardV}
      initial="hidden"
      animate={settledInView ? "visible" : "hidden"}
      // Border + glow parity with the "Years in the craft" card: the outer
      // `custom-bg-abt` amber border comes from the `!p-0` ItemLayout
      // wrapper (index.jsx), and this inner `repo-card-breathe rounded-lg`
      // layer adds the same baseline + breathing orange glow on the rounded
      // perimeter — identical structure to the years card's inner div.
      className="repo-card-breathe rounded-lg p-6 w-full relative overflow-hidden h-full"
      // Card padding + glow radius ride the factor (issue #25); the p-6
      // rounded-lg utilities stay as the out-of-scope base.
      style={{ padding: fluid(1.5), borderRadius: fluid(0.5) }}
    >
      <UpdateBanner
        message={bannerMessage}
        visible={Boolean(bannerMessage)}
        srPrefix="Languages update: "
        variant="elite"
        onExitComplete={() => setBannerExiting(false)}
      />

      {/* Header — title + an analytics-style meta line. */}
      <motion.div variants={childV} className="mb-5">
        {/* Title — per-character blur-in in vivid orange (#ff6d05), the exact
            treatment + hue the "… GitHub Stats" card uses, so the side-by-side
            pair share one headline animation and colour. */}
        <AnimatedTitle text="Most Used Languages" play={settledInView} />
        {/* Meta line — frames the card as a live data widget. Count is
            pluralised; the "· live from GitHub" suffix (with a pulsing dot
            matching the GitHub Stats card's "Live GitHub Metrics" indicator) is
            shown only when `isLive` (the displayed languages came from a genuine
            live fetch). On a languages-GraphQL timeout the card keeps showing the
            last-good / snapshot list, and the suffix is dropped so it never
            claims "live" over stale data — it returns the moment a live
            fetch succeeds again. */}
        <p
          className="abt-micro-md flex items-center gap-1.5 text-[10px] md:text-xs uppercase tracking-[0.18em]"
          style={{ color: "rgba(255, 170, 42, 0.6)", textShadow: "none" }}
        >
          <span>
            {visibleLanguageCount}{" "}
            {visibleLanguageCount === 1 ? "language" : "languages"}
          </span>
          {isLive && (
            <>
              <span aria-hidden="true">·</span>
              {/* Pulsing live dot — same keyframes, loop, and reduced-motion
                  handling as StatsCard's "Live GitHub Metrics" dot. */}
              <motion.span
                aria-hidden="true"
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: "#ff6d05", boxShadow: "0 0 6px #ff6d05" }}
                animate={
                  prefersReducedMotion
                    ? undefined
                    : { opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }
                }
                transition={
                  prefersReducedMotion
                    ? undefined
                    : { duration: 2, repeat: Infinity, ease: "easeInOut" }
                }
              />
              <span>live from GitHub</span>
            </>
          )}
        </p>
      </motion.div>

      {/* Combined horizontal stacked bar — decorative; the list below
          carries the same data accessibly. `relative` anchors the one-shot
          sheen overlay; per-segment right borders draw crisp dividers
          between colours without changing layout width (border-box). */}
      <motion.div
        variants={childV}
        aria-hidden="true"
        className="relative w-full h-2 md:h-3 rounded-full overflow-hidden flex mb-5 bg-gray-700/30"
        // Fluid bar: 0.75rem = the md:h-3 anchor. No floor — the track can
        // thin all the way down with the card (it's decorative; the list
        // below carries the data).
        style={{ height: fluid(0.75), marginBottom: fluid(1.25) }}
      >
        {languages.map((lang, idx) => (
          <AnimatedBarSegment
            key={lang.language ?? idx}
            lang={lang}
            total={total}
            playToken={playToken}
            prefersReducedMotion={prefersReducedMotion}
            showDivider={idx < languages.length - 1}
            dimmed={activeIndex !== null && activeIndex !== idx}
            onActivate={() => setActiveIndex(idx)}
            onDeactivate={() => setActiveIndex(null)}
          />
        ))}
        {/* One-shot light sweep on entry. Keyed on `playToken` so it
            remounts (and replays) on each true viewport entry; skipped
            entirely for reduced-motion users. */}
        {playToken > 0 && !prefersReducedMotion && (
          <span key={playToken} className="lang-bar-sheen" aria-hidden="true" />
        )}
      </motion.div>

      {/* Language list — a single column on mobile AND tablet (incl. iPad-
          landscape at `lg`/1024, where this card is already half-width beside
          the stats card, so each row keeps the full card width and the language
          name is never cramped). Two columns kick in only at `xl`+ (≥1280),
          where the half-width card is finally wide enough to fit two names —
          even the longest ("JavaScript", "Dockerfile") plus their percentage —
          side-by-side without truncating. The list drops to `text-sm` at `xl`
          to match those tighter two-column cells; `gap-x-6` keeps a name and
          its percentage from colliding across the column gutter. */}
      {/* Up to 10 rows are rendered, but rows 6–10 (index ≥ 5) are hidden below
          `xl` via `hiddenUntilXl`. Net effect: the single-column view (mobile →
          lg) shows the top 5 languages, and the two-column view (`xl`+) shows
          all 10 — matching the wider canvas to a fuller list. The decorative
          proportion bar above still reflects every language, so it stays a
          complete overview regardless of how many rows are listed. */}
      <motion.ul
        variants={listContainerV}
        className="grid grid-cols-1 xl:grid-cols-2 gap-y-3 gap-x-6 pt-2 text-sm md:text-base xl:text-sm"
        // 0.875rem = the xl:text-sm value in force at the 1440 anchor (the
        // two-column view). The single fluid size replaces the sm→base→sm
        // zig-zag; the xl: column switch itself stays structural.
        style={{ fontSize: fluidText(0.875, 0.75) }}
      >
        {languages.slice(0, 10).map((lang, idx) => (
          <AnimatedLangLabel
            key={lang.language ?? idx}
            lang={lang}
            rank={idx + 1}
            isPrimary={idx === 0}
            hiddenUntilXl={idx >= 5}
            variants={rowV}
            playToken={playToken}
            prefersReducedMotion={prefersReducedMotion}
            active={activeIndex === idx}
            dimmed={activeIndex !== null && activeIndex !== idx}
            pulse={pulsingLanguages.has(lang.language)}
            onActivate={() => setActiveIndex(idx)}
            onDeactivate={() => setActiveIndex(null)}
            onRepoEnter={(el) => handleRowEnter(idx, el)}
            onRepoFocus={(el) => handleRowFocus(idx, el)}
            onRepoTap={(el) => handleRowTap(idx, el)}
            onRepoClose={scheduleClose}
          />
        ))}
      </motion.ul>

      {/* Repo-breakdown popover — portaled to <body> so it escapes the card's
          `overflow-hidden`. Rendered only while a row with a known breakdown
          is hovered/focused. */}
      {popover && languages[popover.index] && (
        <LanguageRepoPopover
          // Key by language so switching the popover from one language's
          // breakdown straight to another's (without it closing in between)
          // REMOUNTS it: a fresh visible-gated heartbeat fires for the new
          // language's risen repos, and the previous instance's pulse timer is
          // torn down with it. Without the key the popover would update in place
          // — its mount-captured pulse refs would stay on the first language and
          // the `pos`-change cleanup would cancel the running beat.
          key={languages[popover.index].language}
          lang={languages[popover.index]}
          anchorRect={popover.rect}
          prefersReducedMotion={prefersReducedMotion}
          // Repo rows that rose for this language → pulsed on open, then consumed
          // so the beat plays only the first time this popover is opened after
          // the change.
          pulseRepoNames={popoverPulseNames}
          onRepoPulsed={(name) =>
            clearChangedRepo(`${languages[popover.index].language}::${name}`)
          }
          // The pointer bridge only matters in hover mode; scheduleClose is a
          // no-op for a sticky tap popover, so the same handlers are safe for
          // both. cancelClose keeps a hover popover alive while the pointer is
          // over it (so its repo links stay reachable).
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
        />
      )}
    </motion.div>
  );
}

/* Animated stacked-bar segment. Width drives directly off the DOM node
   (no per-frame React re-render) and animates 0 → target on each viewport
   entry cycle with the fast-then-slow curve. The dim/highlight state IS
   React-controlled (opacity/filter), which is safe alongside the ref-driven
   width: React diffs `style` per-property, and `width: 0` never changes
   between renders, so a re-render for the dim state leaves the animated
   width untouched. */
function AnimatedBarSegment({
  lang,
  total,
  playToken,
  prefersReducedMotion,
  showDivider,
  dimmed,
  onActivate,
  onDeactivate,
}) {
  const ref = useRef(null);
  const target = (parseFloat(lang.percentage || 0) / total) * 100;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion) {
      node.style.width = `${target}%`;
      return;
    }
    if (playToken === 0) {
      // Not yet entered the viewport — sit at 0 so the first entry has a
      // full 0 → target sweep to play.
      node.style.width = "0%";
      return;
    }
    const controls = animate(0, target, {
      duration: COUNT_UP_DURATION,
      ease: fastStartSlowFinish,
      onUpdate: (v) => {
        node.style.width = `${v}%`;
      },
    });
    return () => controls.stop();
  }, [playToken, target, prefersReducedMotion]);

  return (
    <span
      ref={ref}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      className="h-full block flex-shrink-0 cursor-pointer"
      style={{
        width: 0,
        backgroundColor: lang.color,
        boxShadow: `0 0 6px ${lang.color}`,
        // Crisp divider between colours. border-box (Tailwind default) keeps
        // the border *inside* the animated width, so it reads as a thin gap
        // without pushing the sum past 100% and clipping the last segment.
        borderRight: showDivider ? "1.5px solid rgba(1, 5, 11, 0.55)" : undefined,
        opacity: dimmed ? 0.3 : 1,
        filter: dimmed ? "saturate(0.5)" : "none",
        transition: "opacity 0.25s ease, filter 0.25s ease",
      }}
    />
  );
}

/* Animated language row: rank index, colour dot, name, optional PRIMARY tag,
   and a count-up percentage. The number animates via `textContent` on a ref
   (matching the about page's PercentCount/Counter pattern) so the 0 → target
   tween doesn't trigger a React re-render every frame. The row is focusable
   so keyboard users get the same spotlight as hover; the dim/active styling
   is React-controlled and, like the bar, doesn't disturb the ref-driven
   number (the `"0.00"` child is a stable literal React never re-writes). */
function AnimatedLangLabel({
  lang,
  rank,
  isPrimary,
  hiddenUntilXl = false,
  variants,
  playToken,
  prefersReducedMotion,
  active,
  dimmed,
  pulse = false,
  onActivate,
  onDeactivate,
  onRepoEnter,
  onRepoFocus,
  onRepoTap,
  onRepoClose,
}) {
  const numRef = useRef(null);
  const target = parseFloat(lang.percentage || 0);
  // Popover affordance (cursor + aria-haspopup) — mirrors the parent's
  // hasBreakdown: public repo rows OR a private-usage aggregate both mean
  // there's a breakdown to show.
  const hasRepos =
    (Array.isArray(lang.repos) && lang.repos.length > 0) ||
    (lang.privateRepos?.count ?? 0) > 0;
  // "Just rose" heartbeat — pulse the name + percentage together when this
  // language moved up / increased. CSS no-ops `.skill-heartbeat` under reduced
  // motion, but gate the class too for parity with the rest of the page.
  const pulseClass = pulse && !prefersReducedMotion ? " skill-heartbeat" : "";

  useEffect(() => {
    const node = numRef.current;
    if (!node) return;
    if (prefersReducedMotion) {
      node.textContent = target.toFixed(2);
      return;
    }
    if (playToken === 0) {
      node.textContent = "0.00";
      return;
    }
    const controls = animate(0, target, {
      duration: COUNT_UP_DURATION,
      ease: fastStartSlowFinish,
      onUpdate: (v) => {
        node.textContent = v.toFixed(2);
      },
    });
    return () => controls.stop();
  }, [playToken, target, prefersReducedMotion]);

  return (
    // Two layers, deliberately separated so two animation systems don't fight
    // over the same CSS properties:
    //   • <motion.li> owns the ENTRANCE — framer animates opacity + x (-16 → 0)
    //     via `variants` (the metric-row slide-in, staggered by the parent ul).
    //     It's the grid cell, so `hiddenUntilXl` toggles its display.
    //   • the inner <div> owns the INTERACTION — the hover/focus spotlight's
    //     React-controlled `opacity` (dim) + `transform` (nudge). Keeping these
    //     off the motion.li avoids clobbering framer's entrance transform/opacity
    //     (and vice-versa); the two opacities simply compose.
    <motion.li
      variants={variants}
      className={hiddenUntilXl ? "hidden xl:block" : "block"}
    >
      <div
        tabIndex={0}
        data-lang-row=""
        // The whole row is the popover trigger, so the name OR the percentage
        // activates it; the same handlers still drive the bar spotlight.
        // `currentTarget` (this div) is the positioning anchor. Open/close is
        // mode-gated in the parent: hover/leave act only with a fine pointer,
        // focus opens only when the keyboard drove it, and tap toggles only on
        // touch — so touch → tap, keyboard → hover/focus, mouse → hover.
        onMouseEnter={(e) => {
          onActivate();
          onRepoEnter?.(e.currentTarget);
        }}
        onMouseLeave={() => {
          onDeactivate();
          onRepoClose?.();
        }}
        onFocus={(e) => {
          onActivate();
          onRepoFocus?.(e.currentTarget);
        }}
        onBlur={(e) => {
          // Clear the spotlight whenever focus leaves the row (mirrors the
          // pointer path's onMouseLeave). But only schedule the popover CLOSE
          // when focus isn't moving INTO the popover — Tab from the row lands on
          // a repo link in the body-portaled panel (matched by its data attr,
          // not DOM ancestry), and closing then would dismiss those links before
          // they're reachable. The popover closes itself once focus leaves it.
          onDeactivate();
          if (e.relatedTarget?.closest?.("[data-lang-popover]")) return;
          onRepoClose?.();
        }}
        onClick={(e) => onRepoTap?.(e.currentTarget)}
        aria-haspopup={hasRepos ? "true" : undefined}
        className={`group flex items-center gap-2 min-w-0 rounded-md outline-none transition-[opacity,transform] duration-200 ${
          hasRepos ? "cursor-pointer" : ""
        }`}
        style={{
          opacity: dimmed ? 0.4 : 1,
          transform: active ? "translateX(2px)" : "none",
        }}
      >
      {/* Rank index — monospaced, dim, fixed-width so the dots/names align
          into a clean column. Reads like an analytics leaderboard. */}
      {/* Rank index — hidden at `xl`+, where the list splits into two tighter
          columns and every pixel counts toward showing the full language name
          (esp. the #1 row, whose "Primary" pill already eats width). The colour
          dot + descending percentages still convey order there. Shown at all
          smaller widths, where the single full-width column has room to spare. */}
      <span
        aria-hidden="true"
        className="abt-micro-md font-mono tabular-nums text-[10px] md:text-xs select-none w-5 shrink-0 xl:hidden"
        style={{ color: "rgba(255, 170, 42, 0.45)", textShadow: "none" }}
      >
        {String(rank).padStart(2, "0")}
      </span>
      <span
        aria-hidden="true"
        className="w-3 h-3 rounded-full shrink-0"
        style={{
          backgroundColor: lang.color,
          boxShadow: `0 0 4px ${lang.color}`,
          transform: active ? "scale(1.25)" : "none",
          transition: "transform 0.2s ease",
        }}
      />
      {/* Language name — fire-amber gradient, matching the "Personal" /
          "Employment" labels in the Years-in-the-craft split bar. */}
      <span className={`text-fire-amber truncate${pulseClass}`}>{lang.language}</span>
      {/* PRIMARY tag on the dominant language — a restrained amber pill that
          marks the headline figure without competing with the percentage.
          Hidden at `xl`+ (the two-column view), where it would otherwise push
          the longest name ("JavaScript") into truncation; the #1 row already
          reads as primary there (top of the list, largest percentage). The
          badge stays on every single-column width, which all have room. */}
      {isPrimary && (
        <span
          aria-hidden="true"
          className="ml-1 shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wider xl:hidden"
          style={{
            color: "#ffd27d",
            background: "rgba(255, 170, 42, 0.08)",
            border: "1px solid rgba(255, 170, 42, 0.4)",
            textShadow: "none",
          }}
        >
          Primary
        </span>
      )}
      {/* Percentage — flat vivid orange, normal weight + tabular-nums,
          matching the Personal/Employment numbers in the Years-in-the-craft
          split bar (size unchanged — inherited from the list). */}
      <span
        className={`ml-auto tabular-nums shrink-0${pulseClass}`}
        style={{ color: "#ff6d05", textShadow: "none" }}
      >
        <span ref={numRef}>{prefersReducedMotion ? target.toFixed(2) : "0.00"}</span>%
      </span>
      </div>
    </motion.li>
  );
}

// ── Repo-breakdown popover reveal — the SAME whole-card entrance the Skills
// card's "Used in repositories" popover uses (itself the Most Active Repository
// card's reveal): the panel springs up as a unit (opacity + y + scale), then the
// header block slides up and the repo rows slide in from the left, staggered.
// Same spring constants + metric-row slide as the cards, 1:1; only the panel's
// travel is a smaller 24px because it's a compact floating panel.
const popoverPanelVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 70, damping: 18, delayChildren: 0.1, staggerChildren: 0.07 },
  },
};
// Orchestrates the inner cascade: the header block, then the repo list.
const popoverContentVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};
// The header block (eyebrow + title + divider) slides up as one unit.
const popoverSectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 20 } },
};
// (Repo rows reveal imperatively via useStaggeredScrollReveal + the
// `repo-row-reveal` keyframe — see the list below — so they can RE-PLAY on every
// scroll into the list's own viewport with a real one-by-one stagger, which the
// declarative variant path can't do from inside the panel's animation tree.)
// Reduced-motion no-op for every variant above: hidden === visible, no transform.
const popoverNoMotion = {
  hidden: { opacity: 1, x: 0, y: 0, scale: 1 },
  visible: { opacity: 1, x: 0, y: 0, scale: 1 },
};

/* Repo-breakdown popover for one language. Themed to match the "Career
   snapshot" experience modal: `custom-bg-abt` amber-bordered panel, inner
   `repo-card-breathe` glow, amber eyebrow + orange title, `elite-divider`.
   Portaled to <body> with fixed positioning so it escapes the card's
   `overflow-hidden`; self-positions beside the anchor row and flips / clamps
   to stay on-screen. Lists each repo that uses the language with the repo's
   share of that language's bytes (the shares sum to ~100% within the
   language). Rendered hidden until measured so it never flashes at its
   pre-positioned coordinates. */
function LanguageRepoPopover({
  lang,
  anchorRect,
  prefersReducedMotion,
  pulseRepoNames = EMPTY_NAME_SET,
  onRepoPulsed,
  onPointerEnter,
  onPointerLeave,
}) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  // The repo list scrolls internally when it overflows; this ref is the
  // IntersectionObserver root so each row's reveal RE-TRIGGERS as it scrolls into
  // the list's own viewport (down to the bottom and back to the top), per row.
  const listScrollRef = useRef(null);
  const panelV = prefersReducedMotion ? popoverNoMotion : popoverPanelVariants;
  const contentV = prefersReducedMotion ? popoverNoMotion : popoverContentVariants;
  const sectionV = prefersReducedMotion ? popoverNoMotion : popoverSectionVariants;

  // "Just rose" heartbeat for repo rows. The popover remounts on every open
  // (it's conditionally rendered) and fires the pulse for any language with
  // armed repos: pulse the matching rows for one window, then `onRepoPulsed`
  // consumes each so a reopen doesn't replay them. Closing mid-window unmounts
  // this and skips the consume, leaving the repos armed for the next open
  // ("survives until seen").
  //
  // The pulse — and its HEARTBEAT_MS countdown — starts only once the popover is
  // actually VISIBLE to the user: the panel renders `visibility: hidden` while
  // the layout effect below measures and positions it, and flips to visible only
  // once `pos` is set. Gating the start on `pos` (not raw mount) means the full
  // window plays from the moment the panel appears, rather than part of it
  // burning while the panel is still hidden off-screen. Fires once per open
  // (`repoPulseFiredRef`). Props are read through refs — kept in sync below — so
  // a parent re-render (a fresh `onRepoPulsed` closure, or an updated
  // `pulseRepoNames` when a new diff lands while the popover is open) can't
  // restart or cancel the running timer, while the one-shot still reads the
  // LATEST names at the moment it fires rather than a mount-time snapshot.
  const [pulsingRepos, setPulsingRepos] = useState(EMPTY_NAME_SET);
  const pulseNamesRef = useRef(pulseRepoNames);
  useEffect(() => {
    pulseNamesRef.current = pulseRepoNames;
  }, [pulseRepoNames]);
  const onRepoPulsedRef = useRef(onRepoPulsed);
  useEffect(() => {
    onRepoPulsedRef.current = onRepoPulsed;
  }, [onRepoPulsed]);
  const repoPulseFiredRef = useRef(false);
  useEffect(() => {
    if (prefersReducedMotion || !pos || repoPulseFiredRef.current) return undefined;
    const names = pulseNamesRef.current;
    if (!names || names.size === 0) return undefined;
    repoPulseFiredRef.current = true;
    setPulsingRepos(new Set(names));
    const t = setTimeout(() => {
      setPulsingRepos(EMPTY_NAME_SET);
      names.forEach((name) => onRepoPulsedRef.current?.(name));
    }, HEARTBEAT_MS);
    return () => clearTimeout(t);
  }, [pos, prefersReducedMotion]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchorRect) return;
    const MARGIN = 8;
    const GAP = 12;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Prefer to the right of the row; flip to the left if it would overflow;
    // pin to the right edge as a last resort on very narrow viewports.
    let left = anchorRect.right + GAP;
    if (left + w > vw - MARGIN) left = anchorRect.left - GAP - w;
    if (left < MARGIN) left = Math.max(MARGIN, vw - w - MARGIN);
    // Vertically centre on the row, clamped into the viewport.
    let top = anchorRect.top + anchorRect.height / 2 - h / 2;
    top = Math.min(Math.max(MARGIN, top), vh - h - MARGIN);
    setPos({ left, top });
  }, [anchorRect]);

  const repos = Array.isArray(lang.repos) ? lang.repos : [];
  // Private usage arrives as a bare COUNT plus the COMBINED share of this
  // language's bytes those repos contribute (names are withheld server-side —
  // the payload is public and CDN-cached; same model as the Skills popover's
  // `privateRepoCount`). Renders as one aggregate row PINNED ABOVE the public
  // repo rows.
  const privateCount =
    Number.isFinite(lang.privateRepos?.count) && lang.privateRepos.count > 0
      ? lang.privateRepos.count
      : 0;
  const privatePercentage = privateCount > 0 ? lang.privateRepos.percentage : 0;

  // Staggered, replay-on-scroll reveal for the internal repo list (gated on
  // `pos` so it doesn't fire while the panel is still positioning off-screen).
  useStaggeredScrollReveal(listScrollRef, {
    enabled: Boolean(pos),
    prefersReducedMotion,
    // Rendered ROW count (the private aggregate row + public rows), so the
    // observer re-registers if the row set ever changes in place.
    resetKey: repos.length + (privateCount > 0 ? 1 : 0),
  });

  return createPortal(
    // Panel springs up as a unit, gated on `pos` so the reveal begins the instant
    // it's positioned. Positioning is measured via offsetWidth/offsetHeight
    // (unaffected by transform); `left`/`top`/`visibility` stay on the inline style.
    <motion.div
      ref={ref}
      variants={panelV}
      initial="hidden"
      animate={pos ? "visible" : "hidden"}
      role="group"
      aria-label={`Repositories using ${lang.language}`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      // Keyboard equivalents of pointer enter/leave (React onFocus/onBlur bubble
      // from the repo links inside). Focus entering the panel cancels any pending
      // close; focus leaving it closes — UNLESS it lands back on the panel
      // (tabbing between repo links) or on a language row (the trigger, or
      // another row that opens its own), so the links stay reachable by keyboard.
      onFocus={onPointerEnter}
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (
          next &&
          (next.closest?.("[data-lang-popover]") ||
            next.closest?.("[data-lang-row]"))
        ) {
          return;
        }
        onPointerLeave?.();
      }}
      data-lang-popover=""
      className="custom-bg-abt rounded-xl flex flex-col"
      style={{
        position: "fixed",
        left: pos ? pos.left : -9999,
        top: pos ? pos.top : -9999,
        width: 270,
        maxWidth: "calc(100vw - 16px)",
        // Never taller than the viewport (dynamic vh accounts for mobile
        // browser chrome); the repo list inside scrolls to absorb any
        // overflow rather than the panel running off-screen.
        maxHeight: "calc(100dvh - 16px)",
        zIndex: 70,
        visibility: pos ? "visible" : "hidden",
        filter: "drop-shadow(0 16px 40px rgba(0, 0, 0, 0.55))",
      }}
    >
      <div className="repo-card-breathe rounded-lg overflow-hidden flex flex-col min-h-0 flex-1">
        {/* Inner cascade orchestrator — staggers the header block, then the list,
            inheriting the panel's animation state through the plain wrapper. */}
        <motion.div
          variants={contentV}
          className="p-4 flex flex-col min-h-0 flex-1"
          style={{ padding: fluid(1) }}
        >
          {/* Header — stays fixed while the repo list below scrolls. */}
          <motion.div variants={sectionV} className="shrink-0">
            {/* Eyebrow — same microlabel treatment as the modal's "Career
                snapshot". */}
            <p className="abt-micro text-[10px] uppercase tracking-[0.22em] text-[#ffaa2a] mb-1">
              Repository breakdown
            </p>
            <h3
              className="text-sm sm:text-base font-semibold mb-3 flex items-center gap-2"
              style={{ color: "#ff6d05", textShadow: "none", fontSize: fluidText(1, 0.875) }}
            >
              <span
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  background: lang.color,
                  boxShadow: `0 0 6px ${lang.color}`,
                }}
              />
              <span className="truncate">{lang.language}</span>
            </h3>
            <div aria-hidden="true" className="h-px elite-divider mb-3" />
          </motion.div>
          {/* Repo list — each row slides in from the left, staggered, after the
              header. `overflow-x-hidden` clips the -16px slide so it can't flash a
              horizontal scrollbar; scrolls within the viewport-bounded panel so a
              long breakdown never pushes the popover off-screen. */}
          <ul
            ref={listScrollRef}
            className="space-y-2.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5"
          >
            {privateCount > 0 && (
              // Private aggregate — ALWAYS the first row, above every public
              // repo regardless of share size. Count only, never names (muted,
              // non-link label — the same treatment as the Skills popover's
              // private row) but with the full row anatomy of its public
              // siblings: count-up combined percentage + slim share bar. The
              // bar drops the glow and dims so "private" reads quieter than
              // the clickable public rows.
              <li data-reveal-row className="text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="truncate"
                    style={{ color: "rgba(255, 170, 42, 0.6)" }}
                  >
                    {privateCount} private{" "}
                    {privateCount === 1 ? "repository" : "repositories"}
                  </span>
                  <AnimatedRepoPercent
                    value={privatePercentage}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                </div>
                <div className="mt-1 h-1 rounded-full overflow-hidden bg-white/5">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(parseFloat(privatePercentage) || 0, 100)}%`,
                      background: lang.color,
                      opacity: 0.55,
                    }}
                  />
                </div>
              </li>
            )}
            {repos.map((r) => {
              // This repo rose within the language → pulse its name + percentage
              // together (the popover's "name + %" pair).
              const rowPulseClass =
                pulsingRepos.has(r.name) && !prefersReducedMotion
                  ? " skill-heartbeat"
                  : "";
              return (
              <li key={r.name} data-reveal-row className="text-xs">
                <div className="flex items-center gap-2">
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      // Repo name in the same fire-amber gradient as the language
                      // names in the card list. Hover underline — the SAME effect
                      // as the Career snapshot's Personal Projects repo rows
                      // (`underline-offset-2 hover:underline transition-colors`).
                      className={`text-fire-amber truncate underline-offset-2 hover:underline transition-colors${rowPulseClass}`}
                    >
                      {r.name}
                    </a>
                  ) : (
                    <span className={`text-fire-amber truncate${rowPulseClass}`}>{r.name}</span>
                  )}
                  {/* Percentage counts up 0 → target with the card's curve the
                      moment the popover opens; it's killed if the popover
                      closes mid-count (this component unmounts and the effect
                      cleanup stops the tween). */}
                  <AnimatedRepoPercent
                    value={r.percentage}
                    prefersReducedMotion={prefersReducedMotion}
                    pulse={pulsingRepos.has(r.name)}
                  />
                </div>
                {/* Slim share bar — uses the language's own colour so the
                    popover reads as part of the same widget as the card. */}
                <div className="mt-1 h-1 rounded-full overflow-hidden bg-white/5">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(parseFloat(r.percentage) || 0, 100)}%`,
                      background: lang.color,
                      boxShadow: `0 0 5px ${lang.color}`,
                    }}
                  />
                </div>
              </li>
              );
            })}
          </ul>
        </motion.div>
      </div>
    </motion.div>,
    document.body,
  );
}

/* Count-up percentage for one repo row in the popover. Reuses the card's
   exact count-up — same `fastStartSlowFinish` curve (sprint to 70%, then the
   last 30% settles slowly) over the same COUNT_UP_DURATION — driven
   imperatively on a ref so the tween doesn't re-render every frame. The tween
   starts on mount (i.e. the moment the popover opens / switches to this repo)
   and is stopped in the effect cleanup, so closing the popover mid-count
   unmounts this and kills the animation. Honours reduced motion by painting
   the final value immediately. */
function AnimatedRepoPercent({ value, prefersReducedMotion, pulse = false }) {
  const ref = useRef(null);
  const target = parseFloat(value) || 0;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion) {
      node.textContent = target.toFixed(2);
      return;
    }
    node.textContent = "0.00";
    const controls = animate(0, target, {
      duration: COUNT_UP_DURATION,
      ease: fastStartSlowFinish,
      onUpdate: (v) => {
        node.textContent = v.toFixed(2);
      },
    });
    return () => controls.stop();
  }, [target, prefersReducedMotion]);

  return (
    <span
      className={`ml-auto tabular-nums shrink-0${pulse && !prefersReducedMotion ? " skill-heartbeat" : ""}`}
      style={{ color: "#ff6d05", textShadow: "none" }}
    >
      <span ref={ref}>{prefersReducedMotion ? target.toFixed(2) : "0.00"}</span>%
    </span>
  );
}
