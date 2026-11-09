import { deferredChunk } from '@/lib/deferredChunk';

// The loaders <LazyMotion> calls for its features (issue #200).
//
// Three things here differ from a plain `() => import('./features')`:
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
//    is retried with a capped backoff. `deferredChunk` forgets a failure
//    rather than caching it, which is what makes the retry real.
//
// 3. Retrying is not a fallback on its own. A chunk that is gone for good (a
//    deploy removed it, an extension blocks it) keeps the promise pending for
//    the whole visit, and the page stays invisible however long it retries.
//    So the loader also GIVES UP, on a bound: after GIVE_UP_AFTER_FAILURES
//    failed attempts, or GIVE_UP_AFTER_MS with no features, whichever comes
//    first (a request that hangs never fails). Giving up does not reject. It
//    tells `onGiveUp` listeners, and <MotionFeatures> answers by rendering its
//    subtree at the final state of every entrance, with no renderer at all
//    (src/components/motion/MotionFeatures.jsx). Retries carry on behind it,
//    so a chunk that lands late still brings the animations back.

const RETRY_MS = [1_000, 3_000, 10_000];
export const GIVE_UP_AFTER_FAILURES = 3;
export const GIVE_UP_AFTER_MS = 8_000;

const noop = () => {};

/**
 * Wraps a `deferredChunk` whose module's default export is a feature bundle
 * into a LazyMotion loader: memoised, and resolving once the chunk lands,
 * however many attempts that takes. The returned loader also carries
 * `onGiveUp(listener)`, which calls `listener` once the bound above passes
 * without the features (at once if it already has) and returns an
 * unsubscribe. Exported for tests/unit/loadMotionFeatures.test.js.
 */
export function resilient(
  chunk,
  { giveUpAfterFailures = GIVE_UP_AFTER_FAILURES, giveUpAfterMs = GIVE_UP_AFTER_MS } = {},
) {
  let features = null;
  let loaded = false;
  let gaveUp = false;
  let deadline = null;
  const listeners = new Set();

  const giveUp = () => {
    if (loaded || gaveUp) return;
    gaveUp = true;
    clearTimeout(deadline);
    for (const listener of listeners) listener();
    listeners.clear();
  };

  const load = () => {
    if (!features) {
      deadline = setTimeout(giveUp, giveUpAfterMs);
      features = new Promise((resolve) => {
        let attempt = 0;
        const tryLoad = () =>
          chunk
            .load()
            .then((module) => {
              loaded = true;
              clearTimeout(deadline);
              resolve(module.default);
            })
            .catch((error) => {
              if (attempt === 0 && process.env.NODE_ENV !== 'production') {
                // The name only, as optionalChunk logs it: never the error itself.
                console.warn('[motion] animation features failed to load; retrying.', error?.name ?? 'Error');
              }
              setTimeout(tryLoad, RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]);
              attempt += 1;
              if (attempt >= giveUpAfterFailures) giveUp();
            });
        tryLoad();
      });
    }
    return features;
  };

  load.onGiveUp = (listener) => {
    if (gaveUp) {
      listener();
      return noop;
    }
    if (loaded) return noop;
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return load;
}

/** `domAnimation`: what every `m.*` on the site needs. */
export const loadMotionFeatures = resilient(deferredChunk(() => import('./features'), 'motion features'));

/** `domMax`: adds layout projection, for the guestbook wall only. */
export const loadLayoutFeatures = resilient(deferredChunk(() => import('./layoutFeatures'), 'layout motion features'));

if (typeof window !== 'undefined') loadMotionFeatures();
