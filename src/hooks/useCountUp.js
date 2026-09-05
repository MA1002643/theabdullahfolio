'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { animateToTarget } from '@/utils/animationCurves';

// Elite count-up as a hook (issue #40 follow-up): the same sprint-then-settle
// rAF tween the about-page stat cards and the home metric popovers run
// (animateToTarget / fastStartSlowFinish), packaged for values that keep
// changing after mount. While `active`, the first target = the entrance
// (0 → N over entranceMs); every later change re-tweens from the CURRENTLY
// PAINTED value over the shorter updateMs, so a live +1 tick reads as a
// quick roll, not a theatrical replay of the whole climb (the
// LiveMaintenanceHeader lesson).
//
// `active` is the replay trigger (owner-directed): pass the element's
// in-view state and the climb re-arms every time it leaves the viewport —
// scroll the pill away and back and the number counts up again, the same
// replay-on-return manners the meta strip's whileInView rise already has.
// Reduced motion paints every target instantly and never replays. Returns
// the integer to render.
export function useCountUp(
  target,
  { entranceMs = 2000, updateMs = 600, active = true } = {},
) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);
  // Raw (un-rounded) painted value, so a change mid-tween resumes exactly
  // where the eye left off; and a per-visit latch for the entrance duration.
  const paintedRef = useRef(0);
  const enteredRef = useRef(false);

  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    if (reduceMotion) {
      enteredRef.current = true;
      paintedRef.current = target;
      setDisplay(Math.round(target));
      return undefined;
    }
    if (!active) {
      // Off-screen: re-arm the entrance and park at 0 so the next visit
      // replays the full climb (the element is hidden by its own
      // whileInView reveal while this holds, so nobody reads the 0).
      enteredRef.current = false;
      paintedRef.current = 0;
      setDisplay(0);
      return undefined;
    }
    const entrance = !enteredRef.current;
    enteredRef.current = true;
    return animateToTarget({
      from: entrance ? 0 : paintedRef.current,
      to: target,
      duration: entrance ? entranceMs : updateMs,
      onUpdate: (v) => {
        paintedRef.current = v;
        setDisplay(Math.round(v));
      },
    });
  }, [target, active, reduceMotion, entranceMs, updateMs]);

  return display;
}
