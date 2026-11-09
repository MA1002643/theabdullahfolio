import { deferredChunk } from '@/lib/deferredChunk';

// The loaders <LazyMotion> calls for its features (issue #200).
//
// Two things here differ from a plain `() => import('./features')`:
//
// 1. The download starts when this module is EVALUATED in the browser, not
//    when <LazyMotion> mounts. LazyMotion only calls its loader from an
//    effect, after hydration has committed, so the plain form would put a
//    whole request between "the page is interactive" and "the page starts
//    animating", with every `initial={{ opacity: 0 }}` element waiting through
//    it. Started here, the chunk downloads in parallel with hydration.
//
// 2. It never rejects. LazyMotion has no error path: a rejected loader leaves
//    every `m.*` element at its server-rendered `initial` style for the rest
//    of the visit, which for a fade-in is invisible text. So a failed download
//    is retried with a capped backoff until it lands. `deferredChunk` forgets
//    a failure rather than caching it, which is what makes the retry real.

const RETRY_MS = [1_000, 3_000, 10_000];

/**
 * Wraps a `deferredChunk` whose module's default export is a feature bundle
 * into a LazyMotion loader: memoised, and resolving once the chunk lands,
 * however many attempts that takes. Exported for tests/unit/loadMotionFeatures.test.js.
 */
export function resilient(chunk) {
  let features = null;
  return () => {
    if (!features) {
      features = new Promise((resolve) => {
        let attempt = 0;
        const tryLoad = () =>
          chunk
            .load()
            .then((module) => resolve(module.default))
            .catch((error) => {
              if (attempt === 0 && process.env.NODE_ENV !== 'production') {
                // The name only, as optionalChunk logs it: never the error itself.
                console.warn('[motion] animation features failed to load; retrying.', error?.name ?? 'Error');
              }
              setTimeout(tryLoad, RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]);
              attempt += 1;
            });
        tryLoad();
      });
    }
    return features;
  };
}

/** `domAnimation`: what every `m.*` on the site needs. */
export const loadMotionFeatures = resilient(deferredChunk(() => import('./features'), 'motion features'));

/** `domMax`: adds layout projection, for the guestbook wall only. */
export const loadLayoutFeatures = resilient(deferredChunk(() => import('./layoutFeatures'), 'layout motion features'));

if (typeof window !== 'undefined') loadMotionFeatures();
