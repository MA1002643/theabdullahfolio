'use client';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

import { onMediaChange } from '@/lib/mediaQuery';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { useViewportCountUp } from '@/hooks/useViewportCountUp';
import HoverText from '@/components/footer/HoverText';

/* ── Scroll-driven category strip (issue #47) ──────────────────────────────
   A single horizontal row of category filters that never wraps to a second
   line, however many categories it holds. Shared by /projects and
   /qualifications so both filter rows behave, and are styled, identically.

   THE PAGE IS NEVER DISPLACED. An earlier build followed §2 of the issue
   literally — sticky pin over an injected "scroll runway" whose extra height
   supplied the horizontal travel. It worked, but the runway IS empty vertical
   space: it pushed the first project card 878px down a 900px viewport, so a
   visitor landed on a page with no content on it, and on /qualifications it
   shoved the sub-category row a screen and a half below its parent. Content
   staying visible and injecting empty scroll space are mutually exclusive, so
   the runway and the pin are both gone.

   What drives the travel instead:

     window  overflow-x: auto; max-width = N visible slots   ← the scroller
     └ strip  flex, w-max                                    ← scrolled natively

   • Wheel/trackpad over the row → horizontal travel, and ONLY while the row
     still has somewhere to go. At either end the event passes through
     untouched, so the page carries on scrolling and the row can never trap
     anyone. Off the row, scrolling is completely ordinary.
   • Touch swipe, drag, keyboard tabbing and the scrollbar all drive the same
     scrollLeft, so no two inputs can disagree — there is one source of truth.
   • Under prefers-reduced-motion the wheel conversion is skipped entirely
     (WCAG 2.3.3 — motion triggered by interaction); everything else still
     works, so no category becomes unreachable.

   IT ONLY ENGAGES WHEN IT HAS TO. If the row fits the space available — the
   3–4 categories both pages ship today, at any viewport where they fit on one
   line — `overflow` measures 0 and every affordance switches off: no clipping,
   no edge fades, no scroller. What renders is the plain centred flex row that
   was there before this component existed (§3). */

// SSR-safe layout effect. Measuring in useLayoutEffect (not useEffect) is what
// keeps the clamp from flashing: the row is sized before the browser paints,
// so an overflowing row is never briefly visible at full width.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// How many categories the window may show at once, per breakpoint (§4).
// Evaluated in order — first match wins — so these must run narrowest first.
const SLOT_BREAKPOINTS = [
  { query: '(max-width: 479px)', slots: 2 },
  { query: '(max-width: 1023px)', slots: 3 },
];

// Sub-pixel noise floor for the measurement diff and the overflow test.
// Fractional layout widths mean `stripWidth > windowWidth` is true by
// 0.0001px on rows that visually fit perfectly.
const EPSILON = 0.5;

// Breathing room kept between a tab and the window edge when the row scrolls
// one into view (§6.1).
const EDGE_MARGIN = 12;

// Scroll distance over which an edge fade ramps from off to full. Short enough
// that the cue arrives immediately, long enough not to pop.
const FADE_RAMP = 24;

// Tab palette. The fills are the same ember/amethyst the pages have always
// used; the halos have been cut three times. The originals (lifted verbatim
// from the old inline implementations) stacked three FULL-alpha layers
// (5px/10px/20px solid) and bloomed hard enough to read as smear rather than
// light. Issue #46's re-cut swung to the opposite wall — a 2px contact plus
// an ~8px ambient at ≤0.5 alpha reads as barely-there at strip sizes and was
// flagged as too weak on both consuming pages. This cut restores the
// original's three-layer anatomy (contact / mid halo / outer bloom) but at
// moderated alphas — roughly 60% of the original energy — so the glow is
// unmistakably present without re-smearing the glyphs. The outer 20px pass
// sits at low alpha purely to give the halo reach; the mid pass carries the
// visible weight. Active still outguns inactive so colour + intensity mark
// the selected tab, and hover lifts each pass a step instead of flaring.
const ACTIVE_COLOR = '#ff6d05';
const INACTIVE_COLOR = '#fc83ff';
const ACTIVE_SHADOW =
  '0 0 3px rgba(255, 109, 5, 0.8), 0 0 10px rgba(255, 109, 5, 0.6), 0 0 20px rgba(255, 109, 5, 0.3)';
const ACTIVE_SHADOW_HOVER =
  '0 0 4px rgba(255, 109, 5, 0.9), 0 0 13px rgba(255, 109, 5, 0.7), 0 0 26px rgba(255, 109, 5, 0.38)';
const INACTIVE_SHADOW =
  '0 0 3px rgba(255, 85, 247, 0.7), 0 0 10px rgba(255, 85, 247, 0.5), 0 0 20px rgba(255, 85, 247, 0.25)';
const INACTIVE_SHADOW_HOVER =
  '0 0 4px rgba(255, 85, 247, 0.8), 0 0 13px rgba(255, 85, 247, 0.6), 0 0 26px rgba(255, 85, 247, 0.32)';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/* ── Entrance choreography (issues #28 / #46) ──────────────────────────────
   The row lifts in as one group, then each tab floats up in sequence. The
   variants live on the OUTER container and propagate down to every
   CategoryItem's motion.button through framer-motion's variant context, so
   the stagger needs no per-item delay bookkeeping — staggerChildren on the
   container orchestrates the tabs wherever they sit in the DOM.

   The entrance replays every time the row re-enters the viewport (the issues'
   headline requirement), driven by useInView + the animate prop rather than
   whileInView so it can ALSO be gated on useLoaderRevealed — an
   IntersectionObserver counts the row as visible even under the intro
   loader's z-9999 overlay, and an ungated entrance would play and finish
   before the wipe ever lifts (same reasoning as PageTitle).

   Blur is confined to the container level and the tabs animate only
   transform/opacity — one brief filter transition total, not one per tab. */
const ROW_VARIANTS = {
  hidden: { opacity: 0, y: 20, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.72,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.09,
      delayChildren: 0.08,
    },
  },
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: 'easeOut' },
  },
};

// Reduced motion → the same states reached by plain cross-fades: no travel,
// no blur, no stagger. Opacity alone isn't "motion", so the row still reads
// as arriving rather than popping.
const REDUCED_ROW_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
};

const REDUCED_ITEM_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
};

/**
 * The edge cue's glyph: a slim double chevron drawn as two raw strokes so the
 * CSS can draw them in via stroke-dashoffset (the monogram overlay's reveal
 * language, scaled down to a signage cue). The dash lengths in
 * `.arrow-stroke--near/--far` are the REAL path lengths (two equal segments
 * each — 2·√98 ≈ 19.8 and 2·√40.5 ≈ 12.7, held with a hair of overshoot), not
 * a normalised pathLength: normalising has burned this codebase before.
 * Rendered pointing right; the left button mirrors it in CSS.
 */
const ArrowGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <path className="arrow-stroke arrow-stroke--far" d="M4 5.5 L8.5 10 L4 14.5" />
    <path className="arrow-stroke arrow-stroke--near" d="M9.5 3 L16.5 10 L9.5 17" />
  </svg>
);

/**
 * Smallest scrollLeft that brings the span [itemLeft, itemRight] fully inside
 * a window of `windowWidth`, given where the row currently sits.
 */
const travelToReveal = (itemLeft, itemRight, travelled, windowWidth) => {
  if (itemLeft - travelled < EDGE_MARGIN) return itemLeft - EDGE_MARGIN;
  if (itemRight - travelled > windowWidth - EDGE_MARGIN) {
    return itemRight - windowWidth + EDGE_MARGIN;
  }
  return travelled;
};

/**
 * Watch the breakpoint list and report how many categories may be visible at
 * once. matchMedia (not a resize listener) so this fires once per breakpoint
 * crossing instead of on every resize frame.
 *
 * Subscribes through the shared `onMediaChange` helper: iOS Safari < 14 and the
 * WebViews built on it expose ONLY the deprecated addListener/removeListener on
 * a MediaQueryList, where calling addEventListener throws and takes the whole
 * effect — and with it the page — down. Bailing out entirely when matchMedia is
 * missing leaves `slots` at the desktop ceiling, which is the same value the
 * widest breakpoint resolves to.
 *
 * @param {number} maxVisible Desktop ceiling; narrower breakpoints only ever
 *   lower it.
 */
const useVisibleSlots = (maxVisible) => {
  const [slots, setSlots] = useState(maxVisible);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const lists = SLOT_BREAKPOINTS.map((entry) =>
      window.matchMedia(entry.query),
    );
    const sync = () => {
      const hit = lists.findIndex((list) => list.matches);
      setSlots(
        hit === -1
          ? maxVisible
          : Math.min(maxVisible, SLOT_BREAKPOINTS[hit].slots),
      );
    };
    sync();
    const unsubscribes = lists.map((list) => onMediaChange(list, sync));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [maxVisible]);

  return slots;
};

/**
 * One category tab. A `motion.button` so the hover halo is a `whileHover`
 * variant rather than the pair of inline onMouseEnter/onMouseLeave handlers the
 * pages used to carry.
 */
const CategoryItem = ({
  label,
  isActive,
  isDisabled,
  title,
  count,
  showCount,
  onSelect,
  scrollerRef,
  prefersReducedMotion,
}) => {
  const itemRef = useRef(null);
  const countRef = useRef(null);

  // The count badge tallies up when its tab scrolls into the row's window —
  // the HORIZONTAL equivalent of the about page's viewport counters, and what
  // §6.4 describes. `root` is the scroller, so "in view" means inside the
  // visible slots, not merely somewhere on the page; tabs waiting off the edge
  // hold at 0 and animate the moment they are revealed. `amount: 'all'` waits
  // until the tab is fully clear of the fade so the tally never starts under a
  // half-faded label. On a row that fits (no scrolling), every tab is inside
  // the window from the first frame, so the tally simply runs once on mount.
  const inView = useInView(itemRef, { root: scrollerRef, amount: 'all' });
  // Same shared controller the about page uses, so easing, the reduced-motion
  // path (writes the final value with no tween) and the re-entry hysteresis are
  // identical sitewide rather than a second implementation of the same idea.
  useViewportCountUp(countRef, {
    to: count ?? 0,
    inView,
    prefersReducedMotion,
    enabled: showCount && typeof count === 'number',
  });

  return (
    <motion.button
      ref={itemRef}
      type="button"
      data-category={label}
      aria-pressed={isActive}
      // aria-disabled, NOT the native `disabled` attribute. An empty category is
      // still a legitimate target: clicking it is what raises the "nothing in
      // here yet" toast, and `disabled` would both swallow that click and drop
      // the tab out of the tab order — leaving a keyboard user unable to reach it
      // or find out why. Omitted rather than set to "false" on enabled tabs so
      // the default carries no attribute at all.
      aria-disabled={isDisabled || undefined}
      title={title}
      onClick={() => onSelect(label)}
      // Entrance: inherits "hidden"/"visible" from the row container's variant
      // context (no initial/animate of its own), so the container's
      // staggerChildren drives when each tab floats in.
      variants={prefersReducedMotion ? REDUCED_ITEM_VARIANTS : ITEM_VARIANTS}
      // `transition-colors`, not the blanket `transition` these tabs used to
      // carry: Tailwind's default list includes `transform`, which would put a
      // 150ms ease on any layout the browser applies while scrolling.
      // Enabled tabs carry the footer links' per-glyph hover-roll (HoverText),
      // in its colour-neutral `--mono` variant: the label re-typesets itself
      // letter by letter but keeps the tab's own active/inactive colour, which
      // already carries meaning here. Disabled tabs stay static — a roll would
      // advertise an interactivity their dimming is there to play down.
      className={`cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 !text-[1rem] font-semibold uppercase transition-colors md:!text-[1.2rem] ${
        isDisabled ? 'opacity-40' : 'hover-swap hover-swap--mono'
      }`}
      style={{
        color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
        textShadow: isActive ? ACTIVE_SHADOW : INACTIVE_SHADOW,
      }}
      // Gated with the hover-roll above: a disabled tab that brightened under
      // the pointer would look every bit as interactive as the roll would.
      whileHover={
        isDisabled
          ? undefined
          : {
              textShadow: isActive ? ACTIVE_SHADOW_HOVER : INACTIVE_SHADOW_HOVER,
            }
      }
      // Press feedback (issue #46): pressable things compress. The subtle
      // scale-DOWN is what reads as the tab hearing the click — the
      // carousel's re-fan below is then the response. Skipped for disabled
      // tabs (nothing will respond) and under reduced motion (it's a
      // transform).
      whileTap={
        isDisabled || prefersReducedMotion
          ? undefined
          : { scale: 0.97, transition: { duration: 0.12 } }
      }
    >
      <HoverText text={label} />
      {showCount && typeof count === 'number' && (
        <span className="ml-1 align-middle text-[0.65rem] tabular-nums opacity-40">
          {/* Only the digits carry the ref — useViewportCountUp writes straight
            to textContent, so the brackets have to live outside it. */}
          (<span ref={countRef}>0</span>)
        </span>
      )}
    </motion.button>
  );
};

/**
 * Horizontal category filter row that scrolls sideways once it outgrows the
 * space available, instead of wrapping.
 *
 * @param {object}   props
 * @param {string[]} props.categories       Labels, in display order.
 * @param {string}   props.active           Currently selected label.
 * @param {(cat: string) => void} props.onSelect
 *   Fired for EVERY click, including disabled tabs — the caller owns the
 *   "category is empty" toast and its dismissal lifecycle, which is why this
 *   component takes no `emptyMessage`.
 * @param {(cat: string) => boolean} [props.isDisabled] Dim + title a tab.
 * @param {(cat: string) => string | undefined} [props.disabledTitle]
 *   Native tooltip for a disabled tab.
 * @param {Record<string, number>} [props.counts]
 *   Per-category totals, rendered as small badges beside every label at every
 *   viewport. On a row that overflows they double as orientation aids.
 * @param {number}   [props.maxVisible=4]   Desktop ceiling on visible tabs.
 * @param {string}   [props.className]      Classes for the outer container.
 * @param {string}   [props.label]          Accessible name for the group.
 */
const ScrollHijackCategories = ({
  categories,
  active,
  onSelect,
  isDisabled,
  disabledTitle,
  counts,
  maxVisible = 4,
  className = '',
  label = 'Category filters',
}) => {
  const outerRef = useRef(null);
  const wrapperRef = useRef(null);
  const windowRef = useRef(null);
  const stripRef = useRef(null);

  const prefersReducedMotion = useReducedMotion();
  const slots = useVisibleSlots(maxVisible);

  // Entrance gating — see the ROW_VARIANTS comment block. `once: false` is
  // what makes the entrance replay on every viewport return — it happens to
  // be useInView's default, but the replay is a hard requirement (issues
  // #28/#46), so it's stated rather than inherited. amount 0.4 waits until
  // the row is properly on screen so the replay never fires half-hidden at
  // the viewport edge. Reduced motion pins the row at its final state from
  // the first frame, exactly like PageTitle.
  const revealed = useLoaderRevealed();
  const rowInView = useInView(outerRef, { amount: 0.4, once: false });
  const entranceShown = prefersReducedMotion || (revealed && rowInView);

  const [metrics, setMetrics] = useState({ overflow: 0, windowWidth: 0 });
  // Which edge arrows are live. Kept as state (unlike the fade, which is a CSS
  // variable) because their pointer-events have to switch too — an invisible
  // arrow must not sit there swallowing clicks at the edge of the row.
  const [arrows, setArrows] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const strip = stripRef.current;
    if (!outer || !strip) return;

    const items = Array.from(strip.children);
    if (items.length === 0) return;

    const widths = items.map((item) => item.offsetWidth);
    const gap =
      items.length > 1
        ? Math.max(0, items[1].offsetLeft - (items[0].offsetLeft + widths[0]))
        : 0;
    const styles = window.getComputedStyle(strip);
    const padX =
      parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight) || 0;

    // Cap the window at the WIDEST run of `slots` consecutive tabs. Taking the
    // widest run (rather than the first `slots`, or an average) guarantees no
    // label is ever permanently clipped — every tab can reach the window
    // fully — while still holding the visible count at roughly `slots`.
    let cap = Infinity;
    if (items.length > slots) {
      cap = 0;
      for (let start = 0; start + slots <= items.length; start += 1) {
        let run = gap * (slots - 1) + padX;
        for (let i = start; i < start + slots; i += 1) run += widths[i];
        if (run > cap) cap = run;
      }
    }

    const windowWidth = Math.min(outer.clientWidth, cap);
    const overflow = Math.max(0, strip.offsetWidth - windowWidth);

    setMetrics((prev) => {
      const unchanged =
        Math.abs(prev.overflow - overflow) < EPSILON &&
        Math.abs(prev.windowWidth - windowWidth) < EPSILON;
      // Bailing out on an identical measurement is what stops the
      // ResizeObserver → setState → layout → ResizeObserver cycle from becoming
      // a loop.
      return unchanged ? prev : { overflow, windowWidth };
    });
  }, [slots]);

  const { overflow, windowWidth } = metrics;
  const clipped = overflow > EPSILON;

  /**
   * Drive the edge fades from the live scroll position. Written as CSS custom
   * properties: 1 is a fully opaque edge (nothing hidden that way), 0 is a
   * fully faded one. Set on the WRAPPER (the scroller's parent) so they reach
   * two consumers by inheritance: the mask in `.category-strip-scroller`, and
   * the edge arrows, whose opacity and slide-out are calc()'d from the same
   * values — which is what keeps cue and fade dissolving in lockstep with the
   * finger rather than snapping at a threshold. A mask, not a painted gradient
   * overlay — these pages sit on photographic backgrounds, where a dark
   * gradient would read as a smudge rather than a fade.
   */
  const syncEdges = useCallback(() => {
    const el = windowRef.current;
    const wrapper = wrapperRef.current;
    if (!el || !wrapper) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = 1 - clamp(el.scrollLeft / FADE_RAMP, 0, 1);
    const right = 1 - clamp((max - el.scrollLeft) / FADE_RAMP, 0, 1);
    wrapper.style.setProperty('--edge-l', String(left));
    wrapper.style.setProperty('--edge-r', String(right));
    // The arrows need the same information as booleans. Committed only on a
    // CHANGE, so a scroll gesture costs at most two renders (one per edge
    // crossing) rather than one per scroll event.
    setArrows((prev) => {
      const next = { left: left < 1, right: right < 1 };
      return prev.left === next.left && prev.right === next.right ? prev : next;
    });
  }, []);

  /**
   * Nudge the row by one window's worth. Gives the arrows something to do for
   * anyone who reaches for them rather than scrolling, and for pointers with no
   * wheel at all.
   */
  const page = useCallback(
    (direction) => {
      const el = windowRef.current;
      if (!el) return;
      el.scrollBy({
        left: direction * Math.max(windowWidth - EDGE_MARGIN * 2, 80),
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    },
    [windowWidth, prefersReducedMotion],
  );

  useIsomorphicLayoutEffect(() => {
    measure();
    syncEdges();

    const remeasure = () => {
      measure();
      syncEdges();
    };

    // Guarded like every other ResizeObserver in this codebase: pre-2020
    // WebKit and older Android webviews don't ship it, and an unguarded
    // `new` would take the whole page down. The window-resize fallback
    // only sees viewport changes, not content reflow, but that covers the
    // remeasure that matters (rotation / window resize) on those browsers.
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(remeasure);
      [outerRef.current, stripRef.current].forEach((el) => {
        if (el) observer.observe(el);
      });
    } else {
      window.addEventListener('resize', remeasure);
    }

    // Web fonts land after first paint and change every label's width, so the
    // first measurement is taken against fallback metrics. Remeasure once the
    // real faces are in.
    let cancelled = false;
    if (
      typeof document !== 'undefined' &&
      document.fonts?.status === 'loading'
    ) {
      document.fonts.ready.then(() => {
        if (!cancelled) {
          measure();
          syncEdges();
        }
      });
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener('resize', remeasure);
    };
  }, [measure, syncEdges]);

  // Every syncEdges call above reads the DOM as it stood BEFORE the re-render
  // that measure()'s setState triggers, so on the unclipped → clipped flip it
  // sees a scroller that isn't a scroll container yet (scrollWidth ==
  // clientWidth) and leaves the fades and arrows off — and the re-render that
  // then applies `overflow-x-auto` and `maxWidth` never resizes the observed
  // outer/strip elements, so no ResizeObserver delivery follows to correct it.
  // Re-syncing on each committed measurement reads the final layout before
  // paint; the calls above stay for scroll/resize where metrics DON'T change.
  useIsomorphicLayoutEffect(() => {
    syncEdges();
  }, [overflow, windowWidth, syncEdges]);

  /**
   * Wheel/trackpad over the row becomes horizontal travel — but only while the
   * row can still move the way the gesture is asking. At either end the event
   * is left alone and the page scrolls as normal, so the row hands control back
   * the instant it runs out rather than swallowing the gesture.
   *
   * Bound by hand with `{ passive: false }` instead of an onWheel prop: React
   * registers wheel listeners at the root as PASSIVE, where preventDefault is
   * a no-op that only earns a console warning.
   */
  useEffect(() => {
    const el = windowRef.current;
    if (!el || !clipped || prefersReducedMotion) return undefined;

    const onWheel = (event) => {
      // Trackpads report both axes; a mouse wheel reports deltaY alone. Follow
      // whichever axis the gesture actually favours.
      const raw =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      // Chrome and trackpads deliver pixels (deltaMode 0), but a Firefox
      // mouse wheel delivers LINES (mode 1, ±3 per notch) and some Windows
      // setups deliver PAGES (mode 2). Taken as pixels, a line notch would
      // move the row ~3px while preventDefault below still swallowed the
      // page scroll, so convert to a pixel distance first.
      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientWidth : 1;
      const delta = raw * unit;
      if (!delta) return;

      const max = el.scrollWidth - el.clientWidth;
      const canTravel =
        (delta < 0 && el.scrollLeft > 0) || (delta > 0 && el.scrollLeft < max);
      if (!canTravel) return;

      event.preventDefault();
      el.scrollLeft = clamp(el.scrollLeft + delta, 0, max);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clipped, prefersReducedMotion]);

  /** Scroll the row so the tab at `index` sits fully inside the window. */
  const scrollItemIntoView = useCallback(
    (index) => {
      const el = windowRef.current;
      const item = stripRef.current?.children?.[index];
      if (!el || !item || !clipped) return;

      const travelled = el.scrollLeft;
      const target = clamp(
        travelToReveal(
          item.offsetLeft,
          item.offsetLeft + item.offsetWidth,
          travelled,
          windowWidth,
        ),
        0,
        el.scrollWidth - el.clientWidth,
      );
      if (Math.abs(target - travelled) < 1) return;

      el.scrollTo({
        left: target,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    },
    [clipped, windowWidth, prefersReducedMotion],
  );

  // Selecting a tab that is only half in the window pulls it fully in. Keyed
  // off a CHANGE in `active`, not off the effect's dependency list: the first
  // measurement re-creates `scrollItemIntoView`, and a plain dep-array effect
  // would take that as a selection and scroll on mount.
  const lastActiveRef = useRef(active);
  const activeIndex = categories.indexOf(active);
  useEffect(() => {
    if (lastActiveRef.current === active) return;
    lastActiveRef.current = active;
    if (activeIndex >= 0) scrollItemIntoView(activeIndex);
  }, [active, activeIndex, scrollItemIntoView]);

  return (
    <motion.div
      ref={outerRef}
      className={`w-full ${className}`}
      variants={prefersReducedMotion ? REDUCED_ROW_VARIANTS : ROW_VARIANTS}
      initial={prefersReducedMotion ? 'visible' : 'hidden'}
      animate={entranceShown ? 'visible' : 'hidden'}
    >
      <div
        ref={wrapperRef}
        className="relative mx-auto w-fit"
        style={clipped ? { maxWidth: windowWidth } : undefined}
      >
        <div
          ref={windowRef}
          role="group"
          aria-label={label}
          onScroll={clipped ? syncEdges : undefined}
          // Marks the row as an interactive region for CustomCursor, whose
          // ring grows over anything matching `[data-cursor="grow"]`. Without
          // it the row is the one place on these pages where the wheel does
          // something unusual and the cursor gives no sign of it.
          data-cursor={clipped ? 'grow' : undefined}
          // `py-5 -my-5` only while clipped: overflow clips BOTH axes, which
          // would shear the tabs' neon halo off top and bottom. The padding
          // gives the halo room inside the scrollport and the equal negative
          // margin takes it back out of the layout, so a clipped row occupies
          // exactly the same vertical space as one that fits.
          className={`relative ${
            clipped
              ? 'category-strip-scroller -my-5 overflow-x-auto overflow-y-hidden overscroll-x-contain py-5'
              : ''
          }`}
        >
          <div
            ref={stripRef}
            className="flex w-max items-center justify-center gap-6 px-3"
          >
            {categories.map((cat) => {
              const disabled = isDisabled ? isDisabled(cat) : false;
              return (
                <CategoryItem
                  key={cat}
                  label={cat}
                  isActive={active === cat}
                  isDisabled={disabled}
                  title={
                    disabled && disabledTitle ? disabledTitle(cat) : undefined
                  }
                  count={counts?.[cat]}
                  showCount={Boolean(counts)}
                  onSelect={onSelect}
                  scrollerRef={windowRef}
                  prefersReducedMotion={prefersReducedMotion}
                />
              );
            })}
          </div>
        </div>

        {/* Edge arrows — the standing cue that this row moves. The fade alone
            says "something is cut off"; an arrow says "and you can get to it".
            Each is a slim double chevron that draws itself in stroke-by-stroke
            whenever it earns its place (the `key` remounts the glyph on every
            reveal so the draw replays), idles with a faint pulse travelling
            toward the hidden content, and — via the --edge custom properties —
            dissolves and slides out in lockstep with the mask fade as the row
            approaches that end. Clicking pages the row, so a pointer with no
            wheel is not stranded; visibility itself lives in CSS, so React only
            toggles pointer-events (an invisible arrow must not swallow taps).

            aria-hidden + tabIndex -1 deliberately: they duplicate scrolling
            that the keyboard already does natively by tabbing through the tabs,
            so exposing them would add two redundant stops in front of every
            row without offering a single thing tabbing cannot already do. */}
        {clipped && (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => page(-1)}
              className={`category-strip-arrow category-strip-arrow--left ${
                arrows.left ? '' : 'pointer-events-none'
              }`}
            >
              <ArrowGlyph key={arrows.left} />
            </button>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => page(1)}
              className={`category-strip-arrow category-strip-arrow--right ${
                arrows.right ? '' : 'pointer-events-none'
              }`}
            >
              <ArrowGlyph key={arrows.right} />
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default ScrollHijackCategories;
