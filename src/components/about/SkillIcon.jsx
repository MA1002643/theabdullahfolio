"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useStaggeredScrollReveal } from "@/hooks/useStaggeredScrollReveal";
import { animateToTarget } from "@/utils/animationCurves";
import { getIconUrl } from "@/utils/skillsIconUrl";
import { fluid, fluidText } from "@/lib/fluidScale";

// ── "Used in repositories" popover reveal — the Most Active Repository card's
// entrance, applied to this floating panel. The panel springs up as a unit
// (opacity + y + scale), then its information cascades in: the header block
// slides up, then the repo rows slide in from the left, staggered. The spring
// constants and the metric-row slide are the card's, 1:1, so the popover reveals
// with the identical elite cadence. Only the panel's travel is a smaller 24px
// (vs the card's 56) because it's a compact floating panel, not a full-width
// card — the motion reads the same at its size.
const repoPanelVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 70, damping: 18, delayChildren: 0.1, staggerChildren: 0.07 },
  },
};
// Orchestrates the inner cascade: the header block, then the repo list.
const repoContentVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};
// The header block (eyebrow + title + count + divider) slides up as one unit —
// the card's `childVariants`, verbatim.
const repoSectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 20 } },
};
// (Repo rows reveal imperatively via useStaggeredScrollReveal + the
// `repo-row-reveal` keyframe — see the list below — so they RE-PLAY on every
// scroll into the list's own viewport with a real one-by-one stagger, which the
// declarative variant path can't do from inside the panel's animation tree.)
// Reduced-motion no-op for every variant above: hidden === visible, no transform.
const repoNoMotion = {
  hidden: { opacity: 1, x: 0, y: 0, scale: 1 },
  visible: { opacity: 1, x: 0, y: 0, scale: 1 },
};

/* The repository count ("N repositories") — counts up 0 → N with the about
   page's shared elite count-up (animateToTarget + fastStartSlowFinish, 2s
   sprint-then-settle), the same tween the GitHub-stats / languages counters use.
   `play` gates the start on the panel being positioned (visible), so it never
   burns the count while the popover is still hidden off-screen; the popover
   remounts per skill (keyed by slug), so it replays cleanly on each open. The
   visible digits are aria-hidden — the parent `<p>` carries an sr-only final
   value, so assistive tech never hears the intermediate numbers. */
function RepoCount({ count, play, prefersReducedMotion }) {
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

/* The grid icon. The hover / active state is a clean RISE — a few-px lift with a
   hair of scale (CSS `.skill-icon-tile`), no glow or shadow — so the surface
   feels light and premium; `.is-active` keeps the popover-open icon raised so
   the user sees which icon the repository panel belongs to. All the popover
   logic lives in the parent (SkillsStage); this just forwards interaction events
   with its own element as the positioning anchor, mirroring the Languages card's
   row triggers. */
function IconImg({ slug, displayName, source }) {
  return (
    <img
      src={getIconUrl(slug, source)}
      alt={displayName}
      loading="lazy"
      draggable={false}
      onError={(e) => {
        const cell = e.currentTarget.closest("[data-slug]");
        if (cell) cell.style.display = "none";
      }}
      className="h-full w-full object-contain"
    />
  );
}

/* Interaction trigger. Forwards mouse-enter/leave, focus/blur and click up to
   the parent, which gates them by input modality (mouse/keyboard → hover-open,
   touch → tap-toggle). Focusable so keyboard users get the same panel. */
export function SkillIcon({
  slug,
  displayName,
  source,
  active,
  hasRepos,
  pulsing,
  onIconEnter,
  onIconLeave,
  onIconFocus,
  onIconBlur,
  onIconTap,
  onIconActivate,
}) {
  const ref = useRef(null);

  return (
    <div
      ref={ref}
      data-skill-row=""
      // Exposed as a button only when it has a repo list to disclose: `role` +
      // `aria-expanded` give screen readers the disclosure semantics + open/closed
      // state, and the `onKeyDown` below honours the button key contract
      // (Enter/Space). The panel still opens on focus (keyboard) / hover (mouse) /
      // tap (touch) too — this just makes the tile's a11y role explicit.
      role={hasRepos ? "button" : undefined}
      tabIndex={hasRepos ? 0 : -1}
      aria-haspopup={hasRepos ? "true" : undefined}
      aria-expanded={hasRepos ? active : undefined}
      // Pointer (mouse-guarded) rather than mouse events: a touch pointer is
      // ignored here so it never opens a "hover" panel — touch goes through
      // onClick → tap-toggle in the parent. A real mouse / trackpad fires
      // pointerenter with pointerType "mouse".
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") onIconEnter?.(ref.current);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") onIconLeave?.();
      }}
      onFocus={() => onIconFocus?.(ref.current)}
      onBlur={(e) => onIconBlur?.(e)}
      onClick={() => onIconTap?.(ref.current)}
      onKeyDown={(e) => {
        if (!hasRepos) return;
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault(); // Space would otherwise scroll the page
          onIconActivate?.(ref.current);
        }
      }}
      className={`skill-icon-tile relative h-full w-full select-none rounded-md outline-none ${
        hasRepos ? "cursor-pointer" : ""
      } ${active ? "is-active" : ""} ${pulsing ? "skill-heartbeat" : ""}`}
    >
      <IconImg slug={slug} displayName={displayName} source={source} />
    </div>
  );
}

/* Repository-usage popover for one skill — the same themed panel the Most Used
   Languages card uses for its per-language breakdown (`custom-bg-abt` amber
   border, inner `repo-card-breathe` glow, amber eyebrow + orange title,
   `elite-divider`, `text-fire-amber` repo links). Portaled to <body> with fixed
   positioning so it escapes the card's `overflow-hidden`; self-positions beside
   the icon and flips / clamps to stay on-screen. Lists every repository the
   skill was detected in. Hidden until measured so it never flashes at its
   pre-positioned coordinates. */
export function SkillRepoPopover({ skill, anchorRect, onPointerEnter, onPointerLeave }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const prefersReducedMotion = useReducedMotion();
  // The repo list scrolls internally when it overflows; this ref is the
  // IntersectionObserver root so each row's reveal RE-TRIGGERS as it scrolls into
  // the list's own viewport (down to the bottom and back to the top), per row.
  const listScrollRef = useRef(null);
  const panelV = prefersReducedMotion ? repoNoMotion : repoPanelVariants;
  const contentV = prefersReducedMotion ? repoNoMotion : repoContentVariants;
  const sectionV = prefersReducedMotion ? repoNoMotion : repoSectionVariants;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchorRect) return;
    const MARGIN = 8;
    const GAP = 12;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Prefer below the icon; flip above if it would overflow; then clamp.
    let top = anchorRect.bottom + GAP;
    if (top + h > vh - MARGIN) top = anchorRect.top - GAP - h;
    if (top < MARGIN) top = Math.max(MARGIN, vh - h - MARGIN);
    // Centre horizontally on the icon, clamped into the viewport.
    let left = anchorRect.left + anchorRect.width / 2 - w / 2;
    left = Math.min(Math.max(MARGIN, left), vw - w - MARGIN);
    setPos({ left, top });
  }, [anchorRect]);

  const repos = Array.isArray(skill.repos) ? skill.repos : [];
  // Private usage arrives as a bare COUNT (names are withheld server-side —
  // this payload is public and CDN-cached). It shows only in the header's
  // public/private breakdown — the list below stays public links alone.
  const privateCount =
    Number.isFinite(skill.privateRepoCount) && skill.privateRepoCount > 0
      ? skill.privateRepoCount
      : 0;
  const publicCount = repos.length;

  // Staggered, replay-on-scroll reveal for the internal repo list (gated on
  // `pos` so it doesn't fire while the panel is still positioning off-screen).
  useStaggeredScrollReveal(listScrollRef, {
    enabled: Boolean(pos),
    prefersReducedMotion,
    // Rendered ROW count — the "All repositories are private" note occupies one
    // row when there are no public rows to list.
    resetKey: repos.length || (privateCount > 0 ? 1 : 0),
  });

  return createPortal(
    // Panel springs up as a unit (opacity + y + scale), gated on `pos` so the
    // reveal begins the instant it's positioned — never while still hidden
    // off-screen. Animating transform/opacity here is safe: positioning is
    // measured via offsetWidth/offsetHeight (unaffected by transform), and `left`/
    // `top`/`visibility` stay on the inline style.
    <motion.div
      ref={ref}
      variants={panelV}
      initial="hidden"
      animate={pos ? "visible" : "hidden"}
      role="group"
      aria-label={`Repositories using ${skill.displayName}`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onPointerEnter}
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (next && (next.closest?.("[data-skill-popover]") || next.closest?.("[data-skill-row]"))) return;
        onPointerLeave?.();
      }}
      data-skill-popover=""
      // `fluid-scale` re-declared here because this panel portals to
      // document.body — OUTSIDE the /about layout's scoped <main> — so the
      // page's `--fluid-scale` can't inherit in and every fluid consumer
      // inside (padding, heading, .abt-micro eyebrow) would silently pin at
      // the scale-1 fallback. The factor is computed from 100vw, not
      // inherited data, so re-declaring the class reproduces the exact value
      // the page uses (same pattern as /projects' scope re-declaration). The
      // fixed 280px panel width stays static on purpose: it's a positioning
      // constraint of the anchored overlay, not a design size.
      className="fluid-scale custom-bg-abt rounded-xl flex flex-col"
      style={{
        position: "fixed",
        left: pos ? pos.left : -9999,
        top: pos ? pos.top : -9999,
        width: 280,
        maxWidth: "calc(100vw - 16px)",
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
          {/* Header block slides up as one unit (the card's childVariants). */}
          <motion.div variants={sectionV} className="shrink-0">
            <p className="abt-micro text-[10px] uppercase tracking-[0.22em] text-[#ffaa2a] mb-1">Used in repositories</p>
            <h3
              className="text-sm sm:text-base font-semibold mb-1 flex items-center gap-2"
              style={{ color: "#ff6d05", textShadow: "none", fontSize: fluidText(1, 0.875) }}
            >
              <img
                src={getIconUrl(skill.slug, skill.source)}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="w-4 h-4 object-contain shrink-0"
              />
              <span className="truncate">{skill.displayName}</span>
            </h3>
            <p
              className="text-[11px] mb-3"
              style={{ color: "rgba(255, 170, 42, 0.6)", fontSize: fluidText(0.6875, 0.6875) }}
            >
              {/* Public/private breakdown — zero segments are omitted (a
                  private-only skill reads "Repositories: 2 private"). The
                  sr-only twin carries the final values with a comma (a slash
                  reads as the word "slash" in most screen readers); the visible
                  digits count up. */}
              <span className="sr-only">
                Repositories:{" "}
                {[
                  publicCount > 0 ? `${publicCount} public` : null,
                  privateCount > 0 ? `${privateCount} private` : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
              <span aria-hidden="true">
                Repositories:{" "}
                {publicCount > 0 && (
                  <>
                    <RepoCount count={publicCount} play={Boolean(pos)} prefersReducedMotion={prefersReducedMotion} />{" "}
                    public
                  </>
                )}
                {publicCount > 0 && privateCount > 0 && "/"}
                {privateCount > 0 && (
                  <>
                    <RepoCount count={privateCount} play={Boolean(pos)} prefersReducedMotion={prefersReducedMotion} />{" "}
                    private
                  </>
                )}
              </span>
            </p>
            <div aria-hidden="true" className="h-px elite-divider mb-3" />
          </motion.div>
          {/* Repo list — each row slides in from the left, staggered, after the
              header. Same variants the Most Active Repository card's metric rows
              use. `overflow-x-hidden` clips the -16px slide so it can't flash a
              horizontal scrollbar. */}
          <ul
            ref={listScrollRef}
            className="space-y-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5"
          >
            {repos.map((r) => (
              <li
                key={r.nameWithOwner || r.name}
                data-reveal-row
                className="text-xs flex items-center gap-2"
              >
                <span
                  aria-hidden="true"
                  className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "#ff6d05", boxShadow: "0 0 5px #ff6d05" }}
                />
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    // Hover underline — the SAME effect as the Career snapshot's
                    // Personal Projects repo rows (`underline-offset-2
                    // hover:underline transition-colors` on the fire-amber link).
                    className="text-fire-amber truncate underline-offset-2 hover:underline transition-colors"
                  >
                    {r.name}
                  </a>
                ) : (
                  <span className="text-fire-amber truncate">{r.name}</span>
                )}
              </li>
            ))}
            {publicCount === 0 && privateCount > 0 && (
              // Private-only skill: where the public repo rows would list, a
              // single muted note explains why the list is empty instead of the
              // panel just stopping at the count. Same row anatomy (dot + text,
              // data-reveal-row stagger) so it reads as part of the list, but
              // dimmed and non-link — nothing here is clickable by design.
              <li data-reveal-row className="text-xs flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "rgba(255, 170, 42, 0.45)" }}
                />
                <span className="truncate italic" style={{ color: "rgba(255, 170, 42, 0.6)" }}>
                  All repositories are private
                </span>
              </li>
            )}
          </ul>
        </motion.div>
      </div>
    </motion.div>,
    document.body,
  );
}
