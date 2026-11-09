'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'framer-motion';
import { Check, ChevronDown, Languages, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LOCALES, localeInfo } from '@/i18n/locales';
import { useLocaleSwitch } from '@/i18n/useLocaleSwitch';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { claimEscape } from '@/lib/escapeKey';

// The language selector (issue #82).
//
// Endonyms, never flags: Arabic is the language of 26 countries and Spanish of
// 21, and a flag names one of them. Each option is rendered IN its own
// language — `lang` and `dir` on the row — so a screen reader pronounces
// "Deutsch" in German and "العربية" lays out right to left inside an English
// list. The secondary line names the language in the reader's CURRENT
// language via `Intl.DisplayNames`, which costs no catalogue strings at all:
// the browser already knows that `ja` is "Japanese" in English and "japonais"
// in French.
//
// Pattern: WAI-ARIA combobox with a listbox popup. The search field is the
// combobox and keeps focus the whole time; arrow keys move
// `aria-activedescendant` through the options, so typing and choosing never
// fight over focus.
//
// Except on a tap. Focusing the field from a touch or pen press raises the
// phone's keyboard over a list the visitor most likely meant to scroll, so a
// tap focuses the listbox instead and the field waits to be tapped itself.
// The field's text is 16px below `sm` for the same reason: iOS Safari zooms
// the page into any focused input smaller than that, and the zoomed page
// scrolled sideways under the sheet.
//
// The panel is PORTALLED to <body> and positioned against the trigger's
// viewport rect. Rendered in place it inherited two ancestors that broke it in
// the footer: the <footer>'s `overflow-hidden` sliced the top off an upward
// panel, and the split-flap reveal's transformed <span> became the containing
// block of the phone's `position: fixed` bottom sheet, which collapsed into a
// 65px sliver in the middle of the screen. Neither can reach it from <body>.
// The trigger stays inside the intro loader's `inert` boundary, so the panel
// can still only be opened once the page is interactive.

// Gap between trigger and panel, and the minimum gutter to the viewport edge.
const PANEL_GAP = 8;
const VIEWPORT_GUTTER = 8;
// Matches Tailwind's `sm` breakpoint: below it the panel is a bottom sheet
// placed by its own classes, so no inline position is applied.
const SHEET_QUERY = '(max-width: 639.98px)';

/**
 * Where the anchored (≥ sm) panel goes, from the trigger's viewport rect. The
 * panel's end edge lines up with the trigger's end edge, clamped into the
 * viewport, and its height is capped by the room on the side it opens to, so
 * an upward panel near the top of the screen scrolls instead of being cut off.
 */
export function anchorPanel(rect, { placement, rtl, viewport }) {
  const { width: vw, height: vh } = viewport;
  const style = {};
  if (placement === 'up') {
    style.bottom = vh - rect.top + PANEL_GAP;
    style.maxHeight = Math.max(160, rect.top - PANEL_GAP - VIEWPORT_GUTTER);
  } else {
    style.top = rect.bottom + PANEL_GAP;
    style.maxHeight = Math.max(160, vh - rect.bottom - PANEL_GAP - VIEWPORT_GUTTER);
  }
  if (rtl) style.left = Math.max(VIEWPORT_GUTTER, rect.left);
  else style.right = Math.max(VIEWPORT_GUTTER, vw - rect.right);
  return style;
}

// `useSyncExternalStore` with a store that never changes: false on the server
// and the hydrating render, true after — without a setState-in-effect.
const subscribeNever = () => () => {};

const fold = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function displayNamesFor(uiLocale) {
  try {
    return new Intl.DisplayNames([localeInfo(uiLocale).hreflang], { type: 'language' });
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   source: string,
 *   placement?: 'down' | 'up',
 *   variant?: 'tile' | 'inline',
 *   className?: string,
 * }} props
 *   `source` labels the analytics event ('home', 'footer', ...). `placement`
 *   opens the panel below (homepage, top of the screen) or above (footer).
 */
export default function LanguageSelector({
  source,
  placement = 'down',
  variant = 'tile',
  className = '',
}) {
  const t = useTranslations('Locale');
  const locale = useLocale();
  const { switchTo, pending } = useLocaleSwitch();
  const reduceMotion = useReducedMotion();
  const uid = useId();
  const listId = `${uid}-list`;
  const optionId = (code) => `${uid}-opt-${code}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // Whether opening moves focus into the search field (keyboard, mouse) or
  // onto the listbox (touch, pen), set by the press that opened the panel.
  const [focusSearch, setFocusSearch] = useState(true);
  const pressTypeRef = useRef(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const panelRef = useRef(null);
  // Inline position for the anchored panel; null while it is a bottom sheet.
  const [anchor, setAnchor] = useState(null);
  // The portal target only exists in the browser; the panel is closed on the
  // server and on the hydrating render, so this costs no mismatch.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  const current = localeInfo(locale);
  const names = useMemo(() => displayNamesFor(locale), [locale]);

  const options = useMemo(() => {
    const q = fold(query.trim());
    return LOCALES.map((l) => ({
      ...l,
      localName: names?.of(l.hreflang) ?? l.english,
    })).filter(
      (l) =>
        !q ||
        [l.endonym, l.english, l.localName, l.code].some((field) => fold(field).includes(q)),
    );
  }, [query, names]);

  const groups = useMemo(
    () => [
      { id: 'tier1', label: t('tier1'), items: options.filter((o) => o.tier === 1) },
      { id: 'tier2', label: t('tier2'), items: options.filter((o) => o.tier === 2) },
    ].filter((g) => g.items.length > 0),
    [options, t],
  );
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const close = useCallback((restoreFocus) => {
    setOpen(false);
    setQuery('');
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openPanel = useCallback((searchFirst = true) => {
    setFocusSearch(searchFirst);
    setOpen(true);
    const index = LOCALES.findIndex((l) => l.code === locale);
    setActive(Math.max(0, index));
  }, [locale]);

  // Keep the active option valid as the filter narrows the list.
  useEffect(() => {
    setActive((i) => (flat.length === 0 ? 0 : Math.min(i, flat.length - 1)));
  }, [flat.length]);

  // Focus the search field when the panel opens, or the listbox after a tap.
  useEffect(() => {
    if (!open) return;
    if (focusSearch) inputRef.current?.focus();
    else listRef.current?.focus({ preventScroll: true });
  }, [open, focusSearch]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open) return;
    const code = flat[active]?.code;
    if (!code) return;
    document.getElementById(optionId(code))?.scrollIntoView({ block: 'nearest' });
    // optionId is derived from a stable useId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open, flat]);

  // Track the trigger while open: the footer scrolls, the window resizes, and a
  // phone rotating across the `sm` line swaps anchored panel for bottom sheet.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const sheet = window.matchMedia(SHEET_QUERY);
    let frame = 0;
    const place = () => {
      frame = 0;
      const trigger = triggerRef.current;
      if (!trigger || sheet.matches) {
        setAnchor(null);
        return;
      }
      setAnchor(
        anchorPanel(trigger.getBoundingClientRect(), {
          placement,
          rtl: getComputedStyle(trigger).direction === 'rtl',
          viewport: { width: window.innerWidth, height: window.innerHeight },
        }),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    sheet.addEventListener?.('change', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      sheet.removeEventListener?.('change', schedule);
    };
  }, [open, placement]);

  // Click (or tap) outside closes, without stealing focus back. The panel is
  // portalled, so "inside" is the trigger's wrapper OR the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  const choose = useCallback(
    (code) => {
      close(true);
      switchTo(code, source);
    },
    [close, switchTo, source],
  );

  const onInputKeyDown = (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
        break;
      case 'Home':
        if (!query) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (!query) {
          event.preventDefault();
          setActive(Math.max(0, flat.length - 1));
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (flat[active]) choose(flat[active].code);
        break;
      case 'Escape':
        claimEscape(event);
        close(true);
        break;
      case 'Tab':
        // Focus goes back to the trigger BEFORE the browser runs the Tab, so it
        // continues from there in document order rather than from the end of
        // <body>, where the portalled panel lives.
        close(true);
        break;
      default:
    }
  };

  // The listbox is focused instead of the field after a touch or pen opens the
  // panel, and takes the same keys, with one exception. The search field sits
  // just before it, so Shift+Tab moves there and the panel stays open: through
  // `onInputKeyDown` the Tab branch would close the panel and hand focus to the
  // trigger first, and a visitor on touch with a hardware keyboard could only
  // reach search by closing and reopening the selector.
  //
  // Space is the other: on a focused listbox it selects the active option, as
  // Enter does (WAI-ARIA listbox pattern), and its default, scrolling the list,
  // is prevented. It is handled here and never in `onInputKeyDown`, because in
  // the search field Space is a character a visitor types.
  const onListKeyDown = (event) => {
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      inputRef.current?.focus();
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      if (flat[active]) choose(flat[active].code);
      return;
    }
    onInputKeyDown(event);
  };

  const onTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openPanel();
    }
  };

  const motionProps = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
    : {
        initial: { opacity: 0, y: placement === 'down' ? -6 : 6, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: placement === 'down' ? -4 : 4, scale: 0.98 },
        transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
      };

  const activeCode = flat[active]?.code;
  const isTile = variant === 'tile';

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-busy={pending || undefined}
        onPointerDown={(e) => {
          pressTypeRef.current = e.pointerType;
        }}
        // A touch that turns into a scroll is cancelled and raises no click,
        // so the press it recorded is dropped here; otherwise the next Enter
        // or Space would read it and open as if tapped.
        onPointerCancel={() => {
          pressTypeRef.current = null;
        }}
        onClick={() => {
          // A click raised by Enter or Space has no pointerdown before it, so
          // a stale press type is cleared here and keyboard opens search first.
          const press = pressTypeRef.current;
          pressTypeRef.current = null;
          if (open) close(false);
          else openPanel(press !== 'touch' && press !== 'pen');
        }}
        onKeyDown={onTriggerKeyDown}
        className={`locale-trigger group inline-flex items-center gap-x-2 font-mono uppercase tracking-[0.14em] text-[#ffaa2a] transition-colors hover:text-[#ffd27a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffaa2a] ${
          isTile
            ? 'custom-bg-abt h-full min-h-[2.5rem] rounded-xl px-[clamp(0.6rem,1.4vw,0.95rem)] text-[clamp(0.66rem,1.1vw,0.74rem)]'
            : 'rounded-full border border-[#ffcd5b40] px-3 py-1.5 text-[0.7rem] hover:border-[#ffcd5b99]'
        }`}
      >
        <Languages aria-hidden="true" className="size-[1.05em] shrink-0" strokeWidth={1.75} />
        <span className="sr-only">{t('label')}: </span>
        {/* The endonym where there is room, the code where there is not. Both
            are real text in the accessible name (never aria-hidden), so the
            visible label is always a contiguous part of it (WCAG 2.5.3). */}
        <span lang={current.hreflang} dir={current.dir} className="hidden normal-case tracking-normal sm:inline">
          {current.endonym}
        </span>
        <span className="sm:hidden">{current.code}</span>
        <ChevronDown
          aria-hidden="true"
          className={`size-[1em] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
        />
      </button>

      {mounted && createPortal(
      <AnimatePresence>
        {open ? (
          <m.div
            key="panel"
            ref={panelRef}
            {...motionProps}
            // Below 640px the panel is a bottom SHEET, not a popover. Anchored
            // to its trigger, a 20rem panel in the footer's centred phone
            // layout ran off the start edge of a 360px screen; pinned to the
            // viewport with a gutter on both sides it can never overflow, and
            // the bottom of the screen is where a thumb is. From `sm` up the
            // inline `anchor` style places it against the trigger.
            style={anchor ?? undefined}
            // Opaque, not /95: it opens over the footer's terminal and
            // wordmark, and text showing through a menu reads as a fault.
            className={`locale-panel fixed z-[70] flex w-[min(20rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border border-[#ffcd5b40] bg-[#0d0b09] shadow-[0_18px_48px_-12px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,109,5,0.06)] max-sm:inset-x-2 max-sm:bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] max-sm:max-h-[80dvh] max-sm:w-auto ${
              placement === 'down' ? 'origin-top-right rtl:origin-top-left' : 'origin-bottom-right rtl:origin-bottom-left'
            }`}
          >
            <div className="flex shrink-0 items-center gap-x-2 border-b border-white/10 px-3 py-2.5">
              <Search aria-hidden="true" className="size-4 shrink-0 text-[#a3a3a3]" strokeWidth={1.75} />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-label={t('searchLabel')}
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={activeCode ? optionId(activeCode) : undefined}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder={t('searchPlaceholder')}
                autoComplete="off"
                spellCheck={false}
                // 16px at every width: iOS Safari zooms into a focused field
                // smaller than that, and a phone in landscape is past `sm`.
                className="w-full min-w-0 bg-transparent text-base text-[#f3e7d3] placeholder:text-[#8a8a8a] focus:outline-none"
              />
            </div>

            <div
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={t('label')}
              // Focused instead of the field after a tap, so it takes the same
              // keys: Escape still closes and hands focus back. Shift+Tab is
              // its own (see `onListKeyDown`).
              tabIndex={-1}
              aria-activedescendant={activeCode ? optionId(activeCode) : undefined}
              onKeyDown={onListKeyDown}
              className="max-h-[min(22rem,55vh)] min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain py-1.5 focus:outline-none"
            >
              {groups.length === 0 ? (
                <p role="status" className="px-4 py-6 text-center text-sm text-[#a3a3a3]">
                  {t('noResults', { query })}
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.id} role="group" aria-labelledby={`${uid}-${group.id}`}>
                    <div
                      id={`${uid}-${group.id}`}
                      role="presentation"
                      className="px-4 pb-1 pt-2.5 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[#a3a3a3]"
                    >
                      {group.label}
                    </div>
                    {group.items.map((option) => {
                      const selected = option.code === locale;
                      const isActive = option.code === activeCode;
                      return (
                        // The palette's pattern (CommandPalette.jsx): the search
                        // input keeps focus and drives the options through
                        // aria-activedescendant, so an option is never focusable
                        // and owns no key handler.
                        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- aria-activedescendant listbox; the input owns the keyboard
                        <div
                          key={option.code}
                          id={optionId(option.code)}
                          role="option"
                          aria-selected={selected}
                          onPointerEnter={() => setActive(flat.indexOf(option))}
                          onClick={() => choose(option.code)}
                          className={`relative mx-1.5 flex cursor-pointer items-center gap-x-3 rounded-lg px-2.5 py-2 transition-colors ${
                            isActive ? 'bg-[#ffaa2a]/10' : ''
                          }`}
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span
                              lang={option.hreflang}
                              dir={option.dir}
                              className={`truncate text-[0.95rem] leading-tight ${selected ? 'text-[#ffaa2a]' : 'text-[#f3e7d3]'}`}
                            >
                              {option.endonym}
                            </span>
                            {option.localName && fold(option.localName) !== fold(option.endonym) ? (
                              <span className="truncate text-xs leading-snug text-[#a3a3a3]">
                                {option.localName}
                              </span>
                            ) : null}
                          </span>
                          {option.status === 'machine' ? (
                            <span
                              className="shrink-0 rounded-full border border-white/15 px-1.5 py-px font-mono text-[0.58rem] uppercase tracking-[0.12em] text-[#a3a3a3]"
                              title={t('machineBadgeLabel')}
                            >
                              <span aria-hidden="true">{t('machineBadge')}</span>
                              <span className="sr-only">{t('machineBadgeLabel')}</span>
                            </span>
                          ) : null}
                          <Check
                            aria-hidden="true"
                            className={`size-4 shrink-0 text-[#ffaa2a] ${selected ? 'opacity-100' : 'opacity-0'}`}
                            strokeWidth={2}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {current.status === 'machine' ? (
              <div className="shrink-0 border-t border-white/10 px-4 py-3 text-xs leading-relaxed text-[#a3a3a3]">
                <p>
                  <span className="text-[#ffaa2a]">{t('notice.title')}.</span> {t('notice.body')}
                </p>
                <Link
                  href="/contact"
                  onClick={() => close(false)}
                  className="mt-1.5 inline-block text-[#ffaa2a] underline decoration-[#ffaa2a]/40 underline-offset-4 hover:decoration-[#ffaa2a]"
                >
                  {t('notice.cta')}
                </Link>
              </div>
            ) : null}
          </m.div>
        ) : null}
      </AnimatePresence>,
      document.body,
      )}
    </div>
  );
}
