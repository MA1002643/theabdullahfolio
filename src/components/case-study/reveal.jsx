'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { usePageTransition } from '@/components/pageTransition/PageTransitionProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useDirection } from '@/i18n/useDirection';
import { distance, dur, ease, riseTransition } from '@/lib/motion/caseStudy';

// The case study's entrance primitives (issue #31, M3 + M9).
//
// One rule from CLAUDE.md §6 shapes all of them: a trigger is STATE bound to
// `animate`, never a control started from an effect. `shown` flips once, and
// every element below re-renders to its `animate` target. That is what keeps
// the page whole in framer's static mode (the features chunk never arrived):
// there the elements render at the target from props, with no renderer.
//
// The server renders the hidden pose (`initial`). Two things undo it for a
// reader who never runs this code: the <noscript> rule CaseStudy.jsx emits,
// keyed on the data attributes set here, and static mode as above.

const RevealContext = createContext({ shown: true });

/** Whether the nearest reveal scope has fired. Outside one, always true. */
export const useRevealShown = () => useContext(RevealContext).shown;

/**
 * True once `ref` first enters the viewport, then latched.
 *
 * An IntersectionObserver with `threshold: 0` and a −12 % bottom margin, not
 * a fraction of the element: a chapter taller than a phone viewport can never
 * show 30 % of itself at once, so a fractional threshold would never fire
 * there (the /uses Stack plate defect). The observed node is always the OUTER
 * wrapper; anything clipped to zero area lives inside it, because an observer
 * target that starts with a zero-area clip-path never intersects in Chromium.
 */
export function useEnteredView(ref) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || entered) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setEntered(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setEntered(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, entered]);
  return entered;
}

/**
 * A chapter's reveal scope: everything inside rises once the chapter enters.
 * The wrapper flags `data-cs-entered` on entry, which is what ignites the
 * chapter's ember divider (`.cs-chapter:has([data-cs-entered])::before`) —
 * a CSS transition keyed on state, so it needs no framer features at all.
 */
export function ChapterReveal({ className, children }) {
  const ref = useRef(null);
  const shown = useEnteredView(ref);
  return (
    <div ref={ref} data-cs-entered={shown ? '' : undefined} className={className}>
      <RevealContext.Provider value={{ shown }}>{children}</RevealContext.Provider>
    </div>
  );
}

/**
 * The hero's reveal scope. It does not wait for the viewport (the hero is the
 * viewport); it waits for the Ember Passage to lift, so the entrance is not
 * played underneath the overlay (§5). After a direct load there is no
 * passage, and it fires on the first client render after hydration.
 */
export function HeroReveal({ children }) {
  const { transitioning } = usePageTransition();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <RevealContext.Provider value={{ shown: mounted && !transitioning }}>{children}</RevealContext.Provider>
  );
}

const RISE = {
  hidden: { opacity: 0, y: distance.rise },
  shown: { opacity: 1, y: 0 },
};

/**
 * One element of a choreographed entrance: it rises `distance.rise` px and
 * fades in when its scope fires, `order` steps after the scope's first
 * element (eyebrow → heading → body → media → secondary, §5).
 * Under reduced motion it is simply shown.
 */
export function Rise({ as = 'div', order = 0, delay, className, children, ...rest }) {
  const shown = useRevealShown();
  const reduced = useReducedMotion();
  const Tag = m[as];
  const transition = reduced
    ? { duration: 0 }
    : delay != null
      ? { duration: dur.slow, ease: ease.out, delay }
      : riseTransition(order);
  return (
    <Tag
      data-cs-rise=""
      className={className}
      initial="hidden"
      animate={shown ? 'shown' : 'hidden'}
      variants={RISE}
      transition={transition}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * M9: media that opens from its reading-start edge while the image inside
 * settles from 1.08 to 1. The clip is on an INNER wrapper, so the outer
 * element, which is what the observer watches, always has its full area.
 */
export function ClipMedia({ className, innerClassName, order = 0, children }) {
  const ref = useRef(null);
  const entered = useEnteredView(ref);
  const scoped = useRevealShown();
  const shown = entered && scoped;
  const reduced = useReducedMotion();
  const { isRtl } = useDirection();
  const closed = isRtl ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)';
  const transition = reduced
    ? { duration: 0 }
    : { duration: dur.hero, ease: ease.out, delay: order * 0.08 };
  return (
    <div ref={ref} className={className}>
      <m.div
        data-cs-clip=""
        className="h-full w-full overflow-clip"
        initial={{ clipPath: closed }}
        animate={{ clipPath: shown ? 'inset(0% 0% 0% 0%)' : closed }}
        transition={transition}
      >
        <m.div
          data-cs-clip=""
          className={innerClassName ?? 'h-full w-full'}
          initial={{ scale: 1.08 }}
          animate={{ scale: shown ? 1 : 1.08 }}
          transition={transition}
        >
          {children}
        </m.div>
      </m.div>
    </div>
  );
}
