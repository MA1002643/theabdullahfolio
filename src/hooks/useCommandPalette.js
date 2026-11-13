'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { claimEscape } from '@/lib/escapeKey';
import { rankActions } from '@/lib/palette/match';
import { usePaletteOpen } from '@/hooks/usePaletteOpen';

// List engine for the shared command palette (src/components/commandPalette).
// Extracted from the component so the rendering stays under the size
// guideline; split again for issue #41 so the sitewide palette can keep the
// open state and hotkey (usePaletteOpen) eager while this half ships in the
// deferred panel chunk.
//
// Owns: the filter query, ranked matching (src/lib/palette/match.js), arrow-key
// selection over the ranked list, and running an action. Open/close comes from
// `controller` — the sitewide palette passes its own — or, when none is given,
// from a usePaletteOpen of this hook's own, so a standalone palette works as
// it always did.
export function useCommandPalette(actions, controller) {
  const own = usePaletteOpen({ listen: !controller });
  const ctl = controller ?? own;
  const { open, close: closePalette, closes } = ctl;

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  // Every exit lands in the same state: query empty, selection at the top.
  // Keyed on the controller's close counter, so a close that did not come
  // through this hook (the trigger, the hotkey) resets the list too.
  useEffect(() => {
    setQuery('');
    setActiveIndex(0);
  }, [closes]);

  const close = useCallback(() => {
    setQuery('');
    setActiveIndex(0);
    closePalette();
  }, [closePalette]);

  // `actions` is a list, or a builder of one from the query — for rows whose
  // existence depends on what is typed (the palette's Ask row, its Recent
  // group), derived in the same render as the ranking that uses them.
  const { items: filtered, ranges } = useMemo(
    () => rankActions(typeof actions === 'function' ? actions(query) : actions, query),
    [actions, query],
  );

  // A new query puts the selection back on the best match.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Selection follows the list: a list change clamps it back into range.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const run = useCallback(
    (action) => {
      if (!action) return;
      // `keepOpen` actions change what the palette shows (Ask) rather than
      // leaving it, so they run in place.
      if (action.keepOpen) {
        action.perform();
        return;
      }
      close();
      // Perform AFTER close so focus restoration never fights an action that
      // moves focus itself (e.g. "leave a message" focusing the input).
      action.perform();
    },
    [close],
  );

  const onInputKeyDown = useCallback(
    (e) => {
      if (e.isComposing) return; // an IME is still building the word
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
        claimEscape(e);
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
    ranges,
    activeIndex,
    setActiveIndex,
    run,
    onInputKeyDown,
  };
}
