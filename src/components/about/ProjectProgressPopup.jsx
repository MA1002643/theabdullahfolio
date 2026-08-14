"use client";

import { animate, AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Lock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useProjectProgress } from "@/hooks/useProjectProgress";
import { useViewportCountTrigger } from "@/hooks/useViewportCountTrigger";
import { PROJECT_CATEGORY_COLORS } from "@/lib/categories";
import { formatAge } from "@/utils/formatAge";

// ── Scroll-reveal cascade — the SAME entrance grammar as the Experience
// Breakdown modal (sections slide up, list rows slide in from the left,
// staggered), triggered as each region scrolls into the dialog's OWN scroll
// container so the telemetry comes alive as you move through it.
const revealUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 20 } },
};
// Rows self-reveal on viewport entry (whileInView, once:false) instead of
// inheriting a parent stagger — the lists are capped inner scrollers, so a
// one-shot container stagger would leave rows below the list's own fold
// pre-revealed. `visible` takes a per-row delay via `custom`, recreating
// the 0.06 cascade whenever a page of rows enters together.
const revealRow = {
  hidden: { opacity: 0, x: -16 },
  visible: (delay = 0) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.45, ease: "easeOut", delay },
  }),
};
// Reduced-motion no-op for every reveal variant above.
const revealNoMotion = {
  hidden: { opacity: 1, x: 0, y: 0 },
  visible: { opacity: 1, x: 0, y: 0 },
};

// Completion tiers ride the site's warm "fire" ramp instead of the generic
// red/amber/green traffic light: the further along a board is, the HOTTER its
// ring burns — cool tan → soft gold → amber → the vivid ember every hero
// digit on the about page already wears. Same 5-tone family as
// PROJECT_CATEGORY_COLORS, so progress and category encodings read as one
// system rather than two competing palettes.
const tierColor = (percent) => {
  if (percent >= 80) return "#ff6d05";
  if (percent >= 50) return "#ffaa2a";
  if (percent >= 20) return "#ffd27d";
  return "#d4af7a";
};

// Board-column colours for the expanded per-project breakdown. Every board
// defines its OWN column set (Todo/In Progress/Done vs Backlog/Ready/In
// review/…/Done), so colours map by column name onto the site's warm ramp —
// the further along the pipeline, the hotter: Done burns ember (it's the
// completion numerator), review/progress glow gold/amber, queued work sits
// tan, and backlog stays a faint parchment — unstarted work reads as empty
// track, mirroring how every split bar on the page draws its track. A column
// name outside the map (a future custom column, or parked states like
// Blocked / On Hold) gets the palette's cool tan rather than a foreign hue.
const DONE_STATUS_NAMES = new Set(["done", "complete", "completed", "shipped"]);
const STATUS_COLORS = new Map([
  ["done", "#ff6d05"],
  ["complete", "#ff6d05"],
  ["completed", "#ff6d05"],
  ["shipped", "#ff6d05"],
  ["in progress", "#ffaa2a"],
  ["in review", "#ffd27d"],
  ["ready", "#d4af7a"],
  ["todo", "#d4af7a"],
  ["to do", "#d4af7a"],
  ["backlog", "rgba(244, 227, 184, 0.18)"],
  ["no status", "rgba(244, 227, 184, 0.18)"],
]);
const statusColor = (name) => STATUS_COLORS.get(name.toLowerCase()) ?? "#b8946a";
// The faint parchment tones vanish as text — counts for those columns fall
// back to the standard amber body colour instead.
const statusCountColor = (name) => {
  const color = statusColor(name);
  return color.startsWith("rgba") ? null : color;
};

// Generic numeric count-up — same animate()/viewport-trigger pattern as the
// Experience modal's AnimatedNumber so every figure in both dialogs shares
// one easing curve and duration.
function AnimatedNumber({ value }) {
  const nodeRef = useRef(null);
  const sectionRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const { playToken } = useViewportCountTrigger(sectionRef, { amount: 0.3 });

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    if (prefersReducedMotion) {
      node.textContent = String(value);
      return;
    }
    if (playToken === 0) return;
    const controls = animate(0, value, {
      duration: 1.2,
      onUpdate: (v) => {
        node.textContent = v.toFixed(0);
      },
    });
    return () => controls.stop();
  }, [value, playToken, prefersReducedMotion]);

  return (
    <span ref={sectionRef} className="inline-block tabular-nums">
      <span ref={nodeRef}>{prefersReducedMotion ? value : 0}</span>
    </span>
  );
}

// Footer sync age in the maintenance header's digit grammar (RelativeTime's
// split): every digit run renders in flat ember, the unit text in the
// footer's own colour — so "7h 03m ago" reads like the header's "7s ago",
// just with formatAge's two-part precision. The parts come from a fixed
// split of a formatter this component owns, so index keys are stable.
function SyncAge({ iso, now }) {
  return (
    <span className="tabular-nums">
      {formatAge(iso, now)
        .split(/(\d+)/)
        .map((part, i) =>
          /^\d+$/.test(part) ? (
            <span key={i} className="font-semibold" style={{ color: "#ff6d05", textShadow: "none" }}>
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
    </span>
  );
}

// Portfolio-wide completion donut. Single arc on the same 180-viewBox /
// r=70 / 14-stroke geometry as the Experience modal's donut so the two
// dialogs' hero rings are visually interchangeable; the stroke ramps soft
// gold → vivid ember along the arc, echoing the page's fire gradient.
function OverallRing({ percent }) {
  const prefersReducedMotion = useReducedMotion();
  const radius = 70;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius;
  // Rounded caps overshoot the path end by half the stroke width; keep a
  // sliver of track visible at 100% so the seam never looks glitched.
  const dash = Math.min(percent, 99.2) / 100 * circumference;

  return (
    <div className="relative mx-auto w-36 h-36 sm:w-44 sm:h-44 flex-shrink-0">
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 180 180"
        className="-rotate-90 block"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="progress-ember-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffd27d" />
            <stop offset="100%" stopColor="#ff6d05" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="rgba(244, 227, 184, 0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Arc — starts at 12 o'clock (after the SVG -rotate-90) */}
        <motion.circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="url(#progress-ember-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          initial={prefersReducedMotion ? {} : { strokeDashoffset: dash }}
          animate={prefersReducedMotion ? {} : { strokeDashoffset: 0 }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.15 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className="text-3xl sm:text-4xl font-semibold tabular-nums"
          style={{ color: "#ff6d05", textShadow: "none" }}
        >
          <AnimatedNumber value={percent} />%
        </span>
        {/* Stacked so the label stays inside the ring's inner hole — on one
            line it's wider than the hole and overlaps the arc. */}
        <span className="text-[10px] uppercase tracking-[0.18em] text-fire-amber mt-1 text-center leading-snug">
          <span className="block">board items</span>
          <span className="block">done</span>
        </span>
      </div>
    </div>
  );
}

// Per-project completion ring — the hero donut at legend scale. `tracked`
// false renders the bare track: an empty ring honestly says "no measurement"
// where a 0% arc would assert one. The arc REDRAWS on every viewport entry
// (whileInView, once:false against the dialog's scroller) — the same replay
// the row's pipeline bar plays, so the two progress drawings always sweep
// together.
function MiniRing({ percent, color, tracked, containerRef }) {
  const prefersReducedMotion = useReducedMotion();
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(percent, 99) / 100) * circumference;

  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90 flex-shrink-0" aria-hidden="true">
      <circle
        cx="20"
        cy="20"
        r={radius}
        fill="none"
        stroke="rgba(244, 227, 184, 0.08)"
        strokeWidth="3"
      />
      {tracked && percent > 0 && (
        <motion.circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          initial={prefersReducedMotion ? {} : { strokeDashoffset: dash }}
          whileInView={prefersReducedMotion ? {} : { strokeDashoffset: 0 }}
          viewport={{ once: false, amount: 0.5, root: containerRef }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.25 }}
          // 8-digit hex: `59` ≈ 0.35 alpha — a whisper of heat, matching the
          // restrained 0.45-alpha glows on the page's split bars.
          style={{ filter: `drop-shadow(0 0 4px ${color}59)` }}
        />
      )}
    </svg>
  );
}

// One category's share of the portfolio — dot + label + animated count on
// the left, proportional fill on the right of the same 1.5-track every split
// bar on the about page uses. Colour comes from the shared count-desc
// palette so this list and the card's split bar always agree.
function CategoryRow({ label, count, total, color, index, containerRef }) {
  const prefersReducedMotion = useReducedMotion();
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <motion.li
      variants={prefersReducedMotion ? revealNoMotion : revealRow}
      initial="hidden"
      whileInView="visible"
      viewport={{ root: containerRef, once: false, amount: 0.35 }}
      custom={(index % 5) * 0.06}
      className="grid gap-1.5 py-1.5"
      style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
    >
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em]" style={{ color: "#d4af7a" }}>
        <span
          aria-hidden="true"
          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: color }}
        />
        <span className="text-fire-amber">{label}</span>
      </span>
      <span className="text-xs tabular-nums self-center" style={{ color: "#ff6d05", textShadow: "none" }}>
        <AnimatedNumber value={count} />
      </span>
      <div
        className="col-span-2 h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(244, 227, 184, 0.05)" }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}73` }}
          initial={prefersReducedMotion ? { width: `${pct}%` } : { width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: false, amount: 0.5, root: containerRef }}
          transition={{ duration: 0.9, delay: 0.2 + index * 0.12, ease: "easeOut" }}
        />
      </div>
    </motion.li>
  );
}

// Board-column pipeline for an expanded project row. Segments run Done
// first, then the remaining columns most-advanced-first (reverse board
// order), so the ember "done" mass visually pushes the faint backlog off
// the end of the track as a board matures. Every segment REDRAWS on each
// viewport entry — width 0 → share with a small left-to-right stagger,
// the same once:false replay (against the dialog's own scroller) the
// category bars use, so the two bar families share one entrance grammar.
function PipelineBar({ project, containerRef }) {
  const prefersReducedMotion = useReducedMotion();
  const total = project.totalItems;
  if (total === 0) return null;
  const seg = (n) => `${(n / total) * 100}%`;
  const isDone = (c) => DONE_STATUS_NAMES.has(c.name.toLowerCase());
  const ordered = [
    ...project.columns.filter(isDone),
    ...project.columns.filter((c) => !isDone(c)).reverse(),
  ];

  return (
    <div
      aria-hidden="true"
      className="h-1.5 rounded-full overflow-hidden flex"
      style={{ background: "rgba(244, 227, 184, 0.05)" }}
    >
      {ordered
        .filter((c) => c.count > 0)
        .map((c, i) => (
          <motion.span
            key={c.name}
            style={{ background: statusColor(c.name) }}
            initial={prefersReducedMotion ? { width: seg(c.count) } : { width: 0 }}
            whileInView={{ width: seg(c.count) }}
            viewport={{ once: false, amount: 0.5, root: containerRef }}
            transition={{ duration: 0.9, delay: 0.15 + i * 0.08, ease: "easeOut" }}
          />
        ))}
    </div>
  );
}

// A single project row: ring + name/category on a disclosure button, live
// percentage on the right, and an expandable board-pipeline panel. The whole
// row is ONE <button> (no nested interactives — invalid HTML and a focus
// trap hazard); the outbound project-board link lives inside the expanded
// panel instead. Expansion is CONTROLLED by the parent (accordion: opening
// a row closes its sibling), so a row carries no open/closed state of its
// own.
function ProjectRow({ project, containerRef, expanded, onToggle, index }) {
  const prefersReducedMotion = useReducedMotion();
  const color = tierColor(project.completionPercent);
  const { tracked } = project;
  // `boardUrl` arrives on the payload only for PUBLIC Projects v2 boards
  // (the server checks `ProjectV2.public` live) — a link to a private board
  // 404s for every visitor, the data.js no-dead-links rule.
  const boardUrl = project.boardUrl ?? null;

  const statusLabel = tracked
    ? `${project.completionPercent}% complete, ${project.doneItems} of ${project.totalItems} board items done`
    : project.repo
      ? "progress sync unavailable"
      : "not tracked";

  return (
    <motion.li
      variants={prefersReducedMotion ? revealNoMotion : revealRow}
      initial="hidden"
      whileInView="visible"
      viewport={{ root: containerRef, once: false, amount: 0.35 }}
      custom={(index % 5) * 0.06}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${project.name}, ${project.category}. ${statusLabel}. Toggle board breakdown.`}
        // Hover tint only while CLOSED — an open row is already the active
        // focus of the list, so re-tinting it on hover would double-signal.
        // Ember 5% — the same wash the Most Active Repository card's rows
        // hover with, so repo-ish list rows read as one family across cards.
        className={`w-full flex items-center gap-3 py-2 px-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/40 transition-colors ${expanded ? "" : "hover:bg-[#ff6d05]/5"}`}
      >
        <MiniRing percent={project.completionPercent} color={color} tracked={tracked} containerRef={containerRef} />
        <span className="flex-1 min-w-0 text-left">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-sm text-fire-amber leading-snug">{project.name}</span>
            {project.private && (
              <Lock aria-hidden="true" className="w-3 h-3 flex-shrink-0 text-[#d4af7a] opacity-70" strokeWidth={2} />
            )}
          </span>
          <span className="block text-[10px] uppercase tracking-[0.16em]" style={{ color: "#d4af7a" }}>
            {project.category}
            {!tracked && <span className="normal-case tracking-normal italic opacity-70"> · sync unavailable</span>}
          </span>
        </span>
        <span className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: tracked ? color : "#d4af7a", textShadow: "none" }}>
          {tracked ? (
            <>
              <AnimatedNumber value={project.completionPercent} />%
            </>
          ) : (
            "—"
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`w-4 h-4 flex-shrink-0 text-[#d4af7a] transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.3, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="pl-[52px] pr-8 pb-3 space-y-2">
              {tracked ? (
                <>
                  <PipelineBar project={project} containerRef={containerRef} />
                  {/* Legend in the BOARD'S own column order — the same
                      left-to-right the user sees on github.com — including
                      empty columns, exactly as the board renders them. */}
                  <div
                    className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.14em] tabular-nums"
                    style={{ color: "#d4af7a" }}
                  >
                    {project.columns.map((c) => (
                      <span key={c.name} className="flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="inline-block w-1.5 h-1.5 rounded-full"
                          style={{ background: statusColor(c.name) }}
                        />
                        {c.name}{" "}
                        {statusCountColor(c.name) ? (
                          <span style={{ color: statusCountColor(c.name) }}>
                            <AnimatedNumber value={c.count} />
                          </span>
                        ) : (
                          <span className="text-fire-amber">
                            <AnimatedNumber value={c.count} />
                          </span>
                        )}
                      </span>
                    ))}
                    <span>
                      Total{" "}
                      <span className="text-fire-amber">
                        <AnimatedNumber value={project.totalItems} />
                      </span>
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-fire-amber opacity-80">
                  {project.repo
                    ? "This board couldn’t be synced right now — live counts return with the next refresh."
                    : "No GitHub project board is linked to this project."}
                </p>
              )}
              {boardUrl && (
                <a
                  href={boardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs text-[#ffd27d] hover:text-[#ff6d05] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/40 rounded transition-colors"
                >
                  View project board →
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

// Layout-preserving shimmer while the very first fetch is in flight (only
// reachable on a cold first visit with an empty localStorage — every later
// open is hydrated before the dialog mounts).
function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="flex justify-center">
        <div className="w-36 h-36 rounded-full bg-white/5" />
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={`cat-${i}`} className="space-y-2">
          <div className="h-2.5 w-24 bg-white/5 rounded" />
          <div className="h-1.5 w-full bg-white/5 rounded-full" />
        </div>
      ))}
      {[...Array(5)].map((_, i) => (
        <div key={`row-${i}`} className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/5 flex-shrink-0" />
          <div className="flex-1 h-3 bg-white/5 rounded" />
          <div className="w-8 h-3 bg-white/5 rounded" />
        </div>
      ))}
    </div>
  );
}

// Focusable element selector for the focus trap — same set as the
// Experience modal.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Project Progress popup — opens from the "completed projects" card on the
 * about page (issue #48). Live per-project completion derived from each
 * project's GitHub Projects v2 BOARD — per-column item counts in the
 * board's own order, percent = Done / total items — plus a category
 * breakdown, a portfolio-wide completion donut, and a last-synced footer.
 * Data arrives via useProjectProgress (fetched at page mount + every 12 h,
 * last-good persisted), so the dialog almost always opens already populated.
 *
 * Dialog chrome — a11y baseline, body scroll lock (incl. the iOS
 * position:fixed technique), Escape/backdrop close, focus trap + focus
 * restoration, dvh sizing and the foreground-return scrollbar repaint — is
 * a 1:1 mirror of ExperienceBreakdownModal; see that file for the full
 * rationale on each block.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {React.RefObject<HTMLElement>} props.triggerRef - element that opened the popup
 */
export default function ProjectProgressPopup({ open, onClose, triggerRef }) {
  const prefersReducedMotion = useReducedMotion();
  const { data, failed, refetch } = useProjectProgress();
  const dialogRef = useRef(null);
  const scrollRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Accordion state for the Per-project list: at most ONE row expanded —
  // opening a row closes whichever sibling was open. Reset on close so the
  // dialog always reopens with every row collapsed, matching its first-open
  // state.
  const [expandedId, setExpandedId] = useState(null);
  useEffect(() => {
    if (!open) setExpandedId(null);
  }, [open]);

  // Ticking "now" for the live sync-age footer — the maintenance header's
  // adaptive cadence (RelativeTime's self-rescheduling timeout, not a fixed
  // interval): every second while formatAge still shows a seconds component
  // (under an hour), every 30 s in the hours band (the minutes part moves),
  // every 30 min beyond — so the age visibly counts up at whatever grain
  // the format exposes, without burning renders past it.
  const [now, setNow] = useState(() => Date.now());
  const lastSynced = data?.lastSynced ?? null;
  useEffect(() => {
    if (!open || !lastSynced) return undefined;
    setNow(Date.now());
    const syncMs = Date.parse(lastSynced);
    const nextDelay = () => {
      const sec = Math.max(0, (Date.now() - syncMs) / 1000);
      if (sec < 3600) return 1000;
      if (sec < 86400) return 30 * 1000;
      return 30 * 60 * 1000;
    };
    let timeoutId;
    const schedule = () => {
      timeoutId = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, nextDelay());
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [open, lastSynced]);

  // Scrollbar repaint on foreground return — the expanded rows' issue-board
  // links open in a new tab, the exact trigger for the stale-grey-scrollbar
  // repaint bug documented at length in ExperienceBreakdownModal.
  useEffect(() => {
    if (!open) return undefined;
    let rafA = 0;
    let rafB = 0;
    let timer = 0;
    const repaintScrollbar = () => {
      const node = scrollRef.current;
      if (!node) return;
      const top = node.scrollTop;
      node.style.scrollbarColor = "#ff6d05 #222";
      const prevOverflow = node.style.overflowY;
      node.style.overflowY = "hidden";
      void node.offsetHeight; // reflow so the toggle isn't coalesced
      node.style.overflowY = prevOverflow || "auto";
      node.scrollTop = top;
    };
    const schedule = () => {
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
      clearTimeout(timer);
      rafA = requestAnimationFrame(() => {
        rafB = requestAnimationFrame(repaintScrollbar);
      });
      timer = setTimeout(repaintScrollbar, 80);
    };
    const onPageShow = (e) => {
      if (e.persisted) schedule();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
      clearTimeout(timer);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [open]);

  // Body scroll lock — overflow:hidden everywhere plus position:fixed on
  // phone viewports (iOS Safari ignores overflow:hidden for touch). See
  // ExperienceBreakdownModal for the full write-up.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const isMobile = window.matchMedia("(max-width: 640px)").matches;
    const scrollY = window.scrollY;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };

    body.style.overflow = "hidden";
    if (isMobile) {
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
    }
    body.dataset.modalOpen = "true";

    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      delete body.dataset.modalOpen;
      // position:fixed resets the document scroll to 0 — put it back.
      if (isMobile) window.scrollTo(0, scrollY);
    };
  }, [open]);

  // Escape closes — document-level so it fires from any descendant.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus management: close button on open; back to the trigger card on
  // close — WAI-ARIA dialog pattern.
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const trigger = triggerRef?.current;
    return () => {
      if (trigger && document.body.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [open, triggerRef]);

  // Focus trap — re-queried per Tab so late-mounting content (expanded rows,
  // retry button) joins the cycle.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handler = (e) => {
      if (e.key !== "Tab") return;
      const focusables = dialog.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", handler);
    return () => dialog.removeEventListener("keydown", handler);
  }, [open]);

  // Reduced-motion-aware reveal variants; regions reveal as they scroll into
  // the dialog (root = the dialog's own scroller). Rows manage their own
  // whileInView reveal (see revealRow), so there is no list-level variant.
  const upV = prefersReducedMotion ? revealNoMotion : revealUp;
  const revealViewport = { root: scrollRef, once: false, amount: 0.1 };

  // `overallCompletion: null` marks the server's static fallback — structure
  // without measurements (unknown ≠ 0%, the same distinction the experience
  // surfaces draw). The hero ring renders only for a real measurement.
  const hasLiveSync = data?.overallCompletion != null;
  const projects = data?.projects ?? [];
  const categories = data?.categoryBreakdown ?? [];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-progress-title"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            // Shared about-page card chrome + dvh sizing — see
            // ExperienceBreakdownModal for why dvh and why the scrollbar
            // lives on the inner div.
            className="custom-bg-abt rounded-2xl w-full max-w-2xl max-h-[88vh] text-white relative"
            style={{
              maxHeight: "88dvh",
              filter: "drop-shadow(0 24px 60px rgba(0, 0, 0, 0.6))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="repo-card-breathe rounded-xl overflow-hidden w-full h-full">
              <div
                ref={scrollRef}
                className="max-h-[88vh] overflow-y-auto overscroll-contain p-6 sm:p-8"
                style={{
                  maxHeight: "88dvh",
                  scrollbarColor: "#ff6d05 #222",
                  scrollbarWidth: "thin",
                }}
              >
                <header className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-[#ffaa2a] mb-1">
                      Delivery telemetry
                    </p>
                    <h2
                      id="project-progress-title"
                      className="text-xl sm:text-2xl font-semibold"
                      style={{ color: "#ff6d05", textShadow: "none" }}
                    >
                      Project progress
                    </h2>
                  </div>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={onClose}
                    aria-label="Close project progress"
                    className="custom-bg flex-shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-full text-[#d4af7a] hover:text-[#ff6d05] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50"
                  >
                    <X aria-hidden="true" className="w-4 h-4" strokeWidth={2} />
                  </button>
                </header>

                {!data ? (
                  failed ? (
                    <div className="py-10 text-center space-y-4">
                      <p className="text-sm text-fire-amber">
                        Couldn’t reach the progress sync right now.
                      </p>
                      <button
                        type="button"
                        onClick={refetch}
                        className="custom-bg inline-flex items-center px-4 py-2 rounded-full text-xs uppercase tracking-[0.16em] text-[#ffd27d] hover:text-[#ff6d05] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50 transition-colors"
                      >
                        Retry sync
                      </button>
                    </div>
                  ) : (
                    <LoadingSkeleton />
                  )
                ) : (
                  <>
                    {/* Hero — portfolio donut + headline counters. Only a
                        real measurement earns the ring; the fallback payload
                        gets an honest "sync unavailable" note instead. */}
                    <motion.div
                      variants={upV}
                      initial="hidden"
                      whileInView="visible"
                      viewport={revealViewport}
                      className="flex flex-col sm:flex-row items-center gap-6 mb-8"
                    >
                      {hasLiveSync ? (
                        <>
                          <OverallRing percent={data.overallCompletion} />
                          {/* Phone: the two counters sit SIDE BY SIDE with the
                              vertical divider between them (stacking them under
                              the ring made the hero a tall totem); sm+ restores
                              the stacked layout with the horizontal rule. Two
                              divider elements because elite-divider(-v) are
                              custom classes responsive prefixes can't retarget. */}
                          <dl className="flex-1 w-full flex items-stretch justify-evenly gap-4 sm:block sm:space-y-4">
                            <div className="text-center sm:text-left">
                              <dt className="text-[10px] uppercase tracking-[0.18em] text-[#ffaa2a] mb-1">
                                Items done
                              </dt>
                              <dd className="text-2xl sm:text-3xl font-semibold tabular-nums" style={{ color: "#ff6d05", textShadow: "none" }}>
                                <AnimatedNumber value={data.doneItems} />
                                <span className="text-sm sm:text-base text-fire-amber font-normal"> of {data.totalItems}</span>
                              </dd>
                            </div>
                            <div aria-hidden="true" className="w-px self-stretch elite-divider-v sm:hidden" />
                            <div aria-hidden="true" className="hidden sm:block h-px elite-divider" />
                            <div className="text-center sm:text-left">
                              <dt className="text-[10px] uppercase tracking-[0.18em] text-[#ffaa2a] mb-1">
                                Boards live
                              </dt>
                              {/* "9 of 9" is redundant when every board is
                                  syncing — the fraction only carries
                                  information when some boards AREN'T live
                                  (untracked or a partial GraphQL failure), so
                                  the "of N" form is reserved for that case. */}
                              <dd className="text-2xl sm:text-3xl font-semibold tabular-nums" style={{ color: "#ff6d05", textShadow: "none" }}>
                                <AnimatedNumber value={data.trackedCount} />
                                <span className="text-sm sm:text-base text-fire-amber font-normal">
                                  {" "}
                                  {data.trackedCount === data.totalProjects
                                    ? `project${data.trackedCount === 1 ? "" : "s"}`
                                    : `of ${data.totalProjects} projects`}
                                </span>
                              </dd>
                            </div>
                          </dl>
                        </>
                      ) : (
                        <p className="text-sm text-fire-amber opacity-80">
                          Live sync is unavailable right now — showing the
                          portfolio’s structure; percentages return with the
                          next successful refresh.
                        </p>
                      )}
                    </motion.div>

                    {/* Category breakdown — static truth from data.js, so it
                        renders on every payload variant. */}
                    <section className="mb-7">
                      <motion.header
                        variants={upV}
                        initial="hidden"
                        whileInView="visible"
                        viewport={revealViewport}
                        className="flex items-center justify-between mb-2"
                      >
                        <h3 className="text-[11px] uppercase tracking-[0.2em] text-[#ffaa2a]">
                          By category
                        </h3>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-[#d4af7a]">
                          {data.totalProjects} projects
                        </span>
                      </motion.header>
                      {/* Capped at ~5 rows: past that the list scrolls WITHIN
                          itself (house thin ember scrollbar), keeping the
                          dialog's own height stable however many categories
                          the data grows. Rows reveal individually as they
                          scroll into view — dialog OR inner list, the
                          observer accounts for both clips. */}
                      {/* Rounded shell OWNS the radius and clips (overflow-
                          hidden) so the inner scroller's scrollbar can't poke
                          square ends past the rounded corners — the same
                          wrapper trick the dialog itself uses around its
                          scroller. */}
                      <div className="custom-bg-abt rounded-lg overflow-hidden">
                      <ul
                        role="list"
                        className={`px-3 py-2 ${
                          categories.length > 5 ? "max-h-60 overflow-y-auto overscroll-contain" : ""
                        }`}
                        style={
                          categories.length > 5
                            ? { scrollbarColor: "#ff6d05 #222", scrollbarWidth: "thin" }
                            : undefined
                        }
                      >
                        {categories.map((c, i) => (
                          <CategoryRow
                            key={c.label}
                            label={c.label}
                            count={c.count}
                            total={data.totalProjects}
                            color={PROJECT_CATEGORY_COLORS[i % PROJECT_CATEGORY_COLORS.length]}
                            index={i}
                            containerRef={scrollRef}
                          />
                        ))}
                      </ul>
                      </div>
                    </section>

                    {/* Per-project completion — the live heart of the popup. */}
                    <section>
                      <motion.header
                        variants={upV}
                        initial="hidden"
                        whileInView="visible"
                        viewport={revealViewport}
                        className="flex items-center justify-between mb-2"
                      >
                        <h3 className="text-[11px] uppercase tracking-[0.2em] text-[#ffaa2a]">
                          Per project
                        </h3>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-[#d4af7a]">
                          Live from GitHub Projects
                        </span>
                      </motion.header>
                      {/* Same 5-row cap as the category list — with eleven
                          boards the list scrolls within itself, so the
                          dialog stays one calm height and rows (ring, bar,
                          counts) replay their entrances as they scroll
                          through the window. */}
                      {/* Same rounded overflow-hidden shell as the category
                          list — the scrollbar stays inside the corners. */}
                      <div className="custom-bg-abt rounded-lg overflow-hidden">
                      <ul
                        role="list"
                        className={`p-2 space-y-0.5 ${
                          projects.length > 5 ? "max-h-[19rem] overflow-y-auto overscroll-contain" : ""
                        }`}
                        style={
                          projects.length > 5
                            ? { scrollbarColor: "#ff6d05 #222", scrollbarWidth: "thin" }
                            : undefined
                        }
                      >
                        {projects.map((p, i) => (
                          <ProjectRow
                            key={p.id}
                            project={p}
                            containerRef={scrollRef}
                            index={i}
                            expanded={expandedId === p.id}
                            onToggle={() =>
                              setExpandedId((id) => (id === p.id ? null : p.id))
                            }
                          />
                        ))}
                      </ul>
                      </div>
                    </section>

                    {/* Sync footer — provenance + a live relative age, the
                        popup's freshness contract made visible. */}
                    <footer
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-6 pt-3 text-[10px] uppercase tracking-[0.16em]"
                      style={{ color: "#d4af7a", borderTop: "1px solid rgba(244, 227, 184, 0.08)" }}
                    >
                      <span>Auto-synced from GitHub Projects · twice daily</span>
                      <span className="tabular-nums">
                        {data.lastSynced ? (
                          <>
                            Last sync <SyncAge iso={data.lastSynced} now={now} />
                          </>
                        ) : (
                          "Awaiting first sync"
                        )}
                      </span>
                    </footer>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
