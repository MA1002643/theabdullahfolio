/* ── Fluid page scale — inline-style helpers (issue #50) ──────────────────
   The counterpart to the `.fluid-scale` CSS scope in globals.css. That class
   computes ONE unitless factor, `--fluid-scale`, from the viewport width
   (0.6 → 1.3, unity at 1440px — the 13" MacBook logical width the legacy
   desktop sizes were designed against); these helpers turn a design-
   reference size into a calc() that rides it, for the places where sizing
   lives in JSX inline styles rather than a stylesheet class.

   Design sizes are authored AT SCALE 1 — i.e. "what this measures on a
   1440px-wide viewport" — and every derived value breathes together from
   that single factor, which is the whole point of the system: no property
   ever jumps at a breakpoint because no property has one.

   The `var()` fallback of 1 is deliberate: used OUTSIDE a `.fluid-scale`
   scope, these resolve to the plain reference size, so a component adopting
   the helpers stays predictable on pages that haven't opted in yet.

   Adopting a page (the reusable recipe):
     1. Add its pathname to FLUID_SCALE_PAGES in (sub pages)/layout.js — that
        puts the `fluid-scale` class (and fluid main padding) on the page.
     2. Size elements with these helpers, or with `.fluid-scale`-scoped rules
        in globals.css for shared/semantic classes.
     3. Optionally tune the curve on the scoped element via inline custom
        props: style={{ '--fluid-min': 0.7, '--fluid-base': '1200px' }}. */

/** `size` rem at scale 1, scaling with the page factor. */
export const fluid = (size) => `calc(${size}rem * var(--fluid-scale, 1))`;

/** Like `fluid`, but never below `floor` rem — legibility floor for text.
    Spacing shrinks all the way down; type stops where it stays readable. */
export const fluidText = (size, floor) =>
  `max(${floor}rem, calc(${size}rem * var(--fluid-scale, 1)))`;
