'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Open/close state for the ⌘K palette, and the global hotkey that drives it.
//
// Split out of useCommandPalette for issue #41: the sitewide palette keeps
// THIS part eager (the shortcut has to work the moment the page is
// interactive) while the panel itself — list, ranking, Ask — is a deferred
// chunk that may not have arrived yet. useCommandPalette still calls this
// itself when it is not handed a controller, so a standalone palette behaves
// exactly as it did.
//
// Owns: `open`, the ⌘K / Ctrl+K toggle, the deferral of an open requested
// while the intro loader covers the page, and focus restoration to whatever
// had focus before the palette took it. Every way out goes through close().
// `listen: false` keeps the state but registers no hotkey: useCommandPalette
// calls this unconditionally (hooks cannot be conditional) for its fallback
// controller, and when it is HANDED one, a second ⌘K listener would toggle a
// state nobody reads on every press (issue #41: exactly one listener).
export function usePaletteOpen({ listen = true } = {}) {
  const [open, setOpen] = useState(false);
  const restoreFocusRef = useRef(null);
  // Cancels a deferred open (see openPalette); null when none waits.
  const pendingOpenRef = useRef(null);
  // Bumped by close() so the panel can reset its own state (query, selection,
  // mode) on every exit without the controller knowing what that state is.
  const [closes, setCloses] = useState(0);

  // The ONE close path. Every way out of the palette — Esc, running an
  // action, the hotkey pressed while open, the trigger — must come through
  // here so the next open starts clean and focus goes back to whatever had
  // it before the palette took it.
  const close = useCallback(() => {
    setOpen(false);
    setCloses((n) => n + 1);
    const el = restoreFocusRef.current;
    if (el && typeof el.focus === 'function') el.focus();
  }, []);

  // Under the intro loader the page is `inert` (components/loaderWrapper), and
  // the panel's focus() on its input is a silent no-op there. Opening anyway
  // left the dialog up with nothing focused, so Esc and the arrows (handled on
  // the input) did nothing. So an open requested while covered is DEFERRED to
  // the `loaderuncovered` event, which fires once `inert` is gone. Not
  // `loaderdone`: that fires when the reveal starts, still inert. A second
  // request while waiting cancels it, as it would close an open palette.
  const openPalette = useCallback((restoreTo) => {
    if (pendingOpenRef.current) {
      pendingOpenRef.current();
      return;
    }
    restoreFocusRef.current =
      restoreTo ?? (typeof document !== 'undefined' ? document.activeElement : null);
    if (typeof window !== 'undefined' && window.__loaderCovered) {
      const onUncovered = () => {
        pendingOpenRef.current = null;
        setOpen(true);
      };
      window.addEventListener('loaderuncovered', onUncovered, { once: true });
      pendingOpenRef.current = () => {
        window.removeEventListener('loaderuncovered', onUncovered);
        pendingOpenRef.current = null;
      };
      return;
    }
    setOpen(true);
  }, []);

  const toggle = useCallback(
    (restoreTo) => {
      if (open) close();
      else openPalette(restoreTo);
    },
    [open, close, openPalette],
  );

  // Global hotkey. ⌘K on mac, Ctrl+K elsewhere — matching both
  // unconditionally is what every palette does; nobody has a legitimate
  // Ctrl+K binding on a portfolio site. Reading `open` from the closure
  // (re-subscribing on toggle is trivially cheap) lets the closing branch
  // reuse close() instead of duplicating it.
  useEffect(() => {
    if (!listen) return undefined;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key?.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, listen]);

  // A deferred open must not outlive the palette that asked for it.
  useEffect(() => () => pendingOpenRef.current?.(), []);

  return { open, close, openPalette, toggle, closes };
}
