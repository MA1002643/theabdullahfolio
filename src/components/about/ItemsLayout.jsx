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
      viewport={{ once: false }}
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