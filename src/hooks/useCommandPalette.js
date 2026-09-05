'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// State + keyboard engine for the shared command palette
// (src/components/commandPalette). Extracted from the component so the
// rendering stays under the size guideline and so a future global mount
// (the sitewide palette issue) can drive the same logic from anywhere.
//
// Owns: open/close (⌘K / Ctrl+K toggle, Esc), the filter query, arrow-key
// selection over the filtered list, and focus restoration to whatever had
// focus before the palette opened. The component only renders.
export function useCommandPalette(actions) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const restoreFocusRef = useRef(null);

  // The ONE close path. Every way out of the palette — Esc, running an
  // action, and the hotkey pressed while open — must come through here so
  // the next open starts clean (empty query, selection at the top) and focus
  // goes back to whatever had it before the palette took it.
  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    const el = restoreFocusRef.current;
    if (el && typeof el.focus === 'function') el.focus();
  }, []);

  // Global hotkey. ⌘K on mac, Ctrl+K elsewhere — matching both
  // unconditionally is what every palette does; nobody has a legitimate
  // Ctrl+K binding on a portfolio site. Opening and closing are separate
  // branches on purpose: the first cut toggled `open` in a functional
  // updater, which left the query, the selection and the focus hand-back
  // untouched on the way OUT — only Esc reset them. Reading `open` from the
  // closure (re-subscribing on toggle is trivially cheap) lets the closing
  // branch reuse close() instead of duplicating it.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) {
          close();
          return;
        }
        restoreFocusRef.current = document.activeElement;
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) =>
      `${a.label} ${a.hint || ''} ${a.keywords || ''} ${a.section || ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [actions, query]);

  // Selection follows the list: a filter change clamps it back into range.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const run = useCallback(
    (action) => {
      if (!action) return;
      close();
      // Perform AFTER close so focus restoration never fights an action that
      // moves focus itself (e.g. "leave a message" focusing the input).
      action.perform();
    },
    [close],
  );

  const onInputKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % Math.max(1, filtered.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(
          (i) =>
            (i - 1 + Math.max(1, filtered.length)) %
            Math.max(1, filtered.length),
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        run(filtered[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        // Focus trap: the input IS the palette's single tab stop — options
        // are reached with arrows and announced via aria-activedescendant.
        e.preventDefault();
      }
    },
    [filtered, activeIndex, run, close],
  );

  return {
    open,
    close,
    query,
    setQuery,
    filtered,
    activeIndex,
    setActiveIndex,
    run,
    onInputKeyDown,
  };
}
