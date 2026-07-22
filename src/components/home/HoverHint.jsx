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
const INSIDE_INSET = 10; // inset from the card edge in inside-anchored mode
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
  // 'trigger' (default) centres the bubble above the trigger — the
  // maintenance-header behaviour. 'inside' pins it centred WITHIN the
  // trigger and narrowed to fit, static (no pointer following) and revealed
  // only once the cursor rests on the card, for a large trigger the hint
  // should sit inside rather than beside (the NowPlaying badge that expands
  // into a console on hover — #42).
  anchor = 'trigger',
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
    // Inside mode reveals only on a settled dwell (see handleMouseMove), so
    // it always pays the full intent delay; the warm-open shortcut is a
    // header nicety for reading across adjacent fields.
    const delay =
      anchor === 'inside'
        ? OPEN_INTENT_MS
        : Date.now() - lastClosedAt < WARM_WINDOW_MS
          ? WARM_OPEN_MS
          : OPEN_INTENT_MS;
    openTimerRef.current = setTimeout(openNow, delay);
  };

  const handleMouseMove = () => {
    // Inside mode reveals on REST: any pointer movement before the hint
    // opens restarts the dwell, so it appears only once the cursor settles
    // on the card and never while sweeping across it. Once open it stays put
    // (static) — leaving the trigger is what closes it.
    if (anchor !== 'inside' || open || !canHover()) return;
    clearTimeout(openTimerRef.current);
    openTimerRef.current = setTimeout(openNow, OPEN_INTENT_MS);
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

  // Position the bubble. Both anchoring modes share the clamp + bail-when-
  // unchanged tail (the guard keeps the resize / ResizeObserver callbacks
  // from scheduling render loops):
  //   - 'trigger' (default): centred above the trigger, flipped below
  //     without headroom — the maintenance-header behaviour, unchanged.
  //   - 'inside': centred WITHIN the trigger and narrowed to fit inside it,
  //     so the hint sits contained in a large trigger instead of floating
  //     outside (the NowPlaying badge that expands on hover — #42). Static:
  //     no pointer following.
  const positionUpdate = useCallback(() => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;
    const rect = trigger.getBoundingClientRect();
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const maxLeft = Math.max(
      window.innerWidth - width - VIEWPORT_MARGIN,
      VIEWPORT_MARGIN,
    );
    const commit = (top, left, placement, maxWidth = null) =>
      setPos((prev) =>
        prev &&
        prev.top === top &&
        prev.left === left &&
        prev.maxWidth === maxWidth
          ? prev
          : { top, left, placement, maxWidth },
      );

    if (anchor === 'inside') {
      // Centre the bubble inside the trigger card, narrowed to fit within
      // the card so it never spills outside. Centre using the effective
      // (clamped) width so the one-frame re-wrap to `maxWidth` can't shift
      // it sideways as it appears.
      const innerMax = Math.max(rect.width - INSIDE_INSET * 2, 40);
      const effWidth = Math.min(width, innerMax);
      const left = Math.min(
        Math.max(rect.left + (rect.width - effWidth) / 2, VIEWPORT_MARGIN),
        maxLeft,
      );
      const top = Math.min(
        Math.max(rect.top + (rect.height - height) / 2, VIEWPORT_MARGIN),
        Math.max(window.innerHeight - height - VIEWPORT_MARGIN, VIEWPORT_MARGIN),
      );
      commit(top, left, 'inside', innerMax);
      return;
    }

    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, VIEWPORT_MARGIN),
      maxLeft,
    );
    let top = rect.top - height - TRIGGER_GAP;
    let placement = 'above';
    if (top < VIEWPORT_MARGIN) {
      top = rect.bottom + TRIGGER_GAP;
      placement = 'below';
    }
    commit(top, left, placement);
  }, [anchor]);

  // Remeasure on resize and whenever live content resizes the bubble (the
  // inside-mode re-wrap to `maxWidth`, or arrow-stepping the focus queue
  // swapping the title under an open keyboard-focused hint). Position resets
  // on close so a reopen never flashes at the previous coordinates.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    positionUpdate();
    window.addEventListener('resize', positionUpdate);
    const bubbleResize =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(positionUpdate)
        : null;
    if (bubbleRef.current) bubbleResize?.observe(bubbleRef.current);
    return () => {
      window.removeEventListener('resize', positionUpdate);
      bubbleResize?.disconnect();
    };
  }, [open, positionUpdate]);

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
    // Inside mode only: rest-to-reveal needs per-move dwell resets. Omitted
    // for other modes so their triggers don't carry a mousemove listener.
    ...(anchor === 'inside'
      ? {
          onMouseMove: (event) => {
            child.props.onMouseMove?.(event);
            handleMouseMove(event);
          },
        }
      : null),
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
          ? {
              top: pos.top,
              left: pos.left,
              ...(pos.maxWidth ? { maxWidth: pos.maxWidth } : {}),
            }
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
