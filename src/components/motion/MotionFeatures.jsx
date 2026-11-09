'use client';

import { useEffect, useState } from 'react';
import { LazyMotion, PresenceContext } from 'framer-motion';

import { loadLayoutFeatures, loadMotionFeatures } from '@/lib/motion/loadFeatures';

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
// subtree is mounted again under this presence context. `initial: false` is
// framer's own "initial animation blocked" signal: an `m.*` element then seeds
// its style from its `animate` target (the LAST keyframe of an array) instead
// of from `initial`. That happens while the element is created, without the
// renderer the chunk would have brought, so the page shows every entrance at
// its end state: visible text, not text stuck at opacity 0. An element with
// only `whileInView` gets no seeded style at all, which is also visible.
//
// It takes a REMOUNT, because framer reads presence once, when an element
// first renders. That loses client state below the provider, and it is the
// right trade only for a visit whose animations are never coming. Content
// opened later inside an <AnimatePresence> gets that component's own presence
// context and still starts at `initial`; the page's own content does not.
const STATIC_PRESENCE = {
  id: 'motion-static',
  initial: false,
  isPresent: true,
  custom: undefined,
  onExitComplete: undefined,
  register: () => () => {},
};

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
        // afresh, which is what makes framer read the new presence.
        <PresenceContext.Provider value={STATIC_PRESENCE}>{children}</PresenceContext.Provider>
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
