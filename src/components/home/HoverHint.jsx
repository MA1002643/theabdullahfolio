'use client';

import {
  Children,
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

// Styled replacement for the native `title` tooltip across the
// maintenance header (issue #94 follow-up). Browsers render `title`
// entirely outside the page — it cannot be styled — so every hint the
// strip used to delegate to it renders through this floater instead: the
// site's card surface (custom-bg-abt, the HomeBtn tooltip precedent) at
// micro scale, an optional eyebrow in the strip's field-label voice, and
// the body copy in the sub-row cream.
//
//   - Hover intent: opens after 450ms — deliberate dwells only — or after
//     80ms when another hint closed within the last 300ms, so reading
//     along the strip doesn't re-pay the intent delay per field.
//   - Keyboard: :focus-visible opens immediately; blur closes.
//   - Touch: never opens (matchMedia-gated like the popovers) — sr text
//     and aria-labels at the call sites carry the same information.
//   - Dismissal: leave, Esc, any scroll (fixed coordinates go stale), any
//     pointerdown (a click means acting, not reading). The bubble itself
//     is pointer-events-none — it is a label, never a hover target.
//
// Portalled to <body> and positioned `fixed` for the same reason as
// MetricPopover: the header section is overflow-hidden AND animates
// transforms, either of which would clip or re-anchor an in-place
// tooltip. Prefers ABOVE the trigger — the popovers own the space below,
// and the two surfaces answering from opposite sides keeps them legible
// as different instruments — flipping below only without headroom.
//
// The single child is cloned with the trigger handlers and ref, so the
// hint adds no wrapper element that could disturb flex layouts. Callers
// must pass a child that takes a ref (host element or motion component)
// and doesn't carry its own ref.

const OPEN_INTENT_MS = 450;
const WARM_OPEN_MS = 80;
const WARM_WINDOW_MS = 300;
const CLOSE_GRACE_MS = 80;
const TRIGGER_GAP = 7;
const VIEWPORT_MARGIN = 8;
const HOVER_QUERY = '(hover: hover) and (pointer: fine)';

// One hint visible page-wide (same discipline as the popovers' slot), and
// a shared close timestamp backing the warm-open window.
let closeActiveHint = null;
let lastClosedAt = 0;

const canHover = () =>
  typeof window !== 'undefined' && window.matchMedia(HOVER_QUERY).matches;

export default function HoverHint({
  label,
  content,
  reduceMotion = false,
  children,
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState(null);

  const triggerRef = useRef(null);
  const bubbleRef = useRef(null);
  const openTimerRef = useRef(null);
  const closeTimerRef = useRef(null);

  const closeSelf = useCallback(() => {
    setOpen(false);
    lastClosedAt = Date.now();
  }, []);

  // Portal target only exists client-side; flipping `mounted` in an
  // effect keeps server and first client render identical.
  useEffect(() => {
    setMounted(true);
    return () => {
      clearTimeout(openTimerRef.current);
      clearTimeout(closeTimerRef.current);
      if (closeActiveHint === closeSelf) closeActiveHint = null;
    };
  }, [closeSelf]);

  const openNow = useCallback(() => {
    clearTimeout(openTimerRef.current);
    clearTimeout(closeTimerRef.current);
    if (closeActiveHint && closeActiveHint !== closeSelf) closeActiveHint();
    closeActiveHint = closeSelf;
    setOpen(true);
  }, [closeSelf]);

  const closeNow = useCallback(() => {
    clearTimeout(openTimerRef.current);
    clearTimeout(closeTimerRef.current);
    closeSelf();
    if (closeActiveHint === closeSelf) closeActiveHint = null;
  }, [closeSelf]);

  const handleMouseEnter = () => {
    if (!canHover()) return;
    clearTimeout(closeTimerRef.current);
    if (open) return;
    const delay =
      Date.now() - lastClosedAt < WARM_WINDOW_MS
        ? WARM_OPEN_MS
        : OPEN_INTENT_MS;
    openTimerRef.current = setTimeout(openNow, delay);
  };

  const handleMouseLeave = () => {
    clearTimeout(openTimerRef.current);
    if (open) closeTimerRef.current = setTimeout(closeNow, CLOSE_GRACE_MS);
  };

  const handleFocus = (event) => {
    // Only keyboard-driven focus opens — a mouse click that happens to
    // focus a link trigger shouldn't pop a hint under the cursor.
    let keyboardFocus = true;
    try {
      keyboardFocus = event.target.matches(':focus-visible');
    } catch {
      // engines without :focus-visible — treat focus as keyboard
    }
    if (keyboardFocus) openNow();
  };

  const handleBlur = () => closeNow();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeNow();
    };
    const onPointerDown = () => closeNow();
    const onScroll = () => closeNow();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    // Capture phase catches nested scroll containers (the popovers' item
    // lists) as well as the window; passive because it only dismisses.
    window.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [open, closeNow]);

  // Centered above the trigger, clamped to the viewport, flipped below
  // without headroom. Remeasured on resize and whenever live content
  // resizes the bubble (arrow-stepping the focus queue swaps the title
  // under an open keyboard-focused hint). Position resets on close so a
  // reopen never flashes at the previous trigger's coordinates.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const trigger = triggerRef.current;
      const bubble = bubbleRef.current;
      if (!trigger || !bubble) return;
      const rect = trigger.getBoundingClientRect();
      const width = bubble.offsetWidth;
      const height = bubble.offsetHeight;
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - width / 2, VIEWPORT_MARGIN),
        Math.max(window.innerWidth - width - VIEWPORT_MARGIN, VIEWPORT_MARGIN),
      );
      let top = rect.top - height - TRIGGER_GAP;
      let placement = 'above';
      if (top < VIEWPORT_MARGIN) {
        top = rect.bottom + TRIGGER_GAP;
        placement = 'below';
      }
      // Bail-when-unchanged keeps the ResizeObserver callback from
      // scheduling render loops.
      setPos((prev) =>
        prev && prev.top === top && prev.left === left
          ? prev
          : { top, left, placement },
      );
    };
    update();
    window.addEventListener('resize', update);
    const bubbleResize =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (bubbleRef.current) bubbleResize?.observe(bubbleRef.current);
    return () => {
      window.removeEventListener('resize', update);
      bubbleResize?.disconnect();
    };
  }, [open]);

  // The reveal is gated on being positioned so the settle never plays at
  // the pre-measure coordinates.
  const ready = open && Boolean(pos);
  // Settle direction: toward rest from the trigger's side. Pre-measure
  // the default 'above' offset applies; the bubble is invisible until
  // positioned, so a rare flip only changes a 4px start no one sees.
  const dirY = pos?.placement === 'below' ? -4 : 4;

  const child = Children.only(children);
  const trigger = cloneElement(child, {
    ref: triggerRef,
    onMouseEnter: (event) => {
      child.props.onMouseEnter?.(event);
      handleMouseEnter(event);
    },
    onMouseLeave: (event) => {
      child.props.onMouseLeave?.(event);
      handleMouseLeave(event);
    },
    onFocus: (event) => {
      child.props.onFocus?.(event);
      handleFocus(event);
    },
    onBlur: (event) => {
      child.props.onBlur?.(event);
      handleBlur(event);
    },
    'aria-describedby': open ? id : child.props['aria-describedby'],
  });

  const bubble = (
    <motion.div
      ref={bubbleRef}
      key="hint"
      id={id}
      role="tooltip"
      initial={
        reduceMotion ? { opacity: 0 } : { opacity: 0, y: dirY, scale: 0.98 }
      }
      animate={
        ready
          ? reduceMotion
            ? { opacity: 1, transition: { duration: 0.12 } }
            : {
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { duration: 0.16, ease: 'easeOut' },
              }
          : undefined
      }
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      className="custom-bg-abt pointer-events-none fixed z-[70] max-w-[min(20rem,calc(100vw-16px))] rounded-md px-3 py-2 text-left"
      style={
        pos
          ? { top: pos.top, left: pos.left }
          : { top: 0, left: 0, visibility: 'hidden' }
      }
    >
      {label ? (
        <p className="mb-1 whitespace-nowrap text-[9px] font-medium uppercase leading-none tracking-[0.22em] text-[#ffaa2a]">
          {label}
        </p>
      ) : null}
      <div className="break-words text-[11px] font-medium leading-snug text-[#f9d174]">
        {content}
      </div>
    </motion.div>
  );

  return (
    <>
      {trigger}
      {mounted &&
        createPortal(
          <AnimatePresence>{open ? bubble : null}</AnimatePresence>,
          document.body,
        )}
    </>
  );
}
