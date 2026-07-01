"use client";
import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { forwardRef } from "react";
import { useCardTilt } from "@/hooks/useCardTilt";

// Per-step delay (seconds) for the orchestrated hero-row cascade. The
// above-the-fold trio (Architect paragraph + the two feature cards) pass
// `revealOrder={0|1|2}`; everything else defaults to 0 (no delay).
const REVEAL_STAGGER = 0.12;

// `forwardRef` + spread `...rest` so the years card on the about page
// (and any future consumer) can attach an onClick/role/tabIndex/ref
// without forking the layout. All existing call sites pass only
// `className` and `children` and stay binary-compatible.
const ItemLayout = forwardRef(function ItemLayout(
  { children, className, revealWhen, revealOrder = 0, tilt = false, style: styleProp, ...rest },
  ref,
) {
  // Pointer-reactive tilt + ember glare. The hook returns inert (undefined
  // style/handlers) on touch / non-hover input and under reduced motion, so
  // calling it unconditionally is safe — we only WIRE it when `tilt` is set.
  // Measurement is read from the pointer event's currentTarget, so the hook
  // owns no ref and never conflicts with the forwarded `ref` above.
  const { style: tiltStyle, glareStyle, handlers: tiltHandlers } = useCardTilt();
  const tiltOn = tilt && Boolean(tiltStyle);

  // Under reduced motion the entrance is a pure cross-fade (no scale) — opacity
  // changes are vestibular-safe, the 0.96 → 1 scale is the part to drop.
  const prefersReducedMotion = useReducedMotion();
  const hiddenState = prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 };
  const visibleState = prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 };

  // Entrance reveal — a restrained "materialize" (opacity 0 → 1, scale
  // 0.96 → 1), identical for every about-page card. This replaced an earlier
  // scale 0 → 1: a wrapper animating from literal scale 0 has ~zero rendered
  // area at the start of its transition, which collapsed the
  // IntersectionObservers of the cards INSIDE it (the whole reason the
  // useReliableInView / inner-observer scaffolding exists). A 0.96 floor keeps
  // real area throughout, so the entrance reads as a soft fade-in rather than a
  // balloon pop and stops sabotaging the inner observers. No `y` translate on
  // purpose: the feature cards run their own y-rise stagger inside
  // (revealVariants.js); adding one here would compound into an overshoot.
  //
  // Two ways to trigger it:
  //
  // • Default (`revealWhen` omitted): scroll-triggered via `whileInView`, right
  //   for every card reached by scrolling. `once: true` so it plays a single
  //   time; `amount: 0.2` waits for a stable 20% before firing.
  //
  // • Controlled (`revealWhen` is a boolean): the caller drives the reveal. The
  //   above-the-fold cards sit on screen at scroll 0 — i.e. behind the
  //   full-screen intro loader (see LoaderWrapper), which covers the page for
  //   ~3.3s. A `whileInView` (or mount) reveal there fires and finishes WHILE
  //   still covered, so the user only ever sees the final state and the card
  //   reads as "no animation". Those cards pass `revealWhen={loaderRevealed}`
  //   so the entrance is held hidden until the loader lifts, then plays in view.
  const initial = hiddenState;
  const reveal =
    revealWhen === undefined
      ? {
          whileInView: visibleState,
          viewport: { once: true, amount: 0.2 },
        }
      : {
          animate: revealWhen ? visibleState : hiddenState,
        };

  return (
    <motion.div
      ref={ref}
      initial={initial}
      {...reveal}
      // `delay` cascades the hero trio (revealOrder 0 → 1 → 2) into one
      // sequential gesture as the loader lifts; 0 for every other card.
      transition={{ duration: 0.5, ease: "easeOut", delay: revealOrder * REVEAL_STAGGER }}
      // `relative` anchors the absolute glare overlay below. tilt style
      // (rotateX/rotateY/perspective motion values) composes with the animated
      // opacity/scale entrance — different transform channels, no conflict.
      style={{ ...(tiltOn ? tiltStyle : null), ...styleProp }}
      {...(tiltOn ? tiltHandlers : null)}
      // `space-y-8` was dead styling — every existing consumer wraps a
      // single visible child so the inter-child margin never fired. It
      // *did* fire on the years card after issue #17 added the
      // ExperienceUpdateBanner as a second direct child, pushing the h1
      // 2rem off the centered axis. Dropping the utility is a true no-op for
      // every other ItemLayout instance and unbreaks the centering.
      className={clsx(
        "custom-bg-abt relative p-6 sm:p-8 rounded-xl flex items-center justify-center",
        className
      )}
      {...rest}
    >
      {children}
      {/* Ember glare — an aria-hidden radial highlight that tracks the cursor
          across the card surface. `rounded-[inherit]` clips the gradient to the
          card's own border-radius (a background paints inside the element's
          rounded box), so it follows the rounded shape WITHOUT an
          `overflow-hidden` that would clip custom-bg-abt's outer amber glow.
          Only rendered when tilt is actually armed (hover + no reduced motion). */}
      {tiltOn && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={glareStyle}
        />
      )}
    </motion.div>
  );
});

export default ItemLayout;
