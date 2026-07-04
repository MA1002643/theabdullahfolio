"use client";

import { animate, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SkillIcon, SkillRepoPopover } from "./SkillIcon";
import { UpdateBanner } from "./UpdateBanner";

import { usePointerCapability } from "@/hooks/usePointerCapability";
import { useSkillsUpdateSignal } from "@/hooks/useSkillsUpdateSignal";
import { useViewportCountUp } from "@/hooks/useViewportCountUp";
import { useViewportCountTrigger } from "@/hooks/useViewportCountTrigger";
import { flattenCategories } from "@/utils/skillsDiff";
import { CATEGORY_ORDER, emptyCategories } from "@/utils/skillsIconUrl";

// How long the change banner lingers once the section scrolls into view —
// matches the Languages / Streak cards (issue #20, acceptance #15).
const BANNER_AUTO_HIDE_MS = 4500;
// Client-side refresh guard — 10 minutes (shortened from 24h) so live GitHub
// changes surface quickly. The `:v4` key suffix force-invalidates any older
// cached payload — bumped to v4 when each skill gained `privateRepoCount` (a
// v3 payload without it would leave private-only skills non-interactive for a
// TTL window); v3 was the earlier bump when skills gained their `repos`
// breakdown.
const CACHE_TTL_MS = 10 * 60 * 1000;
const LAST_FETCHED_KEY = "skillsLastFetched:v4";
const CACHE_KEY = "skillsCache:v4";

// One clamp drives each cell so icons stay fluid from a 320px phone to a 1920px
// desktop (issue #20, Task 4).
const CELL_SIZE = "clamp(2.5rem,7vw,4rem)";

// Visible category headings.
const CATEGORY_LABELS = {
  languages: "Languages",
  frameworks: "Frameworks",
  libraries: "Libraries",
  tools: "Tools",
  software: "Software",
};

// A skill's popover has something to disclose when it has PUBLIC repo names to
// list OR a private-usage count to report ("N private repositories" — names
// withheld server-side). Gates every open path and the tile's button semantics,
// so a skill used only in private repos is still hoverable.
const hasDisclosure = (item) =>
  Boolean(item?.repos?.length) || (item?.privateRepoCount ?? 0) > 0;

// The card body shows ONE category at a time: header + gap + one icon row, plus
// vertical breathing room so the row never touches the clip edges (icons fully
// visible top & bottom, with headroom for the hover lift). Kept as a constant so
// the scroller, the pinned stage and the scroll-track math all agree — change it
// here and the matching `h-[7.5rem]` classes below.
const VIEWPORT = "7.5rem";

// Extra vertical scroll (px) appended to each category AFTER its row is fully
// scrubbed — a short "dwell" where the last icons sit fully visible before the
// next category takes over (the "…until the last icon is visible, only then
// scroll to the next category" beat). Categories that already fit in one row use
// just this gap as their advance distance — kept short so they pass with a flick
// rather than a long stretch of dead scroll where nothing visibly changes.
const ADVANCE_GAP = 56;

// Item 1 — REVEAL on scrub: as the row slides left, each icon fades in over the
// last REVEAL_DIST px before it crosses the right edge, so icons "appear as you
// scroll" (the spirit of the old wave, adapted to a single row). A PURE opacity
// fade — no blur: the blur read as permanently smeared icons on mobile (this
// follow-up), so icons now stay sharp at every scrub position.
// Kept BELOW one cell width so the trailing icons (which sit within a cell of the
// right edge at full scrub) still settle to full opacity rather than staying
// half-faded.
const REVEAL_DIST = 38;

// Per-icon entrance WAVE, re-fired as an icon scrubs into view. Mirrors the
// `.skill-icon-reveal` CSS rule (fade + blur + rise) so a scrubbed-in icon gets
// the exact same wave as the on-appearance batch. Re-applied imperatively
// (cancel → reflow → re-apply); `animation-delay` is set inline so a single
// icon entering waves immediately (0ms) while a burst entering in one frame
// (fast scroll) can stagger left-to-right.
const ICON_REVEAL_ANIM = "skill-icon-reveal 0.45s ease-out both";
const ICON_REVEAL_STAGGER_MS = 45;

// Item 4 — the "just added" heartbeat window, SHARED by the category header
// (name + count) and the added icon so the whole flag starts and ends as one
// beat. 2000ms = exactly two 1s cycles of the skill-heartbeat animation, so the
// pulse always completes on its resting keyframe — no mid-dip snap when the
// class is removed.
const HEARTBEAT_MS = 2000;

// ----- Entrance choreography — same family as the Languages / Stats cards so
// the data cards animate IN as one system.
const cardVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 70, damping: 18, staggerChildren: 0.07, delayChildren: 0.12 },
  },
};

const headerVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 20 } },
};

// Reduced-motion no-op for the card/header entrance.
const noMotion = { hidden: { opacity: 1, y: 0, scale: 1 }, visible: { opacity: 1, y: 0, scale: 1 } };

/* Per-character blur-fade title in the shared vivid orange (#ff6d05). Reduced
   motion renders a plain heading; the char spans are aria-hidden with an
   aria-label so the accessible name stays clean. */
function AnimatedTitle({ text, play }) {
  const prefersReducedMotion = useReducedMotion();
  const className = "text-xl md:text-2xl text-left font-semibold mb-1 break-words leading-tight";

  if (prefersReducedMotion) {
    return (
      <h2 className={className} style={{ color: "#ff6d05", textShadow: "none" }}>
        {text}
      </h2>
    );
  }
  const chars = Array.from(text);
  const container = { hidden: {}, visible: { transition: { staggerChildren: 0.025, delayChildren: 0.2 } } };
  const charVariant = {
    hidden: { opacity: 0, filter: "blur(6px)", y: 8 },
    visible: { opacity: 1, filter: "blur(0px)", y: 0, transition: { duration: 0.35, ease: "easeOut" } },
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
      {chars.map((c, i) =>
        c === " " ? (
          <span key={i}>{" "}</span>
        ) : (
          <motion.span key={i} variants={charVariant} style={{ display: "inline-block" }} aria-hidden="true">
            {c}
          </motion.span>
        ),
      )}
    </motion.h2>
  );
}

/* The per-category count beside each header. Driven imperatively by
   useViewportCountUp so the number tweens from 0 each time its category
   becomes the active one (scrubbing view) or the section enters view
   (reduced-motion stacked view). `nodeRef` is wired from CategoryHeader
   so the hook can write textContent directly without a re-render. */
function CategoryCount({ nodeRef, initialValue }) {
  return (
    <span
      ref={nodeRef}
      className="text-[9px] font-medium leading-none tabular-nums"
      style={{ color: "rgba(255,170,42,0.45)" }}
    >
      {initialValue}
    </span>
  );
}

/* A category header — the gradient tick, label, live count and trailing rule.
   `isActive` + `settledInView` gate the count-up: the tween plays the moment
   its category becomes the visible one (or immediately in reduced-motion).
   When `heartbeat` is set the label and count also pulse to flag a new icon.

   Direct effect (not useViewportCountUp): for Languages (i=0) isActive is true
   from mount, so the count-up trigger must come from settledInView transitioning
   false→true. The shared hook handles this in theory, but a timing-sensitive
   armedRef path caused the first-entry tween to be silently skipped. A direct
   effect fires unconditionally on any (isActive && settledInView) → true
   transition and is simpler to reason about. */
function CategoryHeader({ label, count, heartbeat, prefersReducedMotion, isActive = false, settledInView = false }) {
  const countRef = useRef(null);

  useEffect(() => {
    const node = countRef.current;
    if (!node) return undefined;
    if (!isActive || !settledInView) {
      if (prefersReducedMotion) {
        node.textContent = `${count}`;
        return undefined;
      }
      // Debounced reset so a brief flicker doesn't blank a running animation.
      const t = setTimeout(() => {
        if (countRef.current) countRef.current.textContent = "0";
      }, 300);
      return () => clearTimeout(t);
    }
    if (prefersReducedMotion) {
      node.textContent = `${count}`;
      return undefined;
    }
    node.textContent = "0";
    const controls = animate(0, count, {
      duration: 2,
      onUpdate(v) {
        if (countRef.current) countRef.current.textContent = `${Math.round(v)}`;
      },
    });
    return () => controls.stop();
  }, [isActive, settledInView, count, prefersReducedMotion]);

  const pulse = heartbeat && !prefersReducedMotion ? "skill-heartbeat" : "";
  return (
    // data-skill-divider: the overlay measures this header row's bottom to clamp
    // the hovered icon's 3D name so it never rises above the category line.
    <div data-skill-divider className="flex items-center gap-2 py-1.5">
      <span
        aria-hidden="true"
        className="h-3 w-[2px] flex-none rounded-full"
        style={{ background: "linear-gradient(to bottom, #ffd27d, #ff6d05)", boxShadow: "0 0 6px rgba(255,109,5,0.65)" }}
      />
      <h3
        className={`text-[10px] uppercase tracking-[0.2em] font-semibold leading-none ${pulse}`}
        style={{ color: "#ffaa2a", textShadow: "none" }}
      >
        {label}
      </h3>
      {/* `inline-flex items-center leading-none` so the wrapper's box hugs the
          9px digits — with the default inline line-height the count rode the
          taller line box's baseline and sat visibly below the label's centre. */}
      <span className={`inline-flex items-center leading-none ${pulse}`}>
        <CategoryCount nodeRef={countRef} initialValue={prefersReducedMotion ? count : 0} />
      </span>
      <span
        aria-hidden="true"
        className="ml-1 h-px flex-1"
        style={{ background: "linear-gradient(to right, rgba(255,170,42,0.35), rgba(255,170,42,0))" }}
      />
    </div>
  );
}

/* One non-wrapping horizontal strip of a category's icons. `data-slug` on each
   flex child lets the scrub engine map a cell back to its skill (for the per-icon
   reveal + "just added" heartbeat).

   `py-2.5` gives the entrance rise its headroom INSIDE the horizontal clip box,
   so an animating icon is never cropped at the top and the resting row keeps
   clear space below it. `overflow-hidden` still clips the horizontal scrub (icons
   sliding off the left edge). Hovering/tapping an icon opens the repository-usage
   popover, which renders in a body-level portal (SkillRepoPopover) so it escapes
   this clip and the sticky stage. */
function IconStrip({ items, rowRef, pulsingIcons, activeSlug, iconHandlers }) {
  return (
    <div className="mt-2 overflow-hidden py-2.5">
      <div ref={rowRef} className="flex w-max flex-nowrap gap-3 sm:gap-4 will-change-transform">
        {items.map((item, idx) => (
          // Flex child = the unit the scrub engine maps (data-slug, offsetLeft)
          // and writes the per-icon scrub reveal (opacity) onto. NO `will-change`:
          // promoting each cell to its own composite layer left individual icons
          // landing on a fractional sub-pixel sat blurry (Node.js / Vercel and
          // friends). Painted into the row's layer instead, they stay crisp; the
          // opacity writes below don't need the hint.
          <div
            key={item.slug}
            data-slug={item.slug}
            className="shrink-0"
            style={{ width: CELL_SIZE, height: CELL_SIZE }}
          >
            {/* Entrance layer — a staggered fade/blur/rise replayed each time the
                category becomes active (see SkillsStage). MUST stay the cell's
                firstElementChild: the scrub engine restarts the wave on it. `--i`
                drives the per-icon stagger. */}
            <div className="skill-icon-reveal h-full w-full" style={{ "--i": idx }}>
              <SkillIcon
                slug={item.slug}
                displayName={item.displayName}
                source={item.source}
                hasRepos={hasDisclosure(item)}
                active={activeSlug === item.slug}
                pulsing={pulsingIcons?.has(item.slug)}
                onIconEnter={(el) => iconHandlers.onIconEnter(item, el)}
                onIconLeave={iconHandlers.onIconLeave}
                onIconFocus={(el) => iconHandlers.onIconFocus(item, el)}
                onIconBlur={iconHandlers.onIconBlur}
                onIconTap={(el) => iconHandlers.onIconTap(item, el)}
                onIconActivate={(el) => iconHandlers.onIconActivate(item, el)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* The horizontal-scrub stage.

   Each category is a SINGLE non-wrapping row. The card body is a short vertical
   scroller (one category tall) acting purely as the scroll INPUT: a tall inner
   "track" gives it scroll length, and a `sticky` stage stays pinned showing the
   current category. As you scroll vertically:
     • while inside a category's segment, its row translates HORIZONTALLY from 0
       to -(row overflow), revealing the rest of its icons in the same row;
     • a short ADVANCE_GAP of dwell keeps the last icons fully visible;
     • crossing into the next segment swaps the active category (crossfade).
   So one vertical gesture scrubs a category sideways, then advances to the next
   — and only categories that overflow one row actually scrub (others just need a
   flick to pass). The scroller scrolls NATIVELY (no wheel/touch hijack), so the
   scrub inherits the platform's momentum and a fling that bottoms out chains to
   the page like any nested scroll. Reduced-motion users get a plain,
   fully-scrollable stacked grid instead. */
function SkillsStage({
  groups,
  settledInView,
  prefersReducedMotion,
  pulseSlugs,
  headerPulseSlugs,
  onPulsed,
  bannerVisible,
  canHover,
}) {
  const scrollerRef = useRef(null);
  const rowRefs = useRef([]);

  // ── Repository-usage popover (mirrors the Most Used Languages card) ─────────
  // At most one is open; it anchors to the icon's viewport rect and lists the
  // repos the skill is used in. `mode`:
  //   • "hover" — fine pointer / keyboard focus; closes on leave/blur after a
  //     short grace so the pointer can bridge into the panel to reach the links.
  //   • "tap"   — touch; sticky until a tap outside / re-tap / another icon / Esc.
  const [popover, setPopover] = useState(null);
  const activeSlug = popover?.skill?.slug ?? null;
  const closeTimerRef = useRef(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setPopover((cur) => (cur && cur.mode === "tap" ? cur : null));
    }, 140);
  }, [cancelClose]);
  const openHover = useCallback(
    (item, el) => {
      cancelClose();
      if (!hasDisclosure(item) || !el) return;
      setPopover({ skill: item, rect: el.getBoundingClientRect(), mode: "hover" });
    },
    [cancelClose],
  );
  const toggleTap = useCallback(
    (item, el) => {
      cancelClose();
      if (!hasDisclosure(item) || !el) {
        setPopover(null);
        return;
      }
      setPopover((cur) =>
        cur && cur.skill.slug === item.slug && cur.mode === "tap"
          ? null
          : { skill: item, rect: el.getBoundingClientRect(), mode: "tap" },
      );
    },
    [cancelClose],
  );

  // Last-input modality: a keyboard (Tab) attached to a touch device has no hover
  // pointer, so focus-driven opening keys off this instead of `canHover`.
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

  // Per-icon handlers, modality-gated: mouse/keyboard → hover-open, touch → tap.
  const onIconEnter = useCallback((item, el) => { if (canHover) openHover(item, el); }, [canHover, openHover]);
  const onIconLeave = useCallback(() => scheduleClose(), [scheduleClose]);
  const onIconFocus = useCallback((item, el) => { if (keyboardModalityRef.current) openHover(item, el); }, [openHover]);
  const onIconBlur = useCallback(
    (e) => {
      if (e.relatedTarget?.closest?.("[data-skill-popover]")) return;
      scheduleClose();
    },
    [scheduleClose],
  );
  const onIconTap = useCallback((item, el) => { if (!canHover) toggleTap(item, el); }, [canHover, toggleTap]);
  // Enter/Space activation for the focusable tile (role="button"). Deliberately
  // modality-agnostic: `onIconFocus` only opens under keyboard hover-modality and
  // `onIconTap` only fires on touch (`!canHover`), so neither covers an Enter/Space
  // press on a hover-capable device. Toggles in the blur-closable "hover" mode
  // (never the sticky "tap" mode), so tabbing away still dismisses the panel.
  const onIconActivate = useCallback(
    (item, el) => {
      cancelClose();
      if (!hasDisclosure(item) || !el) return;
      setPopover((cur) =>
        cur && cur.skill.slug === item.slug
          ? null
          : { skill: item, rect: el.getBoundingClientRect(), mode: "hover" },
      );
    },
    [cancelClose],
  );
  const iconHandlers = { onIconEnter, onIconLeave, onIconFocus, onIconBlur, onIconTap, onIconActivate };

  // A tap (touch) popover is sticky: a pointerdown outside it + outside any icon
  // dismisses it.
  useEffect(() => {
    if (!popover || popover.mode !== "tap") return undefined;
    const onDown = (e) => {
      const t = e.target;
      if (t?.closest && (t.closest("[data-skill-popover]") || t.closest("[data-skill-row]"))) return;
      setPopover(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [popover]);

  // Close on scroll (the anchor rect is frozen) / resize / Escape. A scroll
  // ORIGINATING inside the popover's own repo list must not close it.
  useEffect(() => {
    if (!popover) return undefined;
    const onScroll = (e) => {
      const t = e.target;
      if (t?.closest && t.closest("[data-skill-popover]")) return;
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

  useEffect(() => () => cancelClose(), [cancelClose]);
  // Starts at -1 so the very first apply() treats category 0 as a fresh
  // activation — seeding each icon's `_waved` latch to its current visibility
  // (no wave fired) so the resting row never spuriously re-waves on first scroll.
  const activeRef = useRef(-1);
  const [active, setActive] = useState(0);
  const [layout, setLayout] = useState({ starts: [], overflows: [], total: 0 });

  // Heartbeat (item 4): which icon slugs / category indices are currently
  // pulsing, plus per-slug dedupe so each added icon pulses only the first time.
  const [pulsingIcons, setPulsingIcons] = useState(() => new Set());
  const [pulsingHeaders, setPulsingHeaders] = useState(() => new Set());
  const onPulsedRef = useRef(onPulsed);
  const iconDoneRef = useRef(new Set());
  const headerDoneRef = useRef(new Set());
  // Heartbeat removal timers. Each pulse batch owns its OWN timer that removes
  // exactly the slugs / header index it started; the Set only exists so unmount
  // can clear any still-pending ones.
  //
  // This used to be a single shared timer ref per kind (icon / header), cleared
  // before each new batch scheduled its own. That broke the moment TWO
  // categories pulsed concurrently — e.g. a partial→full reload adds icons across
  // several categories, and scrolling from one to the next within the 2s window
  // made the second batch's `clearTimeout` cancel the FIRST batch's removal. The
  // first category then never stopped pulsing (only the last batch to fire ever
  // cleared) until a refresh. Per-batch timers can't cancel each other, so every
  // pulse self-terminates after HEARTBEAT_MS no matter how the categories overlap.
  const heartbeatTimersRef = useRef(new Set());
  useEffect(() => {
    onPulsedRef.current = onPulsed;
  }, [onPulsed]);
  useEffect(() => {
    // Capture the (stable, never-reassigned) Set at setup so the cleanup closes
    // over the exact same instance — satisfies react-hooks/exhaustive-deps and is
    // identical in behaviour since `heartbeatTimersRef.current` never changes.
    const timers = heartbeatTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  // Sync bannerVisible into a ref so the scroll handler can read it without
  // capturing a stale value — the effect dep array can't include it or it would
  // re-attach the scroll listener on every banner show/hide.
  const bannerVisibleRef = useRef(bannerVisible);
  useEffect(() => {
    bannerVisibleRef.current = bannerVisible;
  }, [bannerVisible]);

  // Measure each row's overflow past the visible width → per-category scroll
  // segments. Re-measures on resize (column width / icon count changes).
  useEffect(() => {
    if (prefersReducedMotion) return undefined;
    const sc = scrollerRef.current;
    if (!sc) return undefined;
    const measure = () => {
      const stageW = sc.clientWidth;
      const overflows = groups.map((_, i) => {
        const row = rowRefs.current[i];
        return row ? Math.max(0, row.scrollWidth - stageW) : 0;
      });
      const starts = [];
      let acc = 0;
      overflows.forEach((o) => {
        starts.push(acc);
        acc += o + ADVANCE_GAP;
      });
      setLayout({ starts, overflows, total: acc });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [groups, prefersReducedMotion]);

  // Scroll → active category + horizontal scrub + per-icon scrub REVEAL (item 1,
  // icons entering from the right edge). Transform/opacity are written
  // imperatively (no per-frame re-render); only switching the active category
  // re-renders. The per-appearance entrance and the heartbeat live in their own
  // effects below, so this stays a tight scroll handler.
  useEffect(() => {
    if (prefersReducedMotion) return undefined;
    const sc = scrollerRef.current;
    if (!sc || !layout.starts.length) return undefined;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const s = sc.scrollTop;
      let i = 0;
      for (let k = 0; k < layout.starts.length; k++) {
        if (s >= layout.starts[k]) i = k;
        else break;
      }
      const o = layout.overflows[i] || 0;
      const local = s - layout.starts[i];
      const prog = o > 0 ? Math.min(1, Math.max(0, local / o)) : 0;
      const tx = -(prog * o);
      const row = rowRefs.current[i];
      // True only on the frame the active category flips. On that frame the
      // on-appearance batch is owned by the entrance effect below (which also
      // seeds `_waved`), so we don't re-fire waves here — we'd double up.
      const categoryChanged = i !== activeRef.current;
      if (row) {
        // Round to whole pixels: a fractional translate on a `will-change:
        // transform` layer is resampled by the GPU → the whole row (and every
        // icon in it) renders blurry. Integer offsets keep the scrub crisp.
        row.style.transform = `translateX(${Math.round(tx)}px)`;
        const stageW = sc.clientWidth;
        const cells = row.children;
        const entering = [];
        for (let c = 0; c < cells.length; c++) {
          const cell = cells[c];
          const cellLeft = cell.offsetLeft + tx;
          // Reveal: 0 just as the icon touches the right edge → 1 once it has
          // travelled REVEAL_DIST into view. Non-overflowing rows show fully.
          // (Composes multiplicatively with the entrance layer's own opacity.)
          // Opacity ONLY — no blur, so an icon is sharp the instant it appears.
          let t = 1;
          if (o > 0) {
            t = (stageW - cellLeft) / REVEAL_DIST;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
          }
          cell.style.opacity = String(t);
          // Per-icon WAVE bookkeeping. `_waved` latches whether the icon is
          // currently "appeared". "In view" = the icon's midpoint is inside the
          // stage — midpoint-based so a re-entry is detected from EITHER edge
          // (right on a forward/down scrub, left on a backward/up scrub).
          if (!bannerVisibleRef.current) {
            const mid = cellLeft + cell.offsetWidth / 2;
            const inView = mid > 0 && mid < stageW;
            if (categoryChanged) {
              // Fresh category: seed the latch to current visibility WITHOUT
              // firing — the on-appearance wave for the icons already on screen
              // is owned by the entrance effect below; off-screen icons
              // (`_waved = false`) fire here the moment they scrub into view.
              cell._waved = inView;
            } else if (inView && !cell._waved) {
              // An off-screen icon just scrubbed into view → re-fire its wave.
              cell._waved = true;
              entering.push({ layer: cell.firstElementChild, left: cellLeft });
            } else if (!inView && cell._waved) {
              // Scrubbed back out → re-arm so it waves again on the next entry.
              cell._waved = false;
            }
          }
        }
        // A fast scroll can sweep several icons in within one frame — stagger
        // them left-to-right as a mini-cascade. One batched reflow restarts all.
        if (entering.length) {
          entering.sort((a, b) => a.left - b.left);
          entering.forEach(({ layer }) => {
            if (layer) {
              layer.style.animation = "none";
              layer.style.opacity = "";
            }
          });
          void row.offsetWidth;
          entering.forEach(({ layer }, k) => {
            if (!layer) return;
            layer.style.animation = ICON_REVEAL_ANIM;
            layer.style.animationDelay = `${k * ICON_REVEAL_STAGGER_MS}ms`;
          });
        }
      }
      if (categoryChanged) {
        activeRef.current = i;
        setActive(i);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      sc.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [layout, prefersReducedMotion]);

  // Entrance reveal (item 1, ON APPEARANCE). Each time a category becomes the
  // active one, replay the staggered fade/blur/rise of its icons. The icons
  // carry the `skill-icon-reveal` CSS animation; restarting it imperatively
  // (cancel → single reflow → re-apply) replays it WITHOUT remounting the row
  // (which would re-request every <img>). Gated on a settled in-view so it plays
  // when the section is actually seen, not while it's still off-screen.
  // Also gated on bannerVisible: for the first category (Languages) the banner
  // and the wave would otherwise overlap — the wave finishes before the banner
  // clears and the user never sees it.
  // When bannerVisible is true: freeze the active row's icons at opacity 0 so
  // they are completely invisible behind the banner (the initial CSS animation
  // plays on mount regardless, so we cancel it imperatively).
  // When bannerVisible flips false: clear the freeze and replay the wave cleanly.
  useEffect(() => {
    if (prefersReducedMotion || !settledInView) return;
    const row = rowRefs.current[active];
    if (!row) return;

    if (bannerVisible) {
      for (let c = 0; c < row.children.length; c++) {
        const layer = row.children[c].firstElementChild;
        if (layer) {
          layer.style.animation = "none";
          layer.style.opacity = "0";
        }
      }
      return;
    }

    // Banner gone / category just activated — clear any freeze then replay the
    // staggered on-appearance wave for the row. Off-screen icons replay here too
    // but they're clipped by the row's overflow-hidden, so it's invisible; the
    // scroll handler re-fires their wave VISIBLY the moment they scrub into view
    // and owns the `_waved` latches (seeded on the activation frame). The `--i`
    // stagger comes from the CSS class, so `animationDelay` is cleared in case a
    // prior scrub re-fire left an inline 0ms on a cell.
    const layers = [];
    for (let c = 0; c < row.children.length; c++) {
      const layer = row.children[c].firstElementChild; // the .skill-icon-reveal el
      if (layer) {
        layer.style.animation = "none";
        layer.style.opacity = "";
        layer.style.animationDelay = "";
        layers.push(layer);
      }
    }
    if (layers.length) void row.offsetWidth; // one forced reflow restarts them all
    layers.forEach((layer) => {
      layer.style.animation = "";
    });
  }, [active, settledInView, prefersReducedMotion, bannerVisible]);

  // "Just added" / "data updated" heartbeat (item 4). When the active category
  // contains a pulse-pending slug, beat it for the shared HEARTBEAT_MS window —
  // each once, deduped. ADDED icons pulse their header (name + count) AND the
  // icon so the whole flag reads as one beat; icons whose repo usage merely
  // CHANGED (a new repo using the skill — `pulseSlugs` minus `headerPulseSlugs`)
  // pulse the icon alone, since the category header's count didn't move. Firing
  // on activation (not on the scrub) means it plays the moment the user lands on
  // the category, regardless of overflow.
  // Gated on !bannerVisible so the pulse never runs while the update banner is
  // still showing — when the banner clears, bannerVisible flips to false and this
  // effect re-fires for the current active category.
  useEffect(() => {
    if (prefersReducedMotion || !pulseSlugs || pulseSlugs.size === 0) return undefined;
    if (bannerVisible) return undefined;
    // Wait for the card itself to be on screen: a data-updated pulse has no
    // banner holding it back (unlike adds), so without this gate a background
    // refresh would burn the 2s beat while the card is below the fold.
    if (!settledInView) return undefined;
    const g = groups[active];
    if (!g) return undefined;
    const idx = active;
    const fresh = g.items.map((it) => it.slug).filter((slug) => pulseSlugs.has(slug));

    const freshHeader = fresh.filter(
      (slug) => headerPulseSlugs?.has(slug) && !headerDoneRef.current.has(slug),
    );
    if (freshHeader.length > 0) {
      freshHeader.forEach((slug) => headerDoneRef.current.add(slug));
      setPulsingHeaders((prev) => new Set(prev).add(idx));
      // This batch owns its own removal timer (captured `idx`), registered only
      // for unmount cleanup. Scrolling to another category that starts its own
      // pulse can no longer cancel this one, so the header always stops after
      // HEARTBEAT_MS. (`headerDoneRef` dedupes per slug, so a given header never
      // schedules two competing timers for the same index.)
      const headerTimer = setTimeout(() => {
        setPulsingHeaders((prev) => {
          const n = new Set(prev);
          n.delete(idx);
          return n;
        });
        // Un-latch after the beat: the source slug is cleared via onPulsed by
        // then, and the SAME header must be able to pulse again if a future
        // in-session update adds another icon to it.
        freshHeader.forEach((slug) => headerDoneRef.current.delete(slug));
        heartbeatTimersRef.current.delete(headerTimer);
      }, HEARTBEAT_MS);
      heartbeatTimersRef.current.add(headerTimer);
    }

    const freshIcons = fresh.filter((slug) => !iconDoneRef.current.has(slug));
    if (freshIcons.length > 0) {
      freshIcons.forEach((slug) => iconDoneRef.current.add(slug));
      setPulsingIcons((prev) => {
        const n = new Set(prev);
        freshIcons.forEach((slug) => n.add(slug));
        return n;
      });
      // Per-batch timer, same as the header above: it removes exactly the slugs
      // this run added, so a concurrent pulse on another category can't strip its
      // removal (the single-shared-timer bug that left icons pulsing forever).
      const iconTimer = setTimeout(() => {
        setPulsingIcons((prev) => {
          const n = new Set(prev);
          freshIcons.forEach((slug) => n.delete(slug));
          return n;
        });
        freshIcons.forEach((slug) => onPulsedRef.current?.(slug));
        // Un-latch after onPulsed has dropped the slug from its source list —
        // the dedupe ref only guards the window between pulse-start and source
        // clear. Left latched, an icon whose counts change AGAIN later in the
        // session (10-min refresh cycles) could never pulse a second time.
        freshIcons.forEach((slug) => iconDoneRef.current.delete(slug));
        heartbeatTimersRef.current.delete(iconTimer);
      }, HEARTBEAT_MS);
      heartbeatTimersRef.current.add(iconTimer);
    }
  }, [active, pulseSlugs, headerPulseSlugs, groups, prefersReducedMotion, bannerVisible, settledInView]);

  // NO scroll hijack. The scrub is driven purely by the inner scroller's OWN
  // native vertical scroll (the effect above maps its scrollTop → horizontal
  // translate + category switch), so it inherits the platform's momentum and
  // feels flawless on touch. The old version added window-level wheel/touch
  // listeners that called preventDefault and hand-set scrollTop (no momentum)
  // WHENEVER the card was fully on screen — which redirected ALL page scrolling
  // into this one card and read as global, glitchy jank. Letting the browser do
  // the scrolling (and chain to the page natively at the scrub's top/bottom)
  // fixes that everywhere. The reveal/heartbeat read bannerVisibleRef; the
  // banner separately locks interaction via pointer-events on the stage.

  // Reduced motion / no scrubbing: a plain, fully-scrollable stacked grid so
  // every icon is reachable without any motion. Hover/tap still opens the same
  // repository-usage popover.
  if (prefersReducedMotion) {
    return (
      <>
        {popover && (
          <SkillRepoPopover
            // Key by slug so moving from one icon's popover straight to another's
            // (without it closing in between) REMOUNTS it — replaying the
            // staggered repo-list slide-in for the new skill.
            key={popover.skill.slug}
            skill={popover.skill}
            anchorRect={popover.rect}
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
          />
        )}
        <div
          className="relative max-h-[14rem] overflow-y-auto pr-2"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#ff6d05 transparent" }}
        >
          {groups.map((g) => (
            <div key={g.category} data-skill-cat className="mb-3">
              <CategoryHeader
                label={CATEGORY_LABELS[g.category] ?? g.category}
                count={g.items.length}
                prefersReducedMotion
                isActive
                settledInView={settledInView}
              />
              <div
                className="mt-2 grid gap-3"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${CELL_SIZE}, 1fr))` }}
              >
                {g.items.map((item) => (
                  <div key={item.slug} data-slug={item.slug} style={{ width: CELL_SIZE, height: CELL_SIZE }}>
                    <SkillIcon
                      slug={item.slug}
                      displayName={item.displayName}
                      source={item.source}
                      hasRepos={hasDisclosure(item)}
                      active={activeSlug === item.slug}
                      onIconEnter={(el) => iconHandlers.onIconEnter(item, el)}
                      onIconLeave={iconHandlers.onIconLeave}
                      onIconFocus={(el) => iconHandlers.onIconFocus(item, el)}
                      onIconBlur={iconHandlers.onIconBlur}
                      onIconTap={(el) => iconHandlers.onIconTap(item, el)}
                      onIconActivate={(el) => iconHandlers.onIconActivate(item, el)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="relative">
      {popover && (
        <SkillRepoPopover
          // Remount per skill (see the reduced-motion branch above) so the repo
          // list's staggered slide-in replays when switching between icons.
          key={popover.skill.slug}
          skill={popover.skill}
          anchorRect={popover.rect}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
        />
      )}
      {/* Vertical scroller = the scroll INPUT. Scrollbar hidden (the horizontal
          movement IS the feedback); overflow-x clipped so rows never widen it. */}
      <div
        ref={scrollerRef}
        className="relative overflow-y-auto overflow-x-hidden h-[7.5rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Tall track gives the scroll budget: one viewport + the summed segments. */}
        <div style={{ height: `calc(${VIEWPORT} + ${layout.total}px)` }}>
          {/* Pinned stage — stays in view while the track scrolls beneath. */}
          <div className="sticky top-0 h-[7.5rem] overflow-hidden">
            {groups.map((g, i) => (
              <div
                key={g.category}
                data-skill-cat
                className="absolute inset-0 transition-opacity duration-300"
                style={{
                  opacity: i === active ? 1 : 0,
                  // While the update banner is visible the stage is locked:
                  // pointer-events: none makes the icons non-hoverable/clickable,
                  // so the card reads as a non-interactive surface until the
                  // banner auto-hides.
                  pointerEvents: bannerVisible || i !== active ? "none" : "auto",
                }}
              >
                <CategoryHeader
                  label={CATEGORY_LABELS[g.category] ?? g.category}
                  count={g.items.length}
                  heartbeat={pulsingHeaders.has(i)}
                  prefersReducedMotion={false}
                  isActive={i === active}
                  settledInView={settledInView}
                />
                <IconStrip
                  items={g.items}
                  pulsingIcons={pulsingIcons}
                  activeSlug={activeSlug}
                  iconHandlers={iconHandlers}
                  rowRef={(el) => {
                    rowRefs.current[i] = el;
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SkillsCard({ username }) {
  const cardRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  // Hover-capable (mouse / iPad+trackpad) → hover morphs; touch-only → tap morphs.
  // Reactive: flips live when a Magic Keyboard is attached/removed.
  const canHover = usePointerCapability();

  // No hardcoded seed — the grid is sourced ENTIRELY from the live GitHub crawl.
  // `emptyCategories()` (client-safe) replaces the old `categorizeSkills([])`,
  // which only built this empty shape but dragged the heavy detection module
  // (SKILL_MAP + the ~3.4k Simple Icons catalog) into the client bundle.
  const [categories, setCategories] = useState(() => emptyCategories());
  const [loaded, setLoaded] = useState(false);
  // True ONLY when the rendered grid came from a genuine live crawl THIS load.
  const [isLive, setIsLive] = useState(false);

  // Entry-cycle trigger: `settledInView` drives the (replayable) entrance and
  // `isInView` gates the banner / total count-up.
  const { isInView, settledInView } = useViewportCountTrigger(cardRef, {
    amount: 0.3,
    margin: "-50px",
  });

  const cardV = prefersReducedMotion ? noMotion : cardVariants;
  const headerV = prefersReducedMotion ? noMotion : headerVariants;

  // Refresh guard (10-min TTL): use the last cached payload if fresh, otherwise
  // fetch /api/github-skills live. Then KEEP the grid live for the whole
  // session: a 1-min ticker (plus a tab-return check) refetches whenever the
  // last sync is older than the TTL, so a repo created while the page sits open
  // surfaces within ~a TTL — new counts/rows land and the update signal
  // heartbeats the affected icons, no reload needed.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    // When this mount last obtained data (cache read or fetch) — the ticker's
    // staleness gate. Stamped optimistically before a background fetch so a
    // slow response can't overlap with the next tick's; a failed background
    // attempt simply waits out another TTL.
    let lastSyncMs = 0;

    const applyCategories = (next) => {
      if (cancelled || !next || typeof next !== "object") return;
      setCategories(next);
      setLoaded(true);
    };

    const fetchLive = (isBackground) => {
      fetch(`/api/github-skills?username=${encodeURIComponent(username ?? "")}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled) return;
          if (!data?.categories) {
            if (!isBackground) {
              setLoaded(true);
              setIsLive(false);
            }
            return;
          }
          // A background refresh must never DEGRADE a populated grid: a GitHub
          // outage mid-session returns the empty `_fallback` payload, and
          // applying it would wipe every icon the user is looking at. Keep the
          // current data; the next cycle retries. (The initial load still
          // applies whatever arrives — nothing is on screen yet.)
          const hasAny = Object.values(data.categories).some(
            (items) => Array.isArray(items) && items.length > 0,
          );
          if (isBackground && (data._fallback || !hasAny)) return;
          lastSyncMs = Date.now();
          applyCategories(data.categories);
          setIsLive(!data._fallback);
          try {
            window.localStorage.setItem(LAST_FETCHED_KEY, String(Date.now()));
            window.localStorage.setItem(CACHE_KEY, JSON.stringify(data.categories));
          } catch {
            // Quota / private mode — we lose the cache but the grid renders.
          }
        })
        .catch(() => {
          if (!cancelled && !isBackground) {
            setLoaded(true);
            setIsLive(false);
          }
        });
    };

    let lastFetched = null;
    let cached = null;
    try {
      lastFetched = window.localStorage.getItem(LAST_FETCHED_KEY);
      cached = window.localStorage.getItem(CACHE_KEY);
    } catch {
      // Storage blocked (private mode) — fall through to a live fetch.
    }

    // Coerce first and guard non-finite values: a corrupt / hand-edited
    // `lastFetched` (e.g. "abc") yields NaN, and every NaN comparison is false —
    // so the old `Date.now() - Number(lastFetched) > TTL` test would read as
    // "fresh" forever and suppress all live refreshes. A missing/empty value
    // coerces to 0, which is correctly treated as stale → refresh.
    const lastFetchedMs = Number(lastFetched);
    const needsRefresh =
      !Number.isFinite(lastFetchedMs) || Date.now() - lastFetchedMs > CACHE_TTL_MS;

    let servedFromCache = false;
    if (!needsRefresh && cached) {
      try {
        applyCategories(JSON.parse(cached));
        if (!cancelled) setIsLive(false);
        // Inherit the cached payload's age so the first background refresh
        // fires a TTL after the ORIGINAL fetch, not a TTL after this mount.
        lastSyncMs = lastFetchedMs;
        servedFromCache = true;
      } catch {
        // Corrupt cache — fall through to a live fetch.
      }
    }
    if (!servedFromCache) fetchLive(false);

    // In-session liveness. A 1-min ticker (not one big TTL interval) so wake-
    // from-sleep and long-hidden tabs re-sync within a minute of mattering; the
    // visibilitychange listener makes returning to the tab check immediately.
    // Hidden tabs never fetch — the wave/heartbeat would play unseen.
    const maybeBackgroundRefresh = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (Date.now() - lastSyncMs < CACHE_TTL_MS) return;
      lastSyncMs = Date.now();
      fetchLive(true);
    };
    const ticker = setInterval(maybeBackgroundRefresh, 60_000);
    document.addEventListener("visibilitychange", maybeBackgroundRefresh);

    return () => {
      cancelled = true;
      clearInterval(ticker);
      document.removeEventListener("visibilitychange", maybeBackgroundRefresh);
    };
  }, [username]);

  // Flat, ordered skill list — the diff/fingerprint unit the signal hook needs.
  const flatSkills = useMemo(() => flattenCategories(categories), [categories]);

  // Non-empty category groups in CATEGORY_ORDER.
  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({ category, items: categories[category] ?? [] })).filter(
        (g) => g.items.length > 0,
      ),
    [categories],
  );

  // Change-aware banner — per-device, same model as the Languages card. Also
  // surfaces the ADDED icons (banner + header + icon beat) and the icons whose
  // repo usage CHANGED (icon beat only — same heartbeat, no banner) so the
  // stage can pulse them (item 4).
  const { pendingMessage, addedSkills, changedSkills, consume, clearAdded } =
    useSkillsUpdateSignal(flatSkills);
  const [bannerMessage, setBannerMessage] = useState(null);
  // True from the moment the banner's message clears until its exit animation
  // has fully finished (UpdateBanner.onExitComplete). Folded into `bannerVisible`
  // below so the SkillsStage heartbeat stays gated through the fade-out — the
  // banner is a full-card blur overlay whose per-character exit lingers
  // ~0.5–0.75s after the state clears, so starting the pulse on the state edge
  // alone would play its first frames under the still-exiting banner.
  const [bannerExiting, setBannerExiting] = useState(false);
  // Slugs pending a heartbeat — added icons AND icons with updated repo data —
  // each pulses once when the user scrolls to it. Only the ADDED subset also
  // beats its category header (the header's icon count moved for those).
  const pulseSlugs = useMemo(
    () => new Set([...addedSkills, ...changedSkills].map((a) => a.slug)),
    [addedSkills, changedSkills],
  );
  const headerPulseSlugs = useMemo(() => new Set(addedSkills.map((a) => a.slug)), [addedSkills]);

  useEffect(() => {
    if (!pendingMessage || !isInView) return;
    setBannerMessage(pendingMessage);
    consume();
  }, [pendingMessage, isInView, consume]);

  useEffect(() => {
    if (!bannerMessage) return undefined;
    const timer = setTimeout(() => {
      setBannerMessage(null);
      // Hold `bannerVisible` until the overlay has fully animated out; cleared by
      // UpdateBanner's onExitComplete below.
      setBannerExiting(true);
    }, BANNER_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [bannerMessage]);

  const skillCount = flatSkills.length;

  // Count-up for the technologies total — the SAME viewport-driven tween shared
  // across the about page's counters.
  const countRef = useRef(null);
  useViewportCountUp(countRef, {
    to: skillCount,
    inView: isInView,
    prefersReducedMotion,
  });

  return (
    <motion.div
      ref={cardRef}
      variants={cardV}
      initial="hidden"
      animate={settledInView ? "visible" : "hidden"}
      className="repo-card-breathe rounded-lg p-6 w-full relative overflow-hidden h-full"
    >
      <UpdateBanner
        message={bannerMessage}
        visible={Boolean(bannerMessage)}
        srPrefix="Skills update: "
        variant="orange"
        onExitComplete={() => setBannerExiting(false)}
      />

      <motion.div variants={headerV} className="mb-4">
        <AnimatedTitle text="Skills & Technologies" play={settledInView} />
        <p
          className="flex items-center gap-1.5 text-[10px] md:text-xs uppercase tracking-[0.18em]"
          style={{ color: "rgba(255, 170, 42, 0.6)", textShadow: "none" }}
        >
          {!loaded ? (
            <span>Syncing with GitHub…</span>
          ) : skillCount > 0 ? (
            <>
              <span>
                <span ref={countRef}>{prefersReducedMotion ? skillCount : 0}</span>{" "}
                {skillCount === 1 ? "technology" : "technologies"}
              </span>
              {isLive && (
                <>
                  <span aria-hidden="true">·</span>
                  <motion.span
                    aria-hidden="true"
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: "#ff6d05", boxShadow: "0 0 6px #ff6d05" }}
                    animate={
                      prefersReducedMotion ? undefined : { opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }
                    }
                    transition={
                      prefersReducedMotion ? undefined : { duration: 2, repeat: Infinity, ease: "easeInOut" }
                    }
                  />
                  <span>live from GitHub</span>
                </>
              )}
            </>
          ) : (
            <span>No skills detected</span>
          )}
        </p>
      </motion.div>

      {groups.length === 0 ? (
        // Live-only grid: while the crawl is in flight (or returned nothing) a
        // pulsing-dot line stands in — no hardcoded fallback set.
        <div
          className="flex items-center gap-2 py-6 text-[11px] uppercase tracking-[0.18em]"
          style={{ color: "rgba(255, 170, 42, 0.6)" }}
        >
          <motion.span
            aria-hidden="true"
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "#ff6d05", boxShadow: "0 0 6px #ff6d05" }}
            animate={prefersReducedMotion ? undefined : { opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }}
            transition={prefersReducedMotion ? undefined : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
          {loaded ? "No skills detected in your repositories" : "Fetching skills from GitHub…"}
        </div>
      ) : (
        <SkillsStage
          groups={groups}
          settledInView={settledInView}
          prefersReducedMotion={prefersReducedMotion}
          pulseSlugs={pulseSlugs}
          headerPulseSlugs={headerPulseSlugs}
          onPulsed={clearAdded}
          bannerVisible={Boolean(bannerMessage) || Boolean(pendingMessage) || bannerExiting}
          canHover={canHover}
        />
      )}
    </motion.div>
  );
}
