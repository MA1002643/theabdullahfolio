'use client';

import { useEffect, useRef } from 'react';
import { m, useScroll, useTransform } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useStaticMotion } from '@/components/motion/useStaticMotion';

// The two ember pools of the project page's backdrop (issue #31, owner
// review 2026-11-15). Each drifts upward a little slower than the page
// scrolls, at two different rates, so the ground has depth without any
// element the reader could mistake for content.
//
// One hop from the page scroll to each transform. Whether the pools move is
// read from a ref at frame time, so a change in the motion preference takes
// effect without rebuilding the transforms, and the first client render
// writes the same `transform: none` the server did (y = 0 either way), so a
// reader who prefers reduced motion never sees a hydration mismatch.
//
// Static mode (framer's features never arrived): the values are read once at
// 0 and never again, which leaves the pools at rest. That freeze is purely
// decorative and is the intended still picture (CLAUDE.md §6).
//
// The slow breathing is CSS on the inner element (`.cs-backdrop__pool i`),
// not here: framer owns this element's transform, and a keyframe on the same
// property would fight it.

const RATES = { slow: -0.06, fast: -0.12 };

export default function BackdropPools() {
  const reduced = useReducedMotion();
  const isStatic = useStaticMotion();
  const still = useRef(true);
  useEffect(() => {
    still.current = reduced || isStatic;
  }, [reduced, isStatic]);

  const { scrollY } = useScroll();
  const slow = useTransform(scrollY, (y) => (still.current ? 0 : y * RATES.slow));
  const fast = useTransform(scrollY, (y) => (still.current ? 0 : y * RATES.fast));

  return (
    <>
      <m.div className="cs-backdrop__pool cs-backdrop__pool--a" style={{ y: slow }}>
        <i />
      </m.div>
      <m.div className="cs-backdrop__pool cs-backdrop__pool--b" style={{ y: fast }}>
        <i />
      </m.div>
    </>
  );
}
