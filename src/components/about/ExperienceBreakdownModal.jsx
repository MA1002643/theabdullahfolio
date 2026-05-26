"use client";

import { animate, AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

import { useViewportCountTrigger } from "@/hooks/useViewportCountTrigger";

// Generic numeric count-up. Renders an integer that ticks 0 → value
// on viewport entry, then holds. Same animate()/viewport-trigger
// pattern as the years card's Counter so every number on the modal
// uses the same easing curve and duration. Suffix / unit text is
// rendered by the caller as a sibling so this component stays
// reusable for "4+", "10 repositories", "3+ months", etc.
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

// Lightweight count-up for the modal's category totals. Mirrors the
// trigger-once-per-entry-cycle pattern used by the about page's main
// Counter — `useViewportCountTrigger` plus a re-mount per modal open
// (the modal is conditionally rendered) means each open replays the
// animation cleanly without a manual reset. Reduced motion lands on
// the final value with no animation.
function CategoryCount({ months }) {
  const value = months >= 12 ? Math.floor(months / 12) : months;
  // Singular when the count is exactly 1, matching RoleBar's plural-
  // aware rendering. Without this the 12–23-month window reads "1+
  // years" — the same window RoleBar correctly prints as "1+ year".
  const baseUnit = months >= 12 ? "year" : "month";
  const unit = value === 1 ? baseUnit : `${baseUnit}s`;
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
    <span ref={sectionRef} className="inline-flex items-baseline gap-1 tabular-nums">
      <span className="sr-only">{`${value}+ ${unit}`}</span>
      <span
        aria-hidden="true"
        className="text-2xl sm:text-3xl font-semibold"
        style={{ color: "#ff6d05", textShadow: "none" }}
      >
        <span ref={nodeRef}>{prefersReducedMotion ? value : 0}</span>
        <span>+</span>
      </span>
      <span aria-hidden="true" className="text-sm sm:text-base text-fire-amber">
        {unit}
      </span>
    </span>
  );
}

// Donut chart visualising the personal-vs-employment split of total
// experience. Two arcs share a single track; the second arc is rotated
// by the first arc's sweep so they meet at the seam. Center reads the
// grand total — same value the years card on the about page shows, so
// opening the modal feels like a zoom-in rather than a new metric.
function ExperienceDonut({ personalMonths, employmentMonths }) {
  const prefersReducedMotion = useReducedMotion();
  const total = personalMonths + employmentMonths;
  if (total === 0) return null;

  const personalPct = personalMonths / total;
  const employmentPct = employmentMonths / total;
  const radius = 70;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius;
  // Tiny rotational gap (in degrees) between the two arcs so the
  // rounded caps don't visually overlap at the seam.
  const gapDeg = 4;
  const personalSweep = Math.max(0, personalPct * 360 - gapDeg);
  const employmentSweep = Math.max(0, employmentPct * 360 - gapDeg);
  const personalDash = (personalSweep / 360) * circumference;
  const employmentDash = (employmentSweep / 360) * circumference;

  const totalValue = total >= 12 ? Math.floor(total / 12) : total;
  const totalUnit = total >= 12 ? "yrs" : "mo";

  const arcInitial = prefersReducedMotion
    ? { strokeDasharray: undefined }
    : { strokeDashoffset: circumference };
  const arcAnimateBase = prefersReducedMotion
    ? {}
    : { strokeDashoffset: 0 };

  return (
    <div className="relative mx-auto w-36 h-36 sm:w-44 sm:h-44">
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 180 180"
        className="-rotate-90 block"
        aria-hidden="true"
      >
        <defs>
          {/* Personal arc — solid vivid orange, matching the "3+
              years" CategoryCount color so the arc and its numeric
              total read as the same metric. */}
          <linearGradient id="elite-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff6d05" />
            <stop offset="100%" stopColor="#ff6d05" />
          </linearGradient>
          {/* Employment arc — solid bright amber so it reads as a
              clearly lighter tone next to the Personal arc's vivid
              orange. Was a bright-amber → vivid-orange gradient
              but the orange endpoint blended into the Personal arc
              at the seam. */}
          <linearGradient id="elite-cyan-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffd27d" />
            <stop offset="100%" stopColor="#ffd27d" />
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

        {/* Personal arc — starts at 12 o'clock (after SVG -rotate-90) */}
        <motion.circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="url(#elite-gold-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${personalDash} ${circumference}`}
          initial={arcInitial}
          animate={arcAnimateBase}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.15 }}
        />

        {/* Employment arc — rotated to start where personal ended (+gap) */}
        <motion.circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="url(#elite-cyan-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${employmentDash} ${circumference}`}
          style={{
            transformOrigin: "90px 90px",
            transform: `rotate(${personalPct * 360}deg)`,
          }}
          initial={arcInitial}
          animate={arcAnimateBase}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.45 }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className="text-3xl sm:text-4xl font-semibold tabular-nums"
          style={{ color: "#ff6d05", textShadow: "none" }}
        >
          <AnimatedNumber value={totalValue} />+
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-fire-amber mt-1">
          total {totalUnit}
        </span>
      </div>
    </div>
  );
}

// Per-role horizontal bar — width is the role's share of the longest
// role in the list, not of the total, so a 1-month stint still gets a
// visible sliver and the longest role anchors at 100%. Bar animates
// every time it enters view inside the modal's scroll container (not
// just on first mount): `whileInView` with `once: false` and the
// dialog element as `root` so scrolling the bar in and out of the
// modal's visible region replays the fill animation. `containerRef`
// is the dialog scroller, threaded through from the parent so this
// detail stays local to the modal.
function RoleBar({ role, maxMonths, index, containerRef }) {
  const prefersReducedMotion = useReducedMotion();
  const pct = maxMonths > 0 ? Math.max(4, (role.months / maxMonths) * 100) : 0;
  // Split the pre-formatted `role.display` into its leading numeric
  // segment and the trailing unit + sentence so the number can animate
  // independently. Same rules as the server-side `formatDuration` (>=12
  // months → "X+ years", else "X+ months"; singular/plural handled).
  const isYears = role.months >= 12;
  const leading = isYears ? Math.floor(role.months / 12) : role.months;
  const unitWord = isYears
    ? leading === 1
      ? "year"
      : "years"
    : leading === 1
      ? "month"
      : "months";

  return (
    <li
      className="grid gap-1 py-2"
      style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
    >
      <span
        className="text-sm leading-snug min-w-0 truncate"
        style={{ color: "#ff6d05", textShadow: "none" }}
      >
        <AnimatedNumber value={leading} />+{" "}
        <span className="text-fire-amber">
          {unitWord} with {role.company} as a {role.role}
        </span>
      </span>
      <span className="text-xs text-[#ffaa2a] tabular-nums self-center">
        <AnimatedNumber value={leading} />
        {isYears ? "+ yrs" : " mo"}
      </span>
      <div
        className="col-span-2 h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(244, 227, 184, 0.05)" }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background:
              "linear-gradient(90deg, #ffd27d 0%, #ffaa2a 60%, #ff6d05 100%)",
            boxShadow: "0 0 8px rgba(255, 109, 5, 0.45)",
          }}
          initial={prefersReducedMotion ? { width: `${pct}%` } : { width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: false, amount: 0.5, root: containerRef }}
          transition={{
            duration: 0.9,
            delay: 0.3 + index * 0.12,
            ease: "easeOut",
          }}
        />
      </div>
    </li>
  );
}

// Repo name row in the Personal Projects list. The repo name uses
// `truncate` (text-overflow: ellipsis) so long names don't wrap. A
// `title` attribute is set only when the text is actually clipped —
// otherwise the browser would render its native unstyled tooltip on
// every hover even when the full name was already visible. A
// ResizeObserver re-checks on container width changes so the tooltip
// turns on/off as the modal is resized.
function RepoName({ repo }) {
  const ref = useRef(null);
  const [isClipped, setIsClipped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setIsClipped(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [repo.name]);

  const titleAttr = isClipped ? repo.name : undefined;

  if (repo.url) {
    return (
      <a
        ref={ref}
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        title={titleAttr}
        className="block truncate text-fire-amber underline-offset-2 hover:underline transition-colors"
      >
        {repo.name}
      </a>
    );
  }
  return (
    <span
      ref={ref}
      title={titleAttr}
      className="block truncate text-fire-amber"
    >
      {repo.name}
    </span>
  );
}

// Focusable element selector for the focus trap. Matches everything an
// AT user can reach via Tab. Element-level `[tabindex="-1"]` is
// excluded so programmatic-only focus targets don't intercept the
// trap cycle.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

// Initial number of repos shown before the disclosure expands. Tuned
// so the modal opens at a compact height even on accounts with many
// owned repos; users with curiosity can expand to the full list.
const REPO_INITIAL_LIMIT = 5;

/**
 * Experience breakdown modal — opens from the years card on the about
 * page. Shows GitHub-derived personal-projects total and resume-derived
 * employment total + per-role lines, with a donut chart visualising the
 * split.
 *
 * Full a11y baseline (per the Phase 4 choice):
 *   - `role="dialog"` + `aria-modal="true"` + `aria-labelledby` so
 *     screen readers announce it as a modal dialog with the title.
 *   - Escape key closes.
 *   - Backdrop click closes; inner-panel clicks don't propagate.
 *   - Focus moves to the close button on open.
 *   - Tab / Shift+Tab cycles within the dialog (focus trap).
 *   - Focus returns to the trigger element on close.
 *   - `document.body.style.overflow` locked while open so background
 *     scroll doesn't compete with modal scroll on touch.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {object|null} props.data         - experience-summary payload
 * @param {React.RefObject<HTMLElement>} props.triggerRef - element that opened the modal
 */
export function ExperienceBreakdownModal({ open, onClose, data, triggerRef }) {
  const dialogRef = useRef(null);
  // Inner scrolling region is the actual `overflow-y-auto` element so
  // the browser's scrollbar lands inside the gold border instead of
  // sitting on top of it. The outer dialog stays `overflow-hidden`
  // so its rounded corners clip the scrollbar; this inner div is the
  // one that scrolls and the one we hand to RoleBar's `whileInView`
  // as a custom `root`, so progress bars re-fire on internal scroll.
  const scrollRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [showAllRepos, setShowAllRepos] = useState(false);

  // Reset disclosure state on every re-open so the modal always starts
  // in its compact form. Otherwise reopening after expanding once would
  // skip past the visual "compact → expanded" hint that exists to
  // signal more rows are available.
  useEffect(() => {
    if (open) setShowAllRepos(false);
  }, [open]);

  // Body scroll lock — restore prior value on close so we don't clobber
  // a different overflow setting that might be set elsewhere. Also
  // sets `data-modal-open` on <body> so the floating home button
  // (`.control-island`, z:120) can be hidden via CSS while the modal
  // is open — otherwise it sits above the z-50 backdrop and remains
  // tappable, breaking the modal's focus feel and letting users
  // navigate away from underneath the dialog.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.modalOpen = "true";
    return () => {
      document.body.style.overflow = previousOverflow;
      delete document.body.dataset.modalOpen;
    };
  }, [open]);

  // Escape closes. Keydown bound at document level so the listener
  // fires regardless of which dialog descendant has focus.
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

  // Focus management. On open: move focus to the close button so the
  // first Tab cycle starts inside the dialog. On close: return focus
  // to the originating trigger element (the years card) if still in
  // the DOM — matches the WAI-ARIA dialog practices guide.
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

  // Focus trap. We intercept Tab/Shift+Tab at the dialog and wrap
  // focus around the first/last focusable elements so Tab never
  // escapes back to the page beneath. Re-queried on each Tab to
  // tolerate dynamic content (e.g. roles list rendering after data
  // arrives).
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

  const personalMonths = data?.personalProjects?.months ?? 0;
  const employmentMonths = data?.employment?.months ?? 0;
  const roles = data?.employment?.roles ?? [];
  const repos = data?.personalProjects?.repos ?? [];
  const maxRoleMonths = roles.reduce((m, r) => Math.max(m, r.months), 0);
  const visibleRepos = showAllRepos ? repos : repos.slice(0, REPO_INITIAL_LIMIT);
  const hasMoreRepos = repos.length > REPO_INITIAL_LIMIT;

  // Repos arrive in DESC-by-createdAt order (newest first) from the
  // API. Date formatter renders "Mar 4, 2023"-style readable dates
  // anchored in UTC so a non-UTC client locale can't shift the day.
  const formatRepoDate = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };

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
            aria-labelledby="experience-modal-title"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            // Reuses the about page's shared card chrome
            // (`.custom-bg-abt`) so the modal panel inherits the exact
            // same warm-gold border, slate gradient interior, backdrop
            // blur, orange neon box-shadow AND the brighter on-hover
            // box-shadow that every card on the about page already
            // uses. `overflow-hidden` on this outer panel so the
            // rounded corners clip the scrollbar that lives on the
            // inner `scrollRef` div — keeps the scrollbar inside the
            // gold border rather than sitting on top of it.
            className="custom-bg-abt rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden text-white relative"
            style={{
              filter: "drop-shadow(0 24px 60px rgba(0, 0, 0, 0.6))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              ref={scrollRef}
              className="max-h-[88vh] overflow-y-auto p-6 sm:p-8"
            >
            <header className="flex items-start justify-between gap-4 mb-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#ffaa2a] mb-1">
                  Career snapshot
                </p>
                <h2
                  id="experience-modal-title"
                  className="text-xl sm:text-2xl font-semibold"
                  style={{ color: "#ff6d05", textShadow: "none" }}
                >
                  Experience by category
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Close experience breakdown"
                // Reuses the home button's `.custom-bg` class so the
                // close button inherits the exact same orange neon
                // border + subtle outer glow at rest AND the brighter
                // multi-layered glow on hover. Icon uses an SVG (X
                // from lucide-react) for reliable centering — the "×"
                // text glyph has asymmetric vertical metrics that
                // nudge it off-center in most fonts.
                className="custom-bg flex-shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-full text-[#d4af7a] hover:text-[#ff6d05] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50"
              >
                <X aria-hidden="true" className="w-4 h-4" strokeWidth={2} />
              </button>
            </header>

            {/* Hero block — donut + legend. Stacks on mobile so the
                donut stays large enough to read. */}
            <div className="flex flex-col sm:flex-row items-center gap-6 mb-8">
              <ExperienceDonut
                personalMonths={personalMonths}
                employmentMonths={employmentMonths}
              />
              <dl className="flex-1 w-full space-y-4">
                <div>
                  <dt className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#ffaa2a] mb-1">
                    <span
                      aria-hidden="true"
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{
                        background: "#ff6d05",
                        boxShadow: "0 0 8px rgba(255, 109, 5, 0.6)",
                      }}
                    />
                    Personal Projects
                  </dt>
                  <dd>
                    <CategoryCount months={personalMonths} />
                    {repos.length > 0 && (
                      <span className="block text-xs text-[#ffbb55] mt-0.5">
                        <AnimatedNumber value={repos.length} /> owned {repos.length === 1 ? "repository" : "repositories"}
                      </span>
                    )}
                  </dd>
                </div>
                <div
                  aria-hidden="true"
                  className="h-px elite-divider"
                />
                <div>
                  <dt className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#ffaa2a] mb-1">
                    <span
                      aria-hidden="true"
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{
                        background: "#ffd27d",
                        boxShadow: "0 0 8px rgba(255, 210, 125, 0.6)",
                      }}
                    />
                    Employment
                  </dt>
                  <dd>
                    <CategoryCount months={employmentMonths} />
                    {roles.length > 0 && (
                      <span className="block text-xs text-[#ffbb55] mt-0.5">
                        <AnimatedNumber value={roles.length} /> {roles.length === 1 ? "role" : "roles"}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            <section className="mb-7">
              <header className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] uppercase tracking-[0.2em] text-[#ffaa2a]">
                  Personal Projects
                </h3>
                {repos.length > 0 && (
                  <span className="text-[10px] uppercase tracking-[0.16em] text-[#d4af7a]">
                    Newest first
                  </span>
                )}
              </header>
              {repos.length > 0 ? (
                <>
                  <ul
                    role="list"
                    className="custom-bg-abt rounded-lg p-2 space-y-1.5"
                  >
                    {visibleRepos.map((r) => {
                      const dateText = formatRepoDate(r.createdAt);
                      return (
                        <li
                          key={r.url ?? r.name}
                          className="flex items-center gap-3 text-sm leading-snug"
                        >
                          <span
                            aria-hidden="true"
                            className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
                            style={{
                              background: "#ff6d05",
                              boxShadow: "0 0 6px rgba(255, 109, 5, 0.55)",
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <RepoName repo={r} />
                          </div>
                          <time
                            dateTime={r.createdAt}
                            className="flex-shrink-0 text-xs text-[#ffaa2a] tabular-nums"
                          >
                            {dateText}
                          </time>
                        </li>
                      );
                    })}
                  </ul>
                  {hasMoreRepos && (
                    <button
                      type="button"
                      onClick={() => setShowAllRepos((v) => !v)}
                      className="mt-2 text-xs text-[#ffd27d] hover:text-[#ff6d05] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/40 rounded px-2 py-1 transition-colors"
                      aria-expanded={showAllRepos}
                    >
                      {showAllRepos
                        ? "Show fewer"
                        : `Show all ${repos.length} repositories →`}
                    </button>
                  )}
                </>
              ) : (
                <p className="text-xs text-fire-amber">
                  No owned repositories detected yet.
                </p>
              )}
            </section>

            <section>
              <header className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] uppercase tracking-[0.2em] text-[#ffaa2a]">
                  Employment
                </h3>
                {roles.length > 0 && (
                  <span className="text-[10px] uppercase tracking-[0.16em] text-[#d4af7a]">
                    Relative duration
                  </span>
                )}
              </header>
              {roles.length > 0 ? (
                <ul
                  role="list"
                  className="custom-bg-abt rounded-lg px-3 py-1"
                >
                  {roles.map((r, i) => (
                    <Fragment key={`${r.company}-${r.role}-${r.start}`}>
                      {i > 0 && (
                        // Separator <li> between role rows. Using a
                        // li (with role="presentation") keeps the
                        // parent <ul role="list"> semantically pure
                        // while letting block-flow margins control
                        // the spacing — the previous grid-cell-based
                        // approach left a residual track height that
                        // couldn't be cancelled with negative margin.
                        // -mb-1 pulls the next role up 4px to offset
                        // the leading-snug line-box padding above
                        // the role text, so the visible gap above
                        // and below the line reads as equal.
                        <li
                          role="presentation"
                          aria-hidden="true"
                          className="h-px elite-divider -mx-3 list-none -mb-1"
                        />
                      )}
                      <RoleBar
                        role={r}
                        maxMonths={maxRoleMonths}
                        index={i}
                        containerRef={scrollRef}
                      />
                    </Fragment>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#d4af7a]">
                  No software-engineering roles detected yet.
                </p>
              )}
            </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
