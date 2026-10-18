// Who owns the Escape key (issue #92).
//
// Several things on this site close on Escape: the ⌘K palette, the about-page
// modals and popovers, the home metric popovers and hover hints, the orbit tip,
// the Now Playing console, and the 404 page's "go home" shortcut. One thing, the
// privacy notice, ALSO wants Escape, but only as a last resort: it should
// decline and close only when the press meant nothing to anything else.
//
// "Did anything else use this press?" cannot be inferred from markup (a
// role="group" popover or a window-level page shortcut looks like nothing), and
// it cannot be answered by listener order either: the owners are bound on
// `document`, on `window` and through React's root, so whichever one the
// last-resort listener happens to sit beside decides the answer. So ownership
// is explicit:
//
//   1. Every handler that ACTS on Escape claims it with `claimEscape(event)`,
//      which is just `preventDefault()`, the platform's own "handled" flag.
//   2. The last-resort listener asks `afterUnclaimedEscape(event, fn)`, which
//      waits until dispatch has finished (a task, not a microtask: microtasks
//      run between listeners) and calls `fn` only if nobody claimed the press.

/** Mark an Escape press as handled, so the last-resort owner leaves it alone. */
export function claimEscape(event) {
  event.preventDefault();
}

/**
 * Run `fn` once the event has finished dispatching, but only if no handler
 * claimed it. Returns a cancel function for effect cleanup.
 */
export function afterUnclaimedEscape(event, fn) {
  const timer = setTimeout(() => {
    if (!event.defaultPrevented) fn();
  }, 0);
  return () => clearTimeout(timer);
}
