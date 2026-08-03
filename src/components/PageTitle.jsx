"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useLoaderRevealed } from "@/hooks/useLoaderRevealed";

// Shared page-title block. Single source of truth for sub-page
// headings so every page reads with the same visual weight, font
// sizes, neon stroke, and pink subtitle halo as the qualifications
// page (the reference style for issue #104).
//
// Why this lives here, not as ad-hoc per-page markup:
//   - Several pages had drifted to their own sizes which made the header
//     rhythm shift as the user navigated. Centralising the classes
//     means a future tweak to spacing or font-weight propagates
//     everywhere automatically.
//   - The pink neon subtitle palette (#fc83ff fill + matching pink
//     text-shadow halo) was repeated inline as a style object on
//     every page. Inlining it here removes the duplication.
//
// Motion (the cinematic headline handoff): the title ignites letter by
// letter — each glyph rises a touch and flashes brighter before settling
// into the resting ember fill — picking up the energy of the intro loader's
// ember wipe instead of the page landing on a dead, static headline. The
// reveal is gated on `useLoaderRevealed()` (the SAME signal the about-page
// feature cards use), so on a first visit the letters ignite exactly as the
// loader lifts; on a same-site navigation the loader is already done and they
// ignite on mount. Because LoaderWrapper lives in the root layout, every
// sub-page that renders PageTitle gets this for free.
//
// Accessibility / SEO: the letters are real text inside the <h1> (crawlable),
// the animated spans are `aria-hidden`, and the <h1> carries an `aria-label`
// of the full title so assistive tech announces one clean string rather than
// a string of single characters. Under `prefers-reduced-motion` the headline
// renders at its final state with no transform.
//
// Props:
//   - `title`    — primary heading text. Required.
//   - `subtitle` — optional secondary text. Omit to render only h1.
//   - `id`       — optional DOM id forwarded to the wrapping div so existing
//                  anchor links (e.g. about/projects' `id="about"`) keep working.
//   - `replayOnView` — opt-in scroll replay (issue #46). When set, the ignite
//                  re-arms whenever the block leaves the viewport and plays
//                  again on every return, instead of playing once per mount.
//                  Every current sub-page opts in (/qualifications via issue
//                  #46, then /projects per issue #28 and /about + /contact to
//                  match), but the default stays off so a future consumer
//                  makes the choice explicitly — play-once is the cheaper
//                  mode (its observer disconnects after the first reveal).
//                  No effect under prefers-reduced-motion, which stays
//                  pinned at the final state.

// Shared subtitle palette — extracted so flank pills and the h2
// itself reference exactly the same pink fill + halo.
const SUBTITLE_STYLE = {
  color: "rgb(252 131 255 / var(--tw-text-opacity, 1))",
  textShadow: "0 0 5px #ff55f7, 0 0 10px #ff55f7, 0 0 20px #ff55f7",
  "--tw-text-opacity": "1",
};

// Style of each flank pill — solid #fc83ff fill + the same pink-neon halo.
const FLANK_PILL_STYLE = {
  backgroundColor: "#fc83ff",
  boxShadow: "0 0 5px #ff55f7, 0 0 10px #ff55f7",
};

// Letters cascade left → right. Small stagger so even a long title finishes
// quickly, with a brief lead-in so it doesn't start the instant the wipe begins.
const TITLE_CONTAINER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.08 } },
};

// Per-letter ignite: rises from just below + flashes ~2.2× brightness on the
// ember fill, then settles. The custom ease is a soft over-damped landing.
const LETTER = {
  hidden: { opacity: 0, y: "0.35em", filter: "brightness(2.4)" },
  visible: {
    opacity: 1,
    y: "0em",
    filter: "brightness(1)",
    transition: { duration: 0.55, ease: [0.2, 0.65, 0.3, 1] },
  },
};

// Subtitle (flank pills + text) eases up together, after the letters — a small
// delay places it at the tail of the headline reveal.
const SUBTITLE_MOTION = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut", delay: 0.45 },
  },
};

export default function PageTitle({ title, subtitle, id, replayOnView = false }) {
  const prefersReducedMotion = useReducedMotion();
  const revealed = useLoaderRevealed();
  // The hook always runs (hooks can't be conditional) but the value is only
  // consulted when replayOnView is set — so on the play-once pages
  // `once: true` lets the IntersectionObserver disconnect after the first
  // intersection instead of pushing an unused state update on every
  // scroll-past for the life of the page. Safe as a render-time expression
  // because replayOnView is a static per-page prop, never flipped at runtime.
  // amount 0.35 = the block must be a third visible before it counts as "on
  // screen" — enough that the replay starts while the user can actually see
  // it, not while it's a sliver at the viewport edge.
  const rootRef = useRef(null);
  const inView = useInView(rootRef, { amount: 0.35, once: !replayOnView });
  // Reduced motion → start (and stay) at the final state, no transform. Else
  // hold hidden until the loader has revealed the page, then ignite — and,
  // with replayOnView, drop back to hidden whenever the block scrolls out of
  // view so the ignite replays on every return.
  const play = prefersReducedMotion || (revealed && (!replayOnView || inView));
  const initial = prefersReducedMotion ? "visible" : "hidden";

  // Sizing lives in the .page-title-* semantic classes (globals.css, issue
  // #50), not Tailwind arbitrary values: their base rules ARE the old
  // classes' exact values, and inside a `.fluid-scale` scope (only /projects
  // today) the same markup re-derives every size from the page's single
  // fluid factor. Adopting fluid titles on another page needs no change
  // here — opt the page in and these follow.
  //
  // Split into characters; spaces become non-animated spacer spans so word gaps
  // survive the inline-block letters (a transformed inline-block needs explicit
  // whitespace between words).
  const chars = Array.from(title);

  return (
    <div ref={rootRef} id={id} className="page-title-block z-50 text-center">
      {/* No `text-transparent` here — `.text-glow-stroke-neon` paints a solid
          #ff6d05 fill so each letter renders as a filled orange glyph (closing
          the M / W hollow gap on CONTACT ME / ABOUT ME). The -webkit-text-stroke
          + drop-shadow halo apply to the descendant letter spans automatically. */}
      <motion.h1
        aria-label={title}
        variants={TITLE_CONTAINER}
        initial={initial}
        animate={play ? "visible" : "hidden"}
        className="page-title-heading font-extrabold uppercase leading-tight text-glow-stroke-neon"
      >
        {chars.map((char, i) =>
          char === " " ? (
            <span key={i} aria-hidden="true">
              {" "}
            </span>
          ) : (
            <motion.span
              key={i}
              aria-hidden="true"
              variants={LETTER}
              // inline-block so the per-letter y-rise actually transforms (a
              // plain inline span ignores transforms). will-change keeps the
              // brightness + transform on the compositor during the ignite.
              className="inline-block [will-change:transform,filter,opacity]"
            >
              {char}
            </motion.span>
          )
        )}
      </motion.h1>
      {subtitle ? (
        <motion.div
          variants={SUBTITLE_MOTION}
          initial={initial}
          animate={play ? "visible" : "hidden"}
          className="page-title-subtitle flex items-center justify-center uppercase leading-snug"
          style={SUBTITLE_STYLE}
        >
          <span
            aria-hidden="true"
            className="page-title-flank rounded-full"
            style={FLANK_PILL_STYLE}
          />
          <h2>{subtitle}</h2>
          <span
            aria-hidden="true"
            className="page-title-flank rounded-full"
            style={FLANK_PILL_STYLE}
          />
        </motion.div>
      ) : null}
    </div>
  );
}
