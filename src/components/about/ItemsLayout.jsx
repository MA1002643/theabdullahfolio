"use client";
import { motion } from "framer-motion";
import clsx from "clsx";
import { forwardRef } from "react";

// `forwardRef` + spread `...rest` so the years card on the about page
// (and any future consumer) can attach an onClick/role/tabIndex/ref
// without forking the layout. All existing call sites pass only
// `className` and `children` and stay binary-compatible.
const ItemLayout = forwardRef(function ItemLayout(
  { children, className, ...rest },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      initial={{ scale: 0 }}
      whileInView={{ scale: 1 }}
      transition={{ duration: 0.5 }}
      // `once: true` is load-bearing, not a preference. With `once: false` this
      // wrapper re-ran scale 0 → 1 on every viewport edge-cross, and a wrapper
      // scaled toward 0 has ~0 area — which collapsed the IntersectionObservers
      // of the cards INSIDE it (their `useInView`/`settledInView` flipped),
      // resetting and replaying their content entrance in a flicker loop
      // ("content loads on and off" when half-visible). Animating the wrapper in
      // ONCE keeps it at full size thereafter, so inner observers stay reliable;
      // the cards' own entrances still replay on re-entry via their debounced
      // `settledInView`. `amount: 0.2` waits for a stable 20% before firing.
      viewport={{ once: true, amount: 0.2 }}
      // `space-y-8` was dead styling — every existing consumer wraps a
      // single visible child so the inter-child margin never fired. It
      // *did* fire on the years card after issue #17 added the
      // ExperienceUpdateBanner as a second direct child (sr-only +
      // banner overlay sibling to the h1), pushing the h1 2rem off
      // the centered axis. Dropping the utility is a true no-op for
      // every other ItemLayout instance and unbreaks the centering
      // without per-consumer overrides.
      className={clsx(
        "custom-bg-abt p-6 sm:p-8 rounded-xl flex items-center justify-center",
        className
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
});

export default ItemLayout;