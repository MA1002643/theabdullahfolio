"use client";

import { animate, motion, useReducedMotion } from "framer-motion";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { UpdateBanner } from "./UpdateBanner";

import { useLanguagesUpdateSignal } from "@/hooks/useLanguagesUpdateSignal";
import { useViewportCountTrigger } from "@/hooks/useViewportCountTrigger";
import { fastStartSlowFinish } from "@/utils/animationCurves";

// Shared count-up window. Every row animates over the same duration with no
// per-row stagger so all percentages reach their targets *simultaneously*
// (issue #18) — the easing curve, not a stagger, supplies the visual
// interest (fast start, eased landing).
const COUNT_UP_DURATION = 2; // seconds
// How long the change banner lingers once the section scrolls into view.
const BANNER_AUTO_HIDE_MS = 4500;

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
  const className =
    "text-xl md:text-2xl text-left font-semibold mb-1 break-words leading-tight";

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
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
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
      // breakdown — skip the popover rather than show an empty panel.
      return !!lang && Array.isArray(lang.repos) && lang.repos.length > 0;
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
  // we hold it back until the section is in view, then show + auto-hide.
  const { pendingMessage, consume } = useLanguagesUpdateSignal(languages);
  const [bannerMessage, setBannerMessage] = useState(null);

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
  // this timer; a fresh message re-arms it cleanly.
  useEffect(() => {
    if (!bannerMessage) return;
    const timer = setTimeout(() => setBannerMessage(null), BANNER_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [bannerMessage]);

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
    >
      <UpdateBanner
        message={bannerMessage}
        visible={Boolean(bannerMessage)}
        srPrefix="Languages update: "
        variant="elite"
      />

      {/* Header — title + an analytics-style meta line. */}
      <motion.div variants={childV} className="mb-5">
        {/* Title — per-character blur-in in vivid orange (#ff6d05), the exact
            treatment + hue the "… GitHub Stats" card uses, so the side-by-side
            pair share one headline animation and colour. */}
        <AnimatedTitle text="Most Used Languages" play={settledInView} />
        {/* Meta line — frames the card as a live data widget. Count is
            pluralised; the "· live from GitHub" suffix is shown only when
            `isLive` (the displayed languages came from a genuine live
            fetch). On a languages-GraphQL timeout the card keeps showing the
            last-good / snapshot list, and the suffix is dropped so it never
            claims "live" over stale data — it returns the moment a live
            fetch succeeds again. */}
        <p
          className="text-[10px] md:text-xs uppercase tracking-[0.18em]"
          style={{ color: "rgba(255, 170, 42, 0.6)", textShadow: "none" }}
        >
          {languages.length} {languages.length === 1 ? "language" : "languages"}
          {isLive && " · live from GitHub"}
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
          lang={languages[popover.index]}
          anchorRect={popover.rect}
          prefersReducedMotion={prefersReducedMotion}
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
  onActivate,
  onDeactivate,
  onRepoEnter,
  onRepoFocus,
  onRepoTap,
  onRepoClose,
}) {
  const numRef = useRef(null);
  const target = parseFloat(lang.percentage || 0);
  const hasRepos = Array.isArray(lang.repos) && lang.repos.length > 0;

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
        className="font-mono tabular-nums text-[10px] md:text-xs select-none w-5 shrink-0 xl:hidden"
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
      <span className="text-fire-amber truncate">{lang.language}</span>
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
        className="ml-auto tabular-nums shrink-0"
        style={{ color: "#ff6d05", textShadow: "none" }}
      >
        <span ref={numRef}>{prefersReducedMotion ? target.toFixed(2) : "0.00"}</span>%
      </span>
      </div>
    </motion.li>
  );
}

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
  onPointerEnter,
  onPointerLeave,
}) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

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

  return createPortal(
    <div
      ref={ref}
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
        <div className="p-4 flex flex-col min-h-0 flex-1">
          {/* Header — stays fixed while the repo list below scrolls. */}
          <div className="shrink-0">
            {/* Eyebrow — same microlabel treatment as the modal's "Career
                snapshot". */}
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#ffaa2a] mb-1">
              Repository breakdown
            </p>
            <h3
              className="text-sm sm:text-base font-semibold mb-3 flex items-center gap-2"
              style={{ color: "#ff6d05", textShadow: "none" }}
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
          </div>
          {/* Repo list — scrolls within the viewport-bounded panel so a long
              breakdown never pushes the popover off-screen. */}
          <ul className="space-y-2.5 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-0.5">
            {repos.map((r) => (
              <li key={r.name} className="text-xs">
                <div className="flex items-center gap-2">
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      // Repo name in the same fire-amber gradient as the
                      // language names in the card list. Hover fades slightly —
                      // a gradient (transparent-fill) text has no visible
                      // underline colour to shift.
                      className="text-fire-amber truncate transition-opacity hover:opacity-70"
                    >
                      {r.name}
                    </a>
                  ) : (
                    <span className="text-fire-amber truncate">{r.name}</span>
                  )}
                  {/* Percentage counts up 0 → target with the card's curve the
                      moment the popover opens; it's killed if the popover
                      closes mid-count (this component unmounts and the effect
                      cleanup stops the tween). */}
                  <AnimatedRepoPercent
                    value={r.percentage}
                    prefersReducedMotion={prefersReducedMotion}
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
            ))}
          </ul>
        </div>
      </div>
    </div>,
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
function AnimatedRepoPercent({ value, prefersReducedMotion }) {
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
      className="ml-auto tabular-nums shrink-0"
      style={{ color: "#ff6d05", textShadow: "none" }}
    >
      <span ref={ref}>{prefersReducedMotion ? target.toFixed(2) : "0.00"}</span>%
    </span>
  );
}
