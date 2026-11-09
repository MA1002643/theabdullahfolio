// The framer-motion double for the Vitest layers (issue #200).
//
// The site renders `m.*` components, which take their DOM renderer from the
// nearest <LazyMotion> (src/components/motion/MotionFeatures.jsx, in the root
// layout). A component test renders one component on its own, with no root
// layout above it, and an `m.div` with no LazyMotion creates no visual
// element: it never animates, and it keeps its inline `initial` style, so an
// entrance that starts at `opacity: 0` stays invisible and `toBeVisible` fails.
//
// The double maps `m` to the full `motion`, which is "features loaded
// synchronously" and is exactly what every component rendered before the
// migration. The async path itself is tested against the real `m`, through
// `vi.importActual`, in tests/component/lazyMotionFirstPaint.test.jsx.
//
// A test file with its own `vi.mock('framer-motion', …)` replaces this one, so
// it spreads `withFullMotion(actual)` instead of `actual`.

/** @param {Record<string, unknown>} actual the real framer-motion module. */
export const withFullMotion = (actual) => ({ ...actual, m: actual.motion });
