// Making a deadline hold over a response BODY, not just its headers.
//
// ── Why this needs a helper at all ──────────────────────────────────────────
// `fetch` settles as soon as the response headers arrive; the body is still
// streaming off the socket. So `await res.text()` / `await res.json()` is a
// second, separate wait, and the signal that bounded the request only bounds
// that read if the runtime propagates the abort into the body stream.
//
// It is supposed to. Aborting a fetch aborts its body, and undici does exactly
// that — which is why the unguarded version works in practice and why the gap
// survives review. But that is the RUNTIME's promise, and both callers here are
// cron-facing routes whose whole design rests on a deadline they can promise the
// platform themselves. `/api/daily-warmup` is the sharp case: a body read that
// never settles leaves its `callInternal` pending, so `Promise.allSettled` never
// resolves, the handler never returns, and the function is killed with no body,
// no per-step results and no verdict for a monitor to read — the exact failure
// the run budget exists to prevent, arriving through the one await the budget
// was assumed to cover.
//
// Racing the read against the signal makes the bound unconditional: whichever
// the runtime does, the deadline is the deadline.
//
// ── Shared rather than copied ───────────────────────────────────────────────
// /api/seo-report solved this first and privately. A second route needing the
// same guard is the moment that becomes a drift hazard — the same reasoning
// that collected `envPositiveMs` into `_utils/env.js` after five routes carried
// their own copy of it.

/**
 * Reject when `signal` aborts; otherwise never settle.
 *
 * Only ever used inside a `Promise.race`, so "never settles" is the correct
 * quiet half: the real work is the other racer. A missing signal yields a
 * promise that simply never resolves, which makes `raceAbort` a no-op rather
 * than a crash for callers whose signal is optional.
 */
function abortRejection(signal) {
  return new Promise((_, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    });
  });
}

/**
 * Bound an in-flight read by a signal the runtime may or may not honour.
 *
 * Rejects with the signal's own `reason` when it fires — `AbortSignal.timeout`
 * always gives a `TimeoutError`, whereas an aborted body read surfaces
 * differently across runtimes (`AbortError`, or a `TypeError` wrapping it), so
 * the reason is the stable thing for a caller to classify on.
 *
 * @template T
 * @param {Promise<T>} promise The read to bound, e.g. `res.text()`.
 * @param {AbortSignal|undefined} signal The deadline. Absent ⇒ returned as-is.
 * @returns {Promise<T>}
 */
export function raceAbort(promise, signal) {
  if (!signal) return promise;
  return Promise.race([promise, abortRejection(signal)]);
}
