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

export default function LanguagesCard({ data, isLive = false }) {
  const cardRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  // Entry-cycle trigger: increments once per *true* viewport entry and is
  // immune to the rapid in/out IntersectionObserver flicker that made the
  // old `useInView`-driven count-up restart mid-scroll (issue #16/17 bug
  // class). Children animate on `playToken`, not raw visibility.
  const { isInView, playToken } = useViewportCountTrigger(cardRef, {
    amount: 0.3,
    margin: "-50px",
  });

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

  useEffect(() => {
    if (!pendingMessage || !isInView) return;
    setBannerMessage(pendingMessage);
    consume();
    const timer = setTimeout(() => setBannerMessage(null), BANNER_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [pendingMessage, isInView, consume]);

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 1, ease: "easeOut" }}
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
      <div className="mb-5">
        {/* Title — amber (#ffaa2a), matching the "Years in the craft"
            eyebrow on the years card. Flat, semibold, no neon glow. */}
        <h2
          className="text-xl md:text-2xl text-left font-semibold mb-1"
          style={{ color: "#ffaa2a", textShadow: "none" }}
        >
          Most Used Languages
        </h2>
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
      </div>

      {/* Combined horizontal stacked bar — decorative; the list below
          carries the same data accessibly. `relative` anchors the one-shot
          sheen overlay; per-segment right borders draw crisp dividers
          between colours without changing layout width (border-box). */}
      <div
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
      </div>

      {/* Language list — 1 column on mobile, 2 columns on the full-width
          tablet view (`sm`–`md`), then back to 1 column at `lg`+ where the
          card becomes half-width and sits beside the taller GitHub-stats
          card. The single column there stacks all rows so the list fills the
          stretched card height instead of leaving a gap below a short
          2-column (3-row) grid. */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-y-3 gap-x-4 pt-2 text-sm md:text-base">
        {languages.map((lang, idx) => (
          <AnimatedLangLabel
            key={lang.language ?? idx}
            lang={lang}
            rank={idx + 1}
            isPrimary={idx === 0}
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
      </ul>

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
    <li
      tabIndex={0}
      data-lang-row=""
      // The whole row is the popover trigger, so the name OR the percentage
      // activates it; the same handlers still drive the bar spotlight.
      // `currentTarget` (the <li>) is the positioning anchor. Open/close is
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
      onBlur={() => {
        onDeactivate();
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
      <span
        aria-hidden="true"
        className="font-mono tabular-nums text-[10px] md:text-xs select-none w-5 shrink-0"
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
          marks the headline figure without competing with the percentage. */}
      {isPrimary && (
        <span
          aria-hidden="true"
          className="ml-1 shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wider"
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
    </li>
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
