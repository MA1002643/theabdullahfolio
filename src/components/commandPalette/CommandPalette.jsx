'use client';

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useCommandPalette } from '@/hooks/useCommandPalette';

// Shared ⌘K / Ctrl+K command palette (issue #40 Phase 4 — built as a SHARED
// component on the owner's direction: a separate open issue will mount it
// sitewide, so nothing in here may know about the guestbook). Hand-rolled,
// no kbar: the whole behaviour is one hook + this panel.
//
// Contract: pass `actions` — [{ id, label, hint?, section?, keywords?,
// perform() }]. The palette groups by `section` in the order actions arrive,
// filters on label/hint/keywords, and runs `perform` on Enter/click.
//
// Keyboard: ⌘K/Ctrl+K toggles, Esc closes, ↑/↓ move, Enter runs, Tab is
// trapped (the input is the single tab stop; options are a listbox driven by
// aria-activedescendant, the pattern screen readers expect from a combobox).
export default function CommandPalette({ actions }) {
  const reduceMotion = useReducedMotion();
  const pal = useCommandPalette(actions);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  // Set by the pointer path (onMouseMove) so the scroll-follow below can tell
  // a hover from an arrow key: the cursor is already ON a hovered option, and
  // nudging the list under a moving cursor would re-select whatever slid
  // beneath it — a feedback loop. Consumed (reset) by the effect.
  const pointerSelectRef = useRef(false);

  useEffect(() => {
    if (pal.open) inputRef.current?.focus();
  }, [pal.open]);

  // Keep the active option visible. Focus never leaves the input — the
  // listbox is driven by aria-activedescendant — and changing that attribute
  // scrolls nothing, so with enough actions to overflow the list's 19rem cap
  // a keyboard user could arrow onto an option below the fold and Enter
  // would still run it, unseen. Scroll its <li> wrapper (option plus any
  // section header above it) to the nearest edge whenever the selection
  // changes: a no-op while it is already in view, a one-row nudge at either
  // edge, a jump to the top on wrap-around. Keyed on the active option's id
  // AND the filtered list, so a filter change that moves the selection to a
  // different row follows it too. Instant, not smooth: native listboxes do
  // not animate selection, and a smooth scroll would lag rapid arrowing.
  const activeId = pal.filtered[pal.activeIndex]?.id;
  useEffect(() => {
    if (pointerSelectRef.current) {
      pointerSelectRef.current = false;
      return;
    }
    if (!listRef.current || activeId === undefined) return;
    const option = document.getElementById(`palette-opt-${activeId}`);
    const row = option?.closest('li') ?? option;
    if (typeof row?.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' });
    }
  }, [activeId, pal.filtered]);

  if (!pal.open) return null;

  let lastSection;

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {/* Backdrop — click closes. */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={pal.close}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="relative mx-auto mt-[16vh] w-[min(92vw,34rem)] overflow-hidden rounded-xl custom-bg-abt"
      >
        <div className="flex items-center gap-3 border-b border-[#ff6d05]/20 px-4 py-3">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-[#f9d174]" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={
              pal.filtered[pal.activeIndex]
                ? `palette-opt-${pal.filtered[pal.activeIndex].id}`
                : undefined
            }
            value={pal.query}
            onChange={(e) => pal.setQuery(e.target.value)}
            onKeyDown={pal.onInputKeyDown}
            placeholder="Type a command or destination…"
            className="min-w-0 flex-1 border-none bg-transparent font-mono text-sm text-foreground/80 outline-none placeholder:text-foreground/60"
          />
          <kbd className="rounded border border-[#ff6d05]/25 px-1.5 py-0.5 font-mono text-[10px] text-foreground/60">
            esc
          </kbd>
        </div>

        <ul
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Commands"
          className="max-h-[19rem] overflow-y-auto py-2"
        >
          {pal.filtered.length === 0 ? (
            <li className="px-4 py-6 text-center font-mono text-xs text-foreground/60">
              Nothing matches
            </li>
          ) : (
            pal.filtered.map((action, i) => {
              const header =
                action.section && action.section !== lastSection
                  ? action.section
                  : null;
              lastSection = action.section;
              return (
                <li key={action.id} role="presentation">
                  {header ? (
                    <div
                      aria-hidden="true"
                      className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-foreground/60"
                    >
                      {header}
                    </div>
                  ) : null}
                  <div
                    id={`palette-opt-${action.id}`}
                    role="option"
                    aria-selected={i === pal.activeIndex}
                    onClick={() => pal.run(action)}
                    onMouseMove={() => {
                      if (i === pal.activeIndex) return;
                      pointerSelectRef.current = true;
                      pal.setActiveIndex(i);
                    }}
                    className={`mx-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                      i === pal.activeIndex
                        ? 'bg-[#ff6d05]/15 text-[#f9d174]'
                        : 'text-foreground/70'
                    }`}
                  >
                    <span>{action.label}</span>
                    {action.hint ? (
                      <span className="shrink-0 font-mono text-xs text-foreground/60">
                        {action.hint}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </motion.div>
    </div>
  );
}
