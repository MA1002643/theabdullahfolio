'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useStaggeredScrollReveal } from '@/hooks/useStaggeredScrollReveal';
import { animateToTarget } from '@/utils/animationCurves';
import { useNow } from './useNow';
import { formatAge } from '@/utils/formatAge';

// Per-metric breakdown popover for the maintenance header (issue #94).
// Wraps a counter in an accessible dialog trigger:
//   - Mouse: opens after a 120ms intent delay, closes 200ms after leave
//     (grace window covers diagonal travel into the panel).
//   - Keyboard: focus opens immediately, Tab moves into (and traps
//     inside) the panel, Esc closes and restores focus to the trigger.
//   - Touch: tap toggles; tap outside closes.
// The panel is portalled to <body> and positioned `fixed`: the header
// section is overflow-hidden AND animates transforms (framer-motion),
// either of which would clip or re-anchor an in-place absolute panel.
// All viewports float the panel anchored to its trigger — the former
// bottom-docked mobile sheet was replaced (owner feedback): a card
// appearing at the opposite edge of the screen from the tapped counter
// read as disconnected from the interaction.
//
// Visuals + reveal are the about page's "Used in repositories" popover
// (SkillRepoPopover), 1:1: the panel springs up as a unit (opacity + y +
// scale), the header block (eyebrow + count-up title + divider) slides up
// next, then the item rows slide in from the left, staggered — and
// RE-PLAY as they scroll in and out of the list's own viewport via
// useStaggeredScrollReveal. Same custom-bg-abt surface, repo-card-breathe
// inner glow, elite-divider, dot-bullet fire-amber rows.
//
// Items are grouped into one collapsible section per project so the list
// stays bounded as more repos join the tracked set — N projects read as N
// header rows, not N × 10 item rows. Sections behave as an accordion:
// at most ONE project is open at a time (opening another closes the
// previous), and the open section resets when the popover closes.
// `totalsByRepo` maps each project to its true metric total, shown in the
// section header and driving the per-section "+ N more on GitHub" row.
const panelVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 70, damping: 18, delayChildren: 0.1, staggerChildren: 0.07 },
  },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};
// Orchestrates the inner cascade: the header block, then the list.
const contentVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};
// The header block (eyebrow + title + divider) slides up as one unit.
const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 20 } },
};
// Reduced-motion no-op: hidden === visible, no transform — matching the
// source card's reduced-motion behaviour (instant, static panel).
const noMotionVariants = {
  hidden: { opacity: 1, x: 0, y: 0, scale: 1 },
  visible: { opacity: 1, x: 0, y: 0, scale: 1 },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

const OPEN_INTENT_MS = 120;
const CLOSE_GRACE_MS = 200;
const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 8;
const HOVER_QUERY = '(hover: hover) and (pointer: fine)';

// At most one popover open across the header — when a new one opens it
// closes the previous one, so hovering across adjacent counters can't
// stack overlapping panels.
let closeActivePopover = null;

const canHover = () =>
  typeof window !== 'undefined' && window.matchMedia(HOVER_QUERY).matches;

const focusablesIn = (panel) =>
  panel ? Array.from(panel.querySelectorAll('a[href], button:not([disabled])')) : [];

// The headline count — counts up 0 → N with the about page's shared elite
// count-up (animateToTarget, 2s sprint-then-settle), exactly like the
// "N repositories" line in the source popover. `play` gates the start on
// the panel being positioned so the count never burns off-screen. The
// visible digits are aria-hidden; the sr-only summary carries the final
// value for assistive tech.
function MetricCount({ count, play, prefersReducedMotion }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (prefersReducedMotion || !play) {
      node.textContent = `${count}`;
      return undefined;
    }
    return animateToTarget({
      from: 0,
      to: count,
      duration: 2000,
      onUpdate: (v) => {
        node.textContent = `${Math.round(v)}`;
      },
    });
  }, [count, play, prefersReducedMotion]);
  return <span ref={ref}>{prefersReducedMotion ? count : 0}</span>;
}

// `panel` swaps the metric-breakdown content for arbitrary panel JSX
// (e.g. the STATE field's delivery-pipeline legend) while reusing ALL of
// the trigger/positioning/dismiss/single-open mechanics — a second
// floater implementation would drift. `widthClass` narrows the panel for
// short content.
// Stable default for `items` — an inline `= []` default would mint a new
// array identity every render, and `items` sits in the positioning
// effect's dependency list: fresh identity each render + setPos in the
// effect = an infinite layout-effect loop (found the hard way when the
// panel-content STATE popover shipped without an items prop).
const NO_ITEMS = [];

export default function MetricPopover({
  id,
  metricLabel,
  emptyLabel = '',
  count = 0,
  items = NO_ITEMS,
  totalsByRepo = null,
  stale = false,
  reduceMotion = false,
  panel: panelContent = null,
  widthClass = 'w-[min(21rem,calc(100vw-1rem))]',
  underline = true,
  children,
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState(null);

  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const openTimerRef = useRef(null);
  const closeTimerRef = useRef(null);
  // The internal item list is its own scroll container — and the
  // IntersectionObserver root for the row reveals, so rows replay as they
  // scroll in and out of the list's viewport.
  const listScrollRef = useRef(null);
  // Esc restores focus to the trigger, which fires onFocus with keyboard
  // modality — without this latch the popover would instantly reopen.
  const suppressFocusOpenRef = useRef(false);

  // Stable identity so the module-level "one open popover" slot can tell
  // this instance apart from its siblings across renders.
  const closeSelf = useCallback(() => setOpen(false), []);

  // Portal target only exists client-side; flipping `mounted` in an
  // effect keeps server and first client render identical.
  useEffect(() => {
    setMounted(true);
    return () => {
      clearTimeout(openTimerRef.current);
      clearTimeout(closeTimerRef.current);
      if (closeActivePopover === closeSelf) closeActivePopover = null;
    };
  }, [closeSelf]);

  const clearTimers = useCallback(() => {
    clearTimeout(openTimerRef.current);
    clearTimeout(closeTimerRef.current);
  }, []);

  const openNow = useCallback(() => {
    clearTimers();
    if (closeActivePopover && closeActivePopover !== closeSelf) {
      closeActivePopover();
    }
    closeActivePopover = closeSelf;
    setOpen(true);
  }, [closeSelf, clearTimers]);

  const closeNow = useCallback(
    (restoreFocus = false) => {
      clearTimers();
      setOpen(false);
      if (closeActivePopover === closeSelf) closeActivePopover = null;
      if (restoreFocus) {
        // The focus event dispatches synchronously inside .focus(), so the
        // latch is consumed (and reset) before this call returns.
        suppressFocusOpenRef.current = true;
        triggerRef.current?.focus();
        suppressFocusOpenRef.current = false;
      }
    },
    [closeSelf, clearTimers],
  );

  // ── Trigger interactions ────────────────────────────────────────────
  const handleTriggerEnter = () => {
    if (!canHover()) return;
    clearTimeout(closeTimerRef.current);
    if (open) return;
    openTimerRef.current = setTimeout(openNow, OPEN_INTENT_MS);
  };

  const handleTriggerLeave = () => {
    if (!canHover()) return;
    clearTimeout(openTimerRef.current);
    if (open) {
      closeTimerRef.current = setTimeout(() => closeNow(), CLOSE_GRACE_MS);
    }
  };

  const handleClick = () => {
    // Tap (and keyboard Enter/Space) toggles. For hover-capable pointers
    // the popover is already open by the time a click lands, and closing
    // it under the cursor would fight the hover state — so click only
    // ever opens there.
    if (!open) openNow();
    else if (!canHover()) closeNow();
  };

  const handleFocus = (event) => {
    if (suppressFocusOpenRef.current) return;
    // Only keyboard-driven focus auto-opens; mouse/touch focus is handled
    // by hover/click so a tap doesn't open-then-immediately-toggle.
    let keyboardFocus = true;
    try {
      keyboardFocus = event.target.matches(':focus-visible');
    } catch {
      // older engines without :focus-visible — treat focus as keyboard
    }
    if (keyboardFocus) openNow();
  };

  const handleTriggerKeyDown = (event) => {
    if (event.key === 'Tab' && !event.shiftKey && open) {
      const focusables = focusablesIn(panelRef.current);
      if (focusables.length > 0) {
        event.preventDefault();
        focusables[0].focus();
      }
    }
  };

  // ── Panel interactions ──────────────────────────────────────────────
  const handlePanelEnter = () => {
    if (!canHover()) return;
    clearTimeout(closeTimerRef.current);
  };

  const handlePanelLeave = () => {
    if (!canHover()) return;
    closeTimerRef.current = setTimeout(() => closeNow(), CLOSE_GRACE_MS);
  };

  const handlePanelKeyDown = (event) => {
    if (event.key !== 'Tab') return;
    const focusables = focusablesIn(panelRef.current);
    // Zero focusables (pure-text panels like the pipeline legend): let
    // Tab exit naturally — the focusin-outside listener closes the panel.
    // Trapping here would strand keyboard focus in a dead end.
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // ── Global dismissal (Esc anywhere, pointer/focus outside) ──────────
  useEffect(() => {
    if (!open) return undefined;

    const containsTarget = (target) =>
      triggerRef.current?.contains(target) || panelRef.current?.contains(target);

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      const active = document.activeElement;
      closeNow(containsTarget(active));
    };
    const onPointerDown = (event) => {
      if (!containsTarget(event.target)) closeNow();
    };
    const onFocusIn = (event) => {
      if (!containsTarget(event.target)) closeNow();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open, closeNow]);

  // ── Positioning (custom ~30-line floater — no positioning dep) ──────
  // Centered under the trigger, clamped to the viewport; flips above when
  // there's no room below. Recomputed on open, resize, and any scroll
  // (capture phase catches nested scroll containers).
  useLayoutEffect(() => {
    if (!open) return undefined;

    const update = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const rect = trigger.getBoundingClientRect();
      const panelWidth = panel.offsetWidth;
      const panelHeight = panel.offsetHeight;
      const maxLeft = window.innerWidth - panelWidth - VIEWPORT_MARGIN;
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - panelWidth / 2, VIEWPORT_MARGIN),
        Math.max(maxLeft, VIEWPORT_MARGIN),
      );
      let top = rect.bottom + TRIGGER_GAP;
      if (top + panelHeight > window.innerHeight - VIEWPORT_MARGIN) {
        top = Math.max(rect.top - panelHeight - TRIGGER_GAP, VIEWPORT_MARGIN);
      }
      // Functional + bail-when-unchanged: update() fires from scroll,
      // resize, AND a ResizeObserver — returning the same object for an
      // unchanged position keeps those callbacks from scheduling
      // render loops.
      setPos((prev) =>
        prev && prev.top === top && prev.left === left ? prev : { top, left },
      );
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    // The panel changes height as project sections expand/collapse; when
    // it's flipped above the trigger it must re-anchor every frame of the
    // height animation or it would grow down over the trigger.
    const panelResize =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (panelRef.current) panelResize?.observe(panelRef.current);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      panelResize?.disconnect();
    };
  }, [open, items]);

  // Single shared 1s ticker; suspended while closed or with nothing to age.
  const now = useNow(open && items.length > 0);

  // The panel reveal is gated on being positioned so the spring never
  // plays while the panel is still hidden at its pre-measured coordinates.
  const ready = open && Boolean(pos);

  // Staggered, replay-on-scroll reveal for the internal item list — the
  // Used-in-repositories cascade, driven imperatively so rows re-play on
  // every scroll into the list's own viewport.
  useStaggeredScrollReveal(listScrollRef, {
    enabled: ready,
    prefersReducedMotion: reduceMotion,
    resetKey: `${open}-${items.length}`,
  });

  // Group items by repo in first-encounter order — the server dictates
  // ordering (issues arrive grouped per repo, newest-created first within
  // each group; PRs/pushes arrive globally most-recent-first, so their
  // group order follows each repo's freshest item).
  const groups = useMemo(() => {
    const seen = new Map();
    const list = [];
    for (const item of items) {
      let group = seen.get(item.repo);
      if (!group) {
        group = { repo: item.repo, items: [] };
        seen.set(item.repo, group);
        list.push(group);
      }
      group.items.push(item);
    }
    return list;
  }, [items]);
  const projectCount = groups.length;
  const overflow = Math.max(0, (count ?? 0) - items.length);

  // Which project section is open — an accordion: at most one at a time,
  // so the panel height stays bounded and comparing projects means
  // switching, not stacking. Every section starts collapsed; closing the
  // popover resets the accordion for the next open.
  const [expandedRepo, setExpandedRepo] = useState(null);

  useEffect(() => {
    if (!open) setExpandedRepo(null);
  }, [open]);

  const toggleGroup = (repo) => {
    setExpandedRepo((prev) => (prev === repo ? null : repo));
  };

  // Per-section overflow uses the true per-repo total when the server
  // provided one. The flat "+ N more" fallback line only carries whatever
  // the sections couldn't attribute — repos whose items were entirely
  // capped away, or stale payloads that predate `totalsByRepo`.
  const repoTotal = (group) => {
    const total = totalsByRepo?.[group.repo];
    return typeof total === 'number' ? total : group.items.length;
  };
  const attributedOverflow = groups.reduce(
    (sum, group) => sum + Math.max(0, repoTotal(group) - group.items.length),
    0,
  );
  const unattributedOverflow = Math.max(0, overflow - attributedOverflow);

  const summary =
    (count ?? 0) > 0
      ? `${metricLabel} · ${count} across ${projectCount} ${projectCount === 1 ? 'project' : 'projects'}`
      : emptyLabel;

  const panelV = reduceMotion ? noMotionVariants : panelVariants;
  const contentV = reduceMotion ? noMotionVariants : contentVariants;
  const sectionV = reduceMotion ? noMotionVariants : sectionVariants;

  const panel = (
    <motion.div
      ref={panelRef}
      key="panel"
      id={id}
      role="dialog"
      aria-label={panelContent ? metricLabel : `${metricLabel} breakdown`}
      variants={panelV}
      initial="hidden"
      animate={ready ? 'visible' : 'hidden'}
      exit="exit"
      onMouseEnter={handlePanelEnter}
      onMouseLeave={handlePanelLeave}
      onKeyDown={handlePanelKeyDown}
      className={`custom-bg-abt fixed z-[60] flex max-h-[min(60vh,22rem)] ${widthClass} flex-col rounded-xl text-left text-[0.78rem] leading-snug`}
      style={{
        filter: 'drop-shadow(0 16px 40px rgba(0, 0, 0, 0.55))',
        ...(pos
          ? { top: pos.top, left: pos.left }
          : { top: 0, left: 0, visibility: 'hidden' }),
      }}
    >
      {/* Inner breathing amber glow — the Used-in-repositories card's
          `repo-card-breathe` wrapper, verbatim. Owns overflow so the
          rounded glow edge clips the scrolling list. */}
      <div className="repo-card-breathe flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg">
        {/* Inner cascade orchestrator — staggers the header block, then the
            list, inheriting the panel's animation state. */}
        <motion.div variants={contentV} className="flex min-h-0 flex-1 flex-col p-4">
          {panelContent ? (
            <motion.div variants={sectionV}>{panelContent}</motion.div>
          ) : (
            <>
          {/* SR summary: static full text, announced once per real change —
              the visible count-up digits below are aria-hidden. */}
          <p aria-live="polite" className="sr-only">
            {summary}
            {stale ? ' Showing last known activity.' : ''}
          </p>

          {/* Header block slides up as one unit. */}
          <motion.div variants={sectionV} aria-hidden="true" className="shrink-0">
            <p className="mb-1 text-[10px] uppercase tracking-[0.22em] text-[#ffaa2a]">
              {metricLabel}
            </p>
            {(count ?? 0) > 0 ? (
              <h3
                className="mb-1 text-sm font-semibold sm:text-base"
                style={{ color: '#ff6d05', textShadow: 'none' }}
              >
                <MetricCount count={count} play={ready} prefersReducedMotion={reduceMotion} />{' '}
                across {projectCount} {projectCount === 1 ? 'project' : 'projects'}
              </h3>
            ) : (
              <p className="mb-1 text-[11px]" style={{ color: 'rgba(255, 170, 42, 0.6)' }}>
                {emptyLabel}
              </p>
            )}
            {stale && (
              <p className="mb-1 text-[11px]" style={{ color: 'rgba(255, 170, 42, 0.6)' }}>
                Showing last known activity.
              </p>
            )}
            <div aria-hidden="true" className="elite-divider mb-3 h-px" />
          </motion.div>

          {/* Item list — its own scroll container AND the reveal observer's
              root: rows slide in from the left, staggered, and replay on
              every scroll re-entry. `overflow-x-hidden` clips the -16px
              slide so it can't flash a horizontal scrollbar. `pr-3` +
              thin scrollbar keep the right-aligned ages clear of the
              thumb — overlay scrollbars (macOS) paint ON TOP of content,
              so the text needs real clearance, not a reserved gutter. */}
          <ul
            ref={listScrollRef}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain pr-3 [scrollbar-width:thin]"
          >
            {groups.map((group, groupIndex) => {
              const isExpanded = expandedRepo === group.repo;
              const groupTotal = repoTotal(group);
              const groupOverflow = Math.max(0, groupTotal - group.items.length);
              const sectionId = `${id}-section-${groupIndex}`;
              // "+ N more" links to the repo's list page for THIS metric —
              // every item in a group shares one type, so the first item
              // dictates the path (issue → /issues, pr → /pulls,
              // push → /commits).
              const groupType = group.items[0]?.type;
              const moreUrl = `https://github.com/${group.items[0]?.nameWithOwner}/${
                groupType === 'pr' ? 'pulls' : groupType === 'push' ? 'commits' : 'issues'
              }`;
              return (
                <li key={group.repo}>
                  <button
                    type="button"
                    data-reveal-row
                    aria-expanded={isExpanded}
                    aria-controls={sectionId}
                    onClick={() => toggleGroup(group.repo)}
                    className="mt-1 flex w-full items-center gap-1.5 rounded-sm py-0.5 text-left text-[10px] uppercase tracking-[0.18em] first:mt-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ff6d05]"
                    style={{ color: 'rgba(255, 170, 42, 0.75)' }}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 8 8"
                      className={`h-2 w-2 shrink-0 ${reduceMotion ? '' : 'transition-transform duration-200'} ${isExpanded ? 'rotate-90' : ''}`}
                    >
                      <path
                        d="M2.5 1l3 3-3 3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="min-w-0 flex-1 truncate">{group.repo}</span>
                    {/* Per-project total counts up 0 → N alongside the
                        headline (same shared elite count-up, gated on the
                        panel being positioned). The animating digits are
                        aria-hidden so the button's accessible name keeps
                        the stable final value from the sr-only twin. */}
                    <span
                      className="shrink-0 font-mono text-[0.65rem] font-semibold tabular-nums"
                      style={{ color: '#ff6d05', textShadow: 'none' }}
                    >
                      <span aria-hidden="true">
                        <MetricCount
                          count={groupTotal}
                          play={ready}
                          prefersReducedMotion={reduceMotion}
                        />
                      </span>
                      <span className="sr-only">{groupTotal}</span>
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key="rows"
                        id={sectionId}
                        initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0.12 : 0.25, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <ul className="space-y-2 pt-1.5">
                          {group.items.map((item) => (
                            <li
                              key={`${item.nameWithOwner}-${item.type}-${item.number ?? item.sha}`}
                              data-reveal-row
                            >
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 rounded-md text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ff6d05]"
                              >
                                <span
                                  aria-hidden="true"
                                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ background: '#ff6d05', boxShadow: '0 0 5px #ff6d05' }}
                                />
                                <span
                                  className="shrink-0 font-mono text-[0.7rem] font-semibold"
                                  style={{ color: '#ff6d05', textShadow: 'none' }}
                                >
                                  {item.type === 'push' ? (
                                    item.sha
                                  ) : (
                                    <>
                                      {/* Folio typography: the digits carry
                                          the meaning, the hash is furniture. */}
                                      <span style={{ color: 'rgba(255, 170, 42, 0.65)' }}>#</span>
                                      {item.number}
                                    </>
                                  )}
                                </span>
                                <span
                                  className="text-fire-amber min-w-0 flex-1 truncate underline-offset-2 transition-colors hover:underline"
                                  title={item.title}
                                >
                                  {item.title}
                                </span>
                                <span className="shrink-0 whitespace-nowrap text-[0.7rem] tabular-nums text-[#f9d174]/90">
                                  {formatAge(item.createdAt, now)}
                                </span>
                              </a>
                            </li>
                          ))}
                          {groupOverflow > 0 && (
                            <li data-reveal-row className="text-[11px]">
                              <a
                                href={moreUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block rounded-sm underline-offset-2 transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ff6d05]"
                                style={{ color: 'rgba(255, 170, 42, 0.6)' }}
                              >
                                + {groupOverflow} more on GitHub
                              </a>
                            </li>
                          )}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
            {unattributedOverflow > 0 && (
              <li
                data-reveal-row
                className="pt-0.5 text-[11px]"
                style={{ color: 'rgba(255, 170, 42, 0.6)' }}
              >
                + {unattributedOverflow} more on GitHub
              </li>
            )}
          </ul>
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleTriggerLeave}
        onClick={handleClick}
        onFocus={handleFocus}
        onKeyDown={handleTriggerKeyDown}
        // before: = invisible hit-area expansion to a ≥44px touch target
        // inside the compact header row; after: = hover underline drawn as
        // a pseudo-element because the gradient label text is
        // background-clipped (a real text-decoration would be invisible).
        // `underline={false}` opts a trigger out (the STATE column: its
        // delivery rail sits at the bottom edge, and an underline under
        // the rail reads as a fifth pipeline element).
        className={`group relative inline-flex cursor-pointer items-baseline rounded-sm before:absolute before:-inset-x-1.5 before:-inset-y-3 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]${
          underline
            ? " after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:bg-[#ff6d05]/60 after:opacity-0 after:transition-opacity hover:after:opacity-100"
            : ''
        }`}
      >
        {children}
      </button>
      {mounted &&
        createPortal(<AnimatePresence>{open ? panel : null}</AnimatePresence>, document.body)}
    </>
  );
}
