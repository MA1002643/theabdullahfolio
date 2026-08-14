// Single source of truth for the page-transition ("Ember Passage") timing.
//
// The passage is one continuous gesture rather than a sequence of separate
// animations, and the shader receives it as a single 0..1 scalar (uT):
//
//   0.00 - 0.28  LIFT      the page comes apart into embers, nearest the click
//                          first, while a warm-cored darkness closes over it
//   0.28 - 0.66  CONVERGE  the swarm flows inward and lands on the monogram
//   0.66 - 0.80  HOLD      the mark burns as a living constellation, breathing;
//                          router.push happens under this, and a slow route
//                          simply holds here instead of showing a spinner
//   0.80 - 1.00  SCATTER   the embers are blown outward and the destination is
//                          already behind them
//
// The overlay maps elapsed time onto uT; these constants set the wall clock.

// The darkness is fully closed by here, so nothing of the route swap shows.
export const COVER_MS = 420;

// router.push fires once the veil is opaque, never before.
export const PUSH_AT_MS = 440;

// Minimum time from mount, even if the route arrives instantly. Sized so the
// swarm actually lands and the mark is legible before anything scatters.
export const SHOWCASE_MIN_MS = 1180;

// The scatter.
export const REVEAL_MS = 430;

// --- overlay-internal choreography, measured from overlay mount -------------

// How long the LIFT + CONVERGE + HOLD span takes on the shader's own clock.
// uT walks 0 -> 0.80 across this, then the scatter takes it to 1.0.
export const GATHER_MS = 1180;

// The destination name is tied to the SWARM'S OWN PROGRESS (uT), not to a wall
// clock. That coupling is the whole point: a wall-clock timeout can only start
// the label, never end it, so the name outlived the mark and was still burning
// on the destination page after the embers had gone. Expressed in uT it enters
// as the swarm converges into a readable shape and leaves as the swarm scatters,
// which also means it behaves correctly when uT STALLS at the hold point waiting
// for a slow route — it simply holds lit, exactly like the mark it labels.
//
//              enter                    hold                    leave
//   uT   0.44 ---------> 0.64 ------------------------ 0.80 ---------> 0.95
export const LABEL_IN = [0.44, 0.64];
export const LABEL_OUT = [0.8, 0.95];

// If the route still has not arrived by here, the mark keeps breathing — a
// de-facto loading state instead of a spinner. Only ever seen on a slow route.
export const BREATHE_AT_MS = 1180;

// If the route never arrives (push failed, network death), force the reveal so
// the visitor is never stranded behind the overlay.
//
// This is a DEAD-MAN'S SWITCH, not a UX timer: it should only fire when a
// navigation is genuinely broken. When it fires on one that is merely slow the
// result is the worst of both worlds — the cover is torn down while `pathname`
// is still the ORIGIN route, so the visitor is dropped back on the page they
// just left, and the still-pending push then swaps the page under them seconds
// later with no transition at all.
//
// Production is nowhere near the fuse and keeps the tight 6s: measured against
// the deployed site across five routes x three profiles (desktop 1440, mobile
// 440, and mobile throttled to 400kbps / 400ms RTT), every navigation committed
// in 630-1108ms, worst case 3095ms on slow 3G, because <Link> prefetches the
// destination — 17/17 clean, no bounce.
//
// Development is a different regime: Next compiles each route on demand and the
// dev server routinely logs multi-second compiles, which is why the bounce
// reproduces locally on a first click and never reproduces in production.
// `process.env.NODE_ENV` is inlined at build time, so the shipped production
// bundle contains the literal 6000 and this costs nothing at runtime.
export const FAILSAFE_MS =
  process.env.NODE_ENV === 'development' ? 30000 : 6000;

// prefers-reduced-motion (and any browser without WebGL): a plain cross-fade to
// the mark at rest, brief hold, cross-fade out. No swarm, no GL context at all.
export const REDUCED_COVER_MS = 200;
export const REDUCED_MIN_MS = 460;
export const REDUCED_REVEAL_MS = 240;

// Known routes → destination names. Anything not listed falls back to a
// prettified last path segment.
export const ROUTE_LABELS = {
  '/': 'Home',
  '/about': 'About',
  '/projects': 'Projects',
  '/qualifications': 'Qualifications',
  '/contact': 'Contact',
  '/my-past': 'My Past',
};
