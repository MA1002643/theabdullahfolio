'use client';

import { LazyMotion } from 'framer-motion';

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

/** The root provider. Wraps the whole document body in `[locale]/layout.js`. */
export default function MotionFeatures({ children }) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      {children}
    </LazyMotion>
  );
}

/**
 * Layout projection for one subtree. The guestbook wall's cards animate their
 * `layout`, which `domAnimation` does not include; wrapping only the wall keeps
 * the projection engine off every other route.
 */
export function LayoutMotionFeatures({ children }) {
  return (
    <LazyMotion features={loadLayoutFeatures} strict>
      {children}
    </LazyMotion>
  );
}
