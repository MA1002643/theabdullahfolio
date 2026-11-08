// Run `callback` once the main thread has a spare moment (issue #55).
//
// `requestIdleCallback` where the browser has it, with a deadline so a page
// that never goes idle (a looping canvas, a long hydration) still gets the work
// done. Safari shipped it only recently, so anything older falls back to a
// short timeout, which is the same "after first paint, off the critical path"
// promise in a coarser form.
//
// Returns a cancel function, so an effect can hand it straight back as its
// cleanup.

/**
 * @param {() => void} callback
 * @param {number} [timeout] the most it may wait, in ms.
 * @returns {() => void} cancels the callback if it has not run yet.
 */
export function whenIdle(callback, timeout = 3000) {
  if (typeof window === 'undefined') return () => {};
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => callback(), { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 200);
  return () => window.clearTimeout(id);
}
