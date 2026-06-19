"use client";

import { useEffect } from "react";

// Imperative staggered scroll-reveal for a popover's INTERNAL repo list.
//
// Each row (`[data-reveal-row]` inside `scrollRef`) slides in from the left when
// it scrolls into the list's OWN scroll container, staggered one-by-one, and —
// crucially — RESETS when it scrolls back out so it REPLAYS on every re-entry
// (scroll up or down), as many times as the user scrolls.
//
// Why not framer's declarative `whileInView`: the rows live inside the popover
// panel, which is a variant container with `animate="visible"`. That "visible"
// state propagates to the rows via context, so a row's `whileInView` reverts to
// the inherited "visible" (not "hidden") when it leaves the viewport — it never
// resets, so it fires only once. Driving the reveal imperatively (cancel →
// reflow → restart a CSS keyframe, reset on exit) sidesteps that entirely and
// also gives a real left-to-right STAGGER for a batch that enters together (the
// initial fill, or several rows crossing in on a fast scroll) — which per-row
// `whileInView` can't do. Mirrors the SkillsCard scrub engine's restart trick.
const ROW_ANIM = "repo-row-reveal 0.45s ease-out both";
const STAGGER_S = 0.06;
// A row counts as "in view" at 50% — clear of the boundary so a resting scroll
// position doesn't flicker it between revealed and reset.
const THRESHOLD = 0.5;

const HIDDEN = (el) => {
  el.style.animation = "none";
  el.style.opacity = "0";
  el.style.transform = "translateX(-16px)";
};

export function useStaggeredScrollReveal(
  scrollRef,
  { enabled, prefersReducedMotion, resetKey } = {},
) {
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return undefined;
    const rows = Array.from(root.querySelectorAll("[data-reveal-row]"));
    if (rows.length === 0) return undefined;

    // Reduced motion: paint every row at rest — no observer, no animation.
    if (prefersReducedMotion) {
      rows.forEach((r) => {
        r.style.animation = "none";
        r.style.opacity = "1";
        r.style.transform = "none";
      });
      return undefined;
    }

    // Start hidden. Stay hidden until `enabled` (the popover has been positioned)
    // so the reveal never burns while the panel is still measuring off-screen.
    rows.forEach((r) => {
      HIDDEN(r);
      r.__revealed = false;
    });
    if (!enabled) return undefined;

    let pending = [];
    let rafId = 0;
    const flush = () => {
      rafId = 0;
      // Stagger in DOM order so a batch cascades top-to-bottom rather than firing
      // all at once. A single entering row gets delay 0 (immediate).
      pending.sort((a, b) => rows.indexOf(a) - rows.indexOf(b));
      pending.forEach((el) => {
        el.style.animation = "none";
        el.style.opacity = "";
        el.style.transform = "";
      });
      void root.offsetWidth; // one reflow restarts the whole batch cleanly
      pending.forEach((el, i) => {
        el.style.animation = ROW_ANIM;
        // `both` fill holds the `from` state during the delay, so a staggered row
        // stays hidden until its turn — that IS the one-by-one cascade.
        el.style.animationDelay = `${i * STAGGER_S}s`;
      });
      pending = [];
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target;
          if (e.isIntersecting && !el.__revealed) {
            el.__revealed = true;
            pending.push(el);
            if (!rafId) rafId = requestAnimationFrame(flush);
          } else if (!e.isIntersecting && el.__revealed) {
            // Left the list viewport → reset so it replays on the next entry.
            el.__revealed = false;
            HIDDEN(el);
          }
        }
      },
      { root, threshold: THRESHOLD },
    );
    rows.forEach((r) => io.observe(r));
    return () => {
      io.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [scrollRef, enabled, prefersReducedMotion, resetKey]);
}
