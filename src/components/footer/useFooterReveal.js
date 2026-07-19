'use client';

// Re-arming, loader-gated "is this footer block on screen?" flag — the single
// reveal-trigger primitive every footer element shares.
//
// Why NOT `useInView(once)`: the footer is rendered ONCE in the (sub pages)
// layout and PERSISTS across client-side navigations (verified: the same footer
// node survives an SPA route change). A `once` observer latches on the FIRST
// intersection for the life of that persistent node — which, on a route swap or
// a page-transition overlay, is a transient flicker while the footer is off-
// screen/covered. The entrance is then "spent" where nobody sees it and never
// replays, so on the next page the block just sits at its final state ("no
// animation at all"). That is exactly the bug this hook removes: each block must
// re-animate WHEN THE USER ACTUALLY SCROLLS IT INTO VIEW, every time — never as a
// side effect of the footer's first section appearing during a transition.
//
// The mechanism (the pattern the reach strip + meta row already ran inline, now
// the one source of truth): fire when a meaningful `amount` of the element is on
// screen AND the intro loader has lifted, then RESET once it is fully out of view
// again so the next real entry replays it. The two thresholds — `amount` to fire,
// any-pixel to reset — give hysteresis, so a partial scroll-away never blanks a
// block while it is still partly visible. The reset only ever happens off-screen,
// so the user never sees a block snap back to hidden.
//
// @param {import('react').RefObject<Element>} ref  the observed block
// @param {number | 'some' | 'all'} amount  portion on screen required to fire
// @returns {boolean} revealed — true while the block should show its entrance
import { useEffect, useState } from 'react';
import { useInView } from 'framer-motion';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';

export function useFooterReveal(ref, amount = 0.35) {
  // Fires when `amount` of the block is on screen; resets when NO pixel is.
  const inView = useInView(ref, { amount });
  const anyInView = useInView(ref, { amount: 'some' });
  const loaderRevealed = useLoaderRevealed();

  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (inView && loaderRevealed) setRevealed(true);
    else if (!anyInView) setRevealed(false);
  }, [inView, anyInView, loaderRevealed]);

  return revealed;
}
