'use client';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  motion,
  transform,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion';

import FadeEdges from './FadeEdges';
import ScrollProgressBar from './ScrollProgressBar';

/* ── Scroll-driven category strip (issue #47) ──────────────────────────────
   A single horizontal row of category filters that converts the page's own
   VERTICAL scroll into HORIZONTAL travel across the row — Apple's sticky-pin
   pattern (MacBook Pro chip strip). Shared by /projects and /qualifications
   so both filter rows behave, and are styled, identically.

   How the mechanism works:

     runway  height = pinHeight + overflow   ← the extra height IS the budget
     └ pin   position: sticky; top: stickyTop
       └ window  overflow: hidden; max-width = N visible slots
         └ strip  motion.div, translateX driven by the runway's scroll progress

   Scrolling from "runway top hits stickyTop" to "runway bottom hits
   stickyTop + pinHeight" is exactly `overflow` pixels of scroll, so the
   vertical→horizontal mapping is 1:1 and the strip finishes travelling at the
   precise moment the pin releases — no dead zone in either direction (§1).

   IT ONLY ENGAGES WHEN IT HAS TO. If the row fits the space available (the
   3–4 categories both pages ship today, on any viewport where they fit on one
   line) `overflow` measures 0, and every hijack affordance switches off: no
   runway, no sticky, no clipping, no fades, no progress bar, no depth
   parallax. What renders is a plain centred flex row — the layout that was
   there before this component existed (§3). */

// SSR-safe layout effect. Measuring in useLayoutEffect (not useEffect) is what
// keeps the clamp from flashing: the strip is sized before the browser paints,
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

// Breathing room kept between an item and the window edge when the strip
// auto-scrolls a category into view (§6.1).
const EDGE_MARGIN = 12;

// Pointer travel (px) above which a click on a tab is treated as the tail of a
// swipe rather than a selection.
const CLICK_SLOP = 6;

// Tab palette — lifted verbatim from the two inline implementations this
// component replaces so the filters look exactly as they did before.
const ACTIVE_COLOR = '#ff6d05';
const INACTIVE_COLOR = '#fc83ff';
const ACTIVE_SHADOW =
  '0 0 5px #ff6d05, 0 0 10px #ff6d05, 0 0 20px rgba(255, 106, 0, 0.7)';
const ACTIVE_SHADOW_HOVER =
  '0 0 6px #ff6d05, 0 0 14px #ff6d05, 0 0 26px rgba(255, 106, 0, 0.8)';
const INACTIVE_SHADOW = '0 0 5px #ff55f7, 0 0 10px #ff55f7, 0 0 20px #ff55f7';
const INACTIVE_SHADOW_HOVER =
  '0 0 6px #ff55f7, 0 0 14px #ff55f7, 0 0 26px #ff55f7';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Depth-of-field curves from §6.2, as pure mapping functions (Framer's
// `transform` clamps at both ends). Module scope: they close over nothing, so
// every tab on the page shares one instance of each.
const SCALE_CURVE = transform([0, 0.5, 1], [0.85, 1, 0.85]);
const BLUR_CURVE = transform([0, 0.3, 0.7, 1], [3, 0, 0, 3]);

/**
 * Watch the breakpoint list and report how many categories may be visible at
 * once. matchMedia (not a resize listener) so this fires once per breakpoint
 * crossing instead of on every resize frame.
 *
 * @param {number} maxVisible Desktop ceiling; narrower breakpoints only ever
 *   lower it.
 */
const useVisibleSlots = (maxVisible) => {
  const [slots, setSlots] = useState(maxVisible);

  useIsomorphicLayoutEffect(() => {
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
    lists.forEach((list) => list.addEventListener('change', sync));
    return () =>
      lists.forEach((list) => list.removeEventListener('change', sync));
  }, [maxVisible]);

  return slots;
};

/**
 * One category tab. Rendered as a `motion.button` so the hover halo is a
 * `whileHover` variant rather than the pair of inline onMouseEnter/onMouseLeave
 * handlers the pages used to carry, and so the depth-of-field parallax can
 * ride the shared `x` MotionValue without any React state (§6.2).
 */
const CategoryItem = ({
  label,
  isActive,
  isDisabled,
  title,
  count,
  showCount,
  onSelect,
  scrollYProgress,
  overflow,
  center,
  windowWidth,
  depth,
}) => {
  // Both of these read the SAME MotionValue the strip's own `x` reads, and
  // derive everything else inline. Chaining (progress → x → position → curve →
  // gate → filter) also works, but each derived MotionValue settles a frame
  // after the one it depends on, so a six-deep chain left the depth effect
  // visibly trailing the strip it belongs to. One level = same frame.
  const depthOf = (raw) => {
    const travelled = clamp(raw, 0, 1);
    // Where this tab's centre sits inside the visible window: 0 = left edge,
    // 1 = right edge. The strip travels left, hence the minus.
    const p =
      windowWidth > 0 ? (center - overflow * travelled) / windowWidth : 0.5;
    // Depth is a cue for content running off an edge, so it may only apply on
    // a side that HAS content off it. Without this gate the first tab sits
    // blurred and shrunken at the resting position, where nothing is hidden to
    // its left — and the last tab does the same at the end of the travel. The
    // thresholds match FadeEdges so blur and gradient arrive together, and
    // both curves pass through "no effect" at the window centre, so a tab
    // crossing the midpoint swaps gate with no visible step.
    const gate =
      p < 0.5
        ? Math.min(1, travelled / 0.05)
        : Math.min(1, (1 - travelled) / 0.05);
    return { p, gate };
  };

  const scale = useTransform(scrollYProgress, (raw) => {
    const { p, gate } = depthOf(raw);
    return 1 - (1 - SCALE_CURVE(p)) * gate;
  });
  // `filter: none` rather than `blur(0px)` in the sharp middle band: a live
  // filter would otherwise force a filter layer on every tab for the whole
  // scroll, for zero visual gain.
  const filter = useTransform(scrollYProgress, (raw) => {
    const { p, gate } = depthOf(raw);
    const radius = BLUR_CURVE(p) * gate;
    return radius < 0.05 ? 'none' : `blur(${radius}px)`;
  });

  return (
    <motion.button
      type="button"
      data-category={label}
      aria-pressed={isActive}
      title={title}
      onClick={(event) => onSelect(label, event)}
      // `transition-colors`, NOT the blanket `transition` these tabs used to
      // carry: Tailwind's default transition list includes `transform` and
      // `filter`, which put a 150ms CSS ease on the two properties the depth
      // parallax writes every frame — the effect visibly smeared behind the
      // scroll and settled late. Colour is the only property here that ever
      // transitions anyway, so nothing is lost.
      className={`cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 !text-[1rem] font-semibold uppercase transition-colors md:!text-[1.2rem] ${
        isDisabled ? 'opacity-40' : ''
      }`}
      style={{
        color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
        textShadow: isActive ? ACTIVE_SHADOW : INACTIVE_SHADOW,
        ...(depth ? { scale, filter } : null),
      }}
      whileHover={{
        textShadow: isActive ? ACTIVE_SHADOW_HOVER : INACTIVE_SHADOW_HOVER,
      }}
    >
      {label}
      {showCount && typeof count === 'number' && (
        <span className="ml-1 align-middle text-[0.65rem] tabular-nums opacity-40">
          ({count})
        </span>
      )}
    </motion.button>
  );
};

/**
 * Horizontal category filter row that hijacks vertical page scroll once it
 * outgrows the space available.
 *
 * @param {object}   props
 * @param {string[]} props.categories       Labels, in display order.
 * @param {string}   props.active           Currently selected label.
 * @param {(cat: string) => void} props.onSelect
 *   Fired for EVERY click, including disabled tabs — the caller owns the
 *   "category is empty" toast and its dismissal lifecycle, which is why this
 *   component takes no `emptyMessage` (see the note in the PR for #47).
 * @param {(cat: string) => boolean} [props.isDisabled] Dim + title a tab.
 * @param {(cat: string) => string | undefined} [props.disabledTitle]
 *   Native tooltip for a disabled tab.
 * @param {Record<string, number>} [props.counts]
 *   Per-category totals. Rendered as small badges ONLY while the strip is
 *   hijacking, where they double as orientation aids; the un-hijacked row
 *   stays exactly as it looks today.
 * @param {number}   [props.stickyTop=0]    Pin offset from the viewport top, px.
 * @param {number}   [props.maxVisible=4]   Desktop ceiling on visible tabs.
 * @param {string}   [props.className]      Classes for the outer runway.
 * @param {string}   [props.label]          Accessible name for the group.
 */
const ScrollHijackCategories = ({
  categories,
  active,
  onSelect,
  isDisabled,
  disabledTitle,
  counts,
  stickyTop = 0,
  maxVisible = 4,
  className = '',
  label = 'Category filters',
}) => {
  const runwayRef = useRef(null);
  const pinRef = useRef(null);
  const windowRef = useRef(null);
  const stripRef = useRef(null);

  const prefersReducedMotion = useReducedMotion();
  const slots = useVisibleSlots(maxVisible);

  // Everything the hijack needs, measured from real layout boxes. Kept in one
  // state object so a remeasure is a single render, and so the bail-out
  // comparison below can reject no-op measurements wholesale.
  const [metrics, setMetrics] = useState({
    overflow: 0,
    windowWidth: 0,
    pinHeight: 0,
    centers: [],
  });

  const measure = useCallback(() => {
    const runway = runwayRef.current;
    const strip = stripRef.current;
    const pin = pinRef.current;
    if (!runway || !strip || !pin) return;

    const items = Array.from(strip.children);
    if (items.length === 0) return;

    // offsetWidth/offsetLeft, never getBoundingClientRect: the tabs carry a
    // live `scale` transform from the depth parallax, and rect measurements
    // would feed those transforms straight back into the geometry that
    // produces them.
    const widths = items.map((item) => item.offsetWidth);
    const centers = items.map((item) => item.offsetLeft + item.offsetWidth / 2);
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
    //
    // The cap is a CEILING on the window once there are more categories than
    // the row is meant to show at once — never the thing that triggers a
    // hijack. Gating it on `maxVisible` (the desktop ceiling) rather than on
    // `slots` is what keeps §3's promise: at 4 categories or fewer the row is
    // measured against the full width available and hijacks only if it
    // genuinely would not fit, so today's rows are untouched on every viewport
    // — while a fifth category brings in the per-breakpoint 4/3/2 window of §4.
    let cap = Infinity;
    if (items.length > maxVisible) {
      cap = 0;
      for (let start = 0; start + slots <= items.length; start += 1) {
        let run = gap * (slots - 1) + padX;
        for (let i = start; i < start + slots; i += 1) run += widths[i];
        if (run > cap) cap = run;
      }
    }

    const windowWidth = Math.min(runway.clientWidth, cap);
    const overflow = Math.max(0, strip.offsetWidth - windowWidth);
    const pinHeight = pin.offsetHeight;

    setMetrics((prev) => {
      const unchanged =
        Math.abs(prev.overflow - overflow) < EPSILON &&
        Math.abs(prev.windowWidth - windowWidth) < EPSILON &&
        Math.abs(prev.pinHeight - pinHeight) < EPSILON &&
        prev.centers.length === centers.length &&
        centers.every((c, i) => Math.abs(c - prev.centers[i]) < EPSILON);
      // Bailing out on an identical measurement is what stops the
      // ResizeObserver → setState → layout → ResizeObserver cycle from
      // becoming a loop.
      return unchanged ? prev : { overflow, windowWidth, pinHeight, centers };
    });
  }, [slots, maxVisible]);

  useIsomorphicLayoutEffect(() => {
    measure();

    const observer = new ResizeObserver(measure);
    [runwayRef.current, stripRef.current, pinRef.current].forEach((el) => {
      if (el) observer.observe(el);
    });

    // Web fonts land after first paint and change every label's width, so the
    // first measurement is taken against fallback metrics. Remeasure once the
    // real faces are in.
    let cancelled = false;
    if (
      typeof document !== 'undefined' &&
      document.fonts?.status === 'loading'
    ) {
      document.fonts.ready.then(() => {
        if (!cancelled) measure();
      });
    }

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [measure]);

  const { overflow, windowWidth, pinHeight, centers } = metrics;
  const needsHijack = overflow > EPSILON;

  // Pin window in scroll coordinates: progress 0 when the runway's top reaches
  // `stickyTop` (the pin engages), progress 1 when its bottom reaches
  // `stickyTop + pinHeight` (the pin releases). Framer resolves the px edges
  // against the live element box and re-subscribes whenever this array's
  // contents change, so a resize re-derives the window for free.
  //
  // A row that fits tracks nothing at all: passing no target (rather than a
  // target with a no-op offset) means Framer never measures this element, and
  // its dev-only "container has a static position" advisory — which fires for
  // any element-targeted useScroll against the window — stays out of the
  // console on the pages that never hijack.
  const scrollOptions = useMemo(
    () =>
      needsHijack
        ? {
            target: runwayRef,
            offset: [`start ${stickyTop}px`, `end ${stickyTop + pinHeight}px`],
          }
        : {},
    [needsHijack, stickyTop, pinHeight],
  );
  const { scrollYProgress } = useScroll(scrollOptions);
  // scrollYProgress itself is deliberately unclamped by Framer (it keeps
  // running past 0/1 outside the pin window); re-mapping through useTransform
  // clamps it, which is what the fades, the progress bar and the travel below
  // all assume. Both of these — and every consumer downstream — derive from
  // scrollYProgress DIRECTLY rather than from each other, so they all land in
  // the same frame instead of settling one level per frame.
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const x = useTransform(scrollYProgress, [0, 1], [0, -overflow]);

  /**
   * Scroll the page so the tab at `index` sits fully inside the window.
   * The 1:1 vertical→horizontal mapping means "how far the strip has
   * travelled" and "how far into the pin we are" are the same number, so the
   * target scroll position is just the pin's start plus the travel we want.
   */
  const scrollItemIntoView = useCallback(
    (index, behavior) => {
      const runway = runwayRef.current;
      const item = stripRef.current?.children?.[index];
      if (!runway || !item || overflow <= EPSILON) return;

      const pinStartY =
        window.scrollY + runway.getBoundingClientRect().top - stickyTop;
      const travelled = clamp(window.scrollY - pinStartY, 0, overflow);
      const itemLeft = item.offsetLeft;
      const itemRight = itemLeft + item.offsetWidth;

      let target = travelled;
      if (itemLeft - travelled < EDGE_MARGIN) {
        target = itemLeft - EDGE_MARGIN;
      } else if (itemRight - travelled > windowWidth - EDGE_MARGIN) {
        target = itemRight - windowWidth + EDGE_MARGIN;
      }
      target = clamp(target, 0, overflow);
      if (Math.abs(target - travelled) < 1) return;

      window.scrollTo({ top: pinStartY + target, behavior });
    },
    [overflow, windowWidth, stickyTop],
  );

  // Selecting a tab that is only half in the window pulls it fully into view.
  // Keyed off a CHANGE in `active`, not off the effect's dependency list: the
  // first measurement re-creates `scrollItemIntoView`, and a plain dep-array
  // effect would take that as a selection and scroll the page on mount — a
  // visible yank on any deep link or restored scroll position where the
  // remembered category sits outside the window.
  const lastActiveRef = useRef(active);
  const activeIndex = categories.indexOf(active);
  useEffect(() => {
    if (lastActiveRef.current === active) return;
    lastActiveRef.current = active;
    if (activeIndex < 0) return;
    scrollItemIntoView(activeIndex, prefersReducedMotion ? 'auto' : 'smooth');
  }, [active, activeIndex, scrollItemIntoView, prefersReducedMotion]);

  /**
   * Keyboard traversal. Tabbing to a clipped button makes the browser scroll
   * the nearest scrollable box to reveal it — here that is the overflow-hidden
   * window, whose scrollLeft is NOT part of the transform chain, so the strip
   * would silently desync. Undo that, then move the page instead, which is the
   * one input this component treats as the source of truth.
   */
  const handleFocus = useCallback(
    (event) => {
      if (windowRef.current) windowRef.current.scrollLeft = 0;
      if (!needsHijack) return;
      const items = Array.from(stripRef.current?.children ?? []);
      const index = items.findIndex((item) => item.contains(event.target));
      if (index >= 0) scrollItemIntoView(index, 'auto');
    },
    [needsHijack, scrollItemIntoView],
  );

  /**
   * Second input for touch (§5): a horizontal drag across the strip is
   * translated into vertical page scroll rather than into `x` directly.
   * Feeding the gesture back through the SAME scroll position the transform
   * reads from means the two inputs can never disagree — no post-drag
   * resync, no competing sources of truth.
   */
  const handlePan = useCallback((event, info) => {
    window.scrollBy(0, -info.delta.x);
  }, []);

  // A swipe that starts and ends on the same tab still produces a click, so a
  // flick to reach a further category would silently select whatever was under
  // the finger. Compare the click against where the pointer went down and drop
  // it if it travelled. `detail === 0` marks a keyboard-activated click (no
  // pointer, clientX is 0), which must always go through.
  const pointerDownXRef = useRef(null);
  const handleItemClick = useCallback(
    (cat, event) => {
      if (
        needsHijack &&
        event?.detail > 0 &&
        pointerDownXRef.current !== null &&
        Math.abs(event.clientX - pointerDownXRef.current) > CLICK_SLOP
      ) {
        return;
      }
      onSelect(cat);
    },
    [needsHijack, onSelect],
  );

  const depth = needsHijack && !prefersReducedMotion;

  return (
    <div
      ref={runwayRef}
      className={`w-full ${className}`}
      // The runway's extra height IS the scroll budget. `undefined` (not
      // "auto") when idle so nothing is written to the style attribute at all.
      style={needsHijack ? { height: pinHeight + overflow } : undefined}
    >
      <div
        ref={pinRef}
        style={
          needsHijack
            ? { position: 'sticky', top: stickyTop, zIndex: 30 }
            : undefined
        }
      >
        <div
          className="mx-auto w-fit"
          style={needsHijack ? { maxWidth: windowWidth } : undefined}
        >
          <div
            ref={windowRef}
            role="group"
            aria-label={label}
            onFocus={handleFocus}
            className={`relative ${
              needsHijack
                ? 'category-strip-pinned overflow-hidden rounded-full py-4'
                : ''
            }`}
          >
            <motion.div
              ref={stripRef}
              style={{ x }}
              onPan={needsHijack ? handlePan : undefined}
              onPointerDownCapture={(event) => {
                pointerDownXRef.current = event.clientX;
              }}
              className={`relative flex w-max items-center gap-6 px-3 ${
                needsHijack
                  ? 'touch-pan-y select-none will-change-transform'
                  : ''
              }`}
            >
              {categories.map((cat, index) => {
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
                    showCount={needsHijack && Boolean(counts)}
                    onSelect={handleItemClick}
                    scrollYProgress={scrollYProgress}
                    overflow={overflow}
                    center={centers[index] ?? 0}
                    windowWidth={windowWidth}
                    depth={depth}
                  />
                );
              })}
            </motion.div>
            {needsHijack && <FadeEdges progress={scrollYProgress} />}
          </div>
          {needsHijack && <ScrollProgressBar progress={progress} />}
        </div>
      </div>
    </div>
  );
};

export default ScrollHijackCategories;
