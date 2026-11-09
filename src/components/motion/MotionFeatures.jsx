'use client';

import { useEffect, useState } from 'react';
import { LazyMotion, MotionConfig, PresenceContext } from 'framer-motion';

import { loadLayoutFeatures, loadMotionFeatures } from '@/lib/motion/loadFeatures';

import { STATIC_PRESENCE } from './staticMotion';

// framer-motion on LazyMotion (issue #200). Every animated element on the site
// is an `m.*` component, which renders with framer's small core and takes its
// animation features from the nearest <LazyMotion>. The features arrive in
// their own chunk after the first paint instead of riding in every route's
// first-load JS.
//
// `strict`: a `motion.*` component rendered anywhere below throws in
// development, because one would quietly pull the full feature bundle back in.
// tests/fitness/lazyMotion.test.js enforces the same rule on the source.
//
// Until the chunk lands an `m.*` element shows its server-rendered `initial`
// style and does not animate; when it lands, framer plays the entrance it
// would have played on mount (`manuallyAnimateOnMount`). The download starts
// while the page hydrates (src/lib/motion/loadFeatures.js), so in practice the
// wait is a fraction of a frame on a warm connection.
//
// A separate React root (drei's <Html>, which mounts the laptop screen on
// /projects/[id]) inherits none of this context, so it renders its own
// <MotionFeatures>. The loader is memoised, so that costs no second download.

// When the loader gives up on the chunk (src/lib/motion/loadFeatures.js), the
// subtree is mounted again in STATIC mode: `MotionConfig isStatic` plus the
// static presence (./staticMotion.js). framer then renders every `m.*` from
// its props alone, at its `animate` target, on every render, with no renderer:
// the page shows each entrance at its end state, and a gate that opens later
// (the intro loader, a viewport trigger) still reveals what it gates, because
// it re-renders the element. Nested <AnimatePresence> boundaries re-apply the
// static presence to their children (./AnimatePresence.jsx), so a dialog
// opened afterwards is visible too. Hover, tap and `layout` do nothing.
//
// It takes a REMOUNT: framer reads `isStatic` once per element and branches
// its hooks on it, so flipping it on a mounted tree would break React's hook
// order. That loses client state below the provider, which is the right trade
// only for a visit whose animations are never coming. Giving up is final (the
// loader fetches nothing more), so a static tree stays static: the next full
// page load animates again.

/** True once `loader` has given up on its chunk. */
function useGaveUp(loader) {
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => loader.onGiveUp(() => setGaveUp(true)), [loader]);
  return gaveUp;
}

function Provider({ loader, children }) {
  const gaveUp = useGaveUp(loader);
  return (
    <LazyMotion features={loader} strict>
      {gaveUp ? (
        // A different element type at this position: React mounts the subtree
        // afresh, which is what makes framer read the static config.
        <MotionConfig isStatic>
          <PresenceContext.Provider value={STATIC_PRESENCE}>{children}</PresenceContext.Provider>
        </MotionConfig>
      ) : (
        children
      )}
    </LazyMotion>
  );
}

/** The root provider. Wraps the whole document body in `[locale]/layout.js`. */
export default function MotionFeatures({ children }) {
  return <Provider loader={loadMotionFeatures}>{children}</Provider>;
}

/**
 * Layout projection for one subtree. The guestbook wall's cards animate their
 * `layout`, which `domAnimation` does not include; wrapping only the wall keeps
 * the projection engine off every other route.
 */
export function LayoutMotionFeatures({ children }) {
  return <Provider loader={loadLayoutFeatures}>{children}</Provider>;
}
