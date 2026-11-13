'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { LOCALES } from '@/i18n/locales';
import { useLocaleSwitch } from '@/i18n/useLocaleSwitch';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Search } from 'lucide-react';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { ASK_LIMITS, askable, normaliseJob, normaliseQuestion } from '@/lib/ask/limits';
import Highlight from './Highlight';
import { activeConversation, stop as stopAsk, useAskSession } from './askSession';

// Shared ⌘K / Ctrl+K command palette (issue #40 Phase 4, mounted sitewide by
// issue #41 through SitePalette). Page-agnostic by contract: nothing in here
// may know about any one page. Hand-rolled, no kbar: the behaviour is two hooks
// (usePaletteOpen, useCommandPalette) + this panel.
//
// Contract: pass `actions` — [{ id, label, hint?, section?, keywords?,
// perform(), keepOpen?, always? }]. The palette ranks them against the query
// (src/lib/palette/match.js), keeps them grouped by `section`, highlights the
// matched characters, and runs `perform` on Enter/click.
//
// `controller` is the open state from usePaletteOpen. The sitewide palette
// passes its own, because it keeps the hotkey eager while this panel is a
// deferred chunk; without one, the palette makes its own (and listens for ⌘K
// itself), as a standalone palette always has.
//
// Keyboard: ⌘K/Ctrl+K toggles, Esc closes, ↑/↓ move, Enter runs, Tab is
// trapped (the input is the single tab stop; options are a listbox driven by
// aria-activedescendant, the pattern screen readers expect from a combobox).
//
// Language (issue #82): every palette ends with a "Language" group — one
// command per locale, labelled with its ENDONYM (rendered in its own `lang`
// and `dir`) and searchable by English name and code, so "spanish", "es"
// and "Español" all find it. `includeLanguages={false}` opts a palette out.
//
// Ask (issue #41): when `ask` is given, a query of two or more characters
// also offers "Ask Claude" as the last row, and choosing it swaps the list for
// `ask.Panel` inside the same (now wider) dialog; "Check a job description"
// (or pasting one) swaps it for `ask.FitPanel`. The panel is the caller's (a
// deferred chunk); this component only decides when it shows and hands it the
// question. With nothing typed, the Ask group offers "Ask Claude anything"
// (an empty conversation, to type into) and, once there is one, "Continue"
// the last conversation. Conversations live in askSession.js, so leaving the
// panel (Esc, or its "Commands" button) loses nothing; closing the palette
// stops an answer that is still streaming.
//
// Actions built by `routeActions` carry `navKey` / `sectionKey`; those are
// translated here, so a page config never needs a translator for the shared
// Navigate group. Any other action's label is used as given (the page owns
// and translates its own commands).
export default function CommandPalette({
  actions,
  includeLanguages = true,
  controller,
  ask,
  recent,
}) {
  const reduceMotion = useReducedMotion();
  const t = useTranslations('Palette');
  const tNav = useTranslations('Nav');
  const tLocale = useTranslations('Locale');
  const { switchTo, locale } = useLocaleSwitch();
  // The question being asked, or null while the list is showing.
  // What the dialog shows instead of the list, or null for the list:
  // { kind: 'ask', question?, fresh?, n } or { kind: 'fit', job }. `n`
  // remounts the Ask panel for each new arrival.
  const [view, setView] = useState(null);
  const session = useAskSession();
  const current = activeConversation(session);
  const openAsk = useCallback(
    (opts) => setView((v) => ({ kind: 'ask', ...opts, n: (v?.n ?? 0) + 1 })),
    [],
  );

  const localized = useMemo(() => {
    const out = actions.map((a) => {
      if (!a.navKey && !a.sectionKey) return a;
      return {
        ...a,
        label: a.navKey ? tNav(`routes.${a.navKey}`) : a.label,
        section: a.sectionKey ? t(`sections.${a.sectionKey}`) : a.section,
        // Translated AND English terms, so either language's query matches.
        keywords: [
          a.keywords,
          a.label,
          a.section,
          a.sectionKey ? t(`keywords.${a.sectionKey}`) : null,
        ]
          .filter(Boolean)
          .join(' '),
      };
    });
    if (!includeLanguages) return out;
    const section = t('sections.language');
    const languages = LOCALES.map((l) => ({
      id: `lang-${l.code}`,
      label: l.endonym,
      lang: l.hreflang,
      dir: l.dir,
      hint: l.code === locale ? `${l.code} · ${tLocale('current')}` : l.code,
      section,
      keywords: `${l.english} ${l.code} ${t('keywords.language')} language`,
      perform: () => switchTo(l.code, 'palette'),
    }));
    return [...out, ...languages];
  }, [actions, includeLanguages, locale, switchTo, t, tLocale, tNav]);

  // Recent entries are copies of actions made BEFORE the pass above, so a
  // route jump in Recent still carries its raw navKey and English label.
  // Resolve each against the localized list by the id it stands for, keeping
  // only its own distinct id (`recent:<id>`) and the Recent section.
  const localizedRecent = useMemo(() => {
    if (!recent?.length) return [];
    const byId = new Map(localized.map((a) => [a.id, a]));
    return recent.map((r) => {
      const source = byId.get(r.recentOf ?? r.id);
      return source ? { ...source, id: r.id, recentOf: r.recentOf, section: r.section } : r;
    });
  }, [recent, localized]);

  // The Ask row's label and the Recent group both depend on the query, which
  // lives in the list engine, so the engine is handed a BUILDER and calls it
  // with the query in the same render it ranks the result.
  const buildActions = useCallback((query) => {
    const list = [];
    // Recent sits first, and only while nothing is typed: once there is a
    // query the ranked list is the better answer.
    if (localizedRecent.length && !query.trim()) list.push(...localizedRecent);
    list.push(...localized);
    if (ask) {
      if (!query.trim() && current) {
        list.push({
          id: 'ask-resume',
          label: ask.resumeLabel(`\u2068${current.title}\u2069`),
          section: ask.section,
          keywords: ask.keywords,
          keepOpen: true,
          noRecent: true,
          perform: () => openAsk({}),
        });
      }
      if (!query.trim() && ask.startLabel) {
        list.push({
          id: 'ask-start',
          label: ask.startLabel,
          section: ask.section,
          keywords: ask.keywords,
          keepOpen: true,
          noRecent: true,
          perform: () => openAsk({ fresh: true }),
        });
      }
      if (!query.trim() && ask.suggestions?.length) {
        list.push(
          ...ask.suggestions.map((s) => ({
            id: `ask-suggest-${s.id}`,
            label: s.label,
            section: ask.section,
            keywords: ask.keywords,
            keepOpen: true,
            noRecent: true,
            perform: () => openAsk({ question: s.label }),
          })),
        );
      }
      if (ask.FitPanel) {
        list.push({
          id: 'ask-fit',
          label: ask.fitLabel,
          section: ask.section,
          keywords: ask.fitKeywords,
          keepOpen: true,
          noRecent: true,
          perform: () => setView({ kind: 'fit', job: '' }),
        });
      }
      const question = normaliseQuestion(query);
      if (askable(question)) {
        list.push({
          id: 'ask',
          label: ask.label(question),
          section: ask.section,
          always: true,
          keepOpen: true,
          noRecent: true,
          perform: () => openAsk({ question }),
        });
      }
    }
    return list;
  }, [localized, localizedRecent, ask, current, openAsk]);

  const pal = useCommandPalette(buildActions, controller);

  const inputRef = useRef(null);
  const listRef = useRef(null);
  // Set by the pointer path (onMouseMove) so the scroll-follow below can tell
  // a hover from an arrow key: the cursor is already ON a hovered option, and
  // nudging the list under a moving cursor would re-select whatever slid
  // beneath it — a feedback loop. Consumed (reset) by the effect.
  const pointerSelectRef = useRef(false);

  // Every close lands back on the list, and stops an answer in flight (it
  // keeps what arrived): nobody is reading it any more.
  useEffect(() => {
    if (!pal.open) {
      setView(null);
      stopAsk();
    }
  }, [pal.open]);

  useEffect(() => {
    if (pal.open && view === null) inputRef.current?.focus();
  }, [pal.open, view]);

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

  const AskPanel = ask?.Panel;
  const FitPanel = ask?.FitPanel;
  const showingAsk = view?.kind === 'ask' && AskPanel;
  const showingFit = view?.kind === 'fit' && FitPanel;
  let lastSection;

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {/* Backdrop — click closes. A pointer convenience only: the keyboard
          closes the palette with Escape (useCommandPalette), so the backdrop
          needs no key handler of its own and is hidden from assistive tech. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- pointer-only backdrop; Escape is the keyboard path */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={pal.close}
      />

      <m.div
        role="dialog"
        aria-modal="true"
        aria-label={t('dialog')}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className={`relative mx-auto overflow-hidden rounded-xl custom-bg-abt ${
          showingAsk
            ? 'mt-[5rem] w-[min(96vw,60rem)] sm:mt-[8vh]'
            : 'mt-[12vh] w-[min(92vw,36rem)] sm:mt-[16vh]'
        }`}
      >
        {showingAsk ? (
          <AskPanel
            key={view.n}
            {...ask.panelProps}
            question={view.question ?? null}
            fresh={Boolean(view.fresh)}
            onBack={(text) => {
              setView(null);
              pal.setQuery(text ?? '');
            }}
            onFit={FitPanel ? () => setView({ kind: 'fit', job: '' }) : undefined}
            onClose={pal.close}
          />
        ) : showingFit ? (
          <FitPanel
            {...ask.panelProps}
            initialJob={view.job}
            onBack={() => setView(null)}
            onClose={pal.close}
          />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-[#ff6d05]/20 px-4 py-3">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-[#ff6d05]" />
              {/* The combobox needs a name of its own (code review): the
                  dialog's label names the dialog, not this nested input, and a
                  placeholder is a hint that vanishes on the first keystroke —
                  never a persistent label. */}
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-label={t('search')}
                aria-expanded="true"
                aria-controls="command-palette-list"
                aria-autocomplete="list"
                aria-activedescendant={
                  pal.filtered[pal.activeIndex]
                    ? `palette-opt-${pal.filtered[pal.activeIndex].id}`
                    : undefined
                }
                value={pal.query}
                onChange={(e) => pal.setQuery(e.target.value)}
                onPaste={(e) => {
                  // Something far longer than a question — a pasted job
                  // description — goes straight to the fit check, pre-filled.
                  const text = e.clipboardData?.getData('text') ?? '';
                  if (FitPanel && normaliseJob(text).length > ASK_LIMITS.maxLen) {
                    e.preventDefault();
                    setView({ kind: 'fit', job: text });
                  }
                }}
                onKeyDown={pal.onInputKeyDown}
                placeholder={t('placeholder')}
                dir="auto"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 border-none bg-transparent font-mono text-sm text-[#f4e3b8] outline-none placeholder:text-[#b8946a]"
              />
              <kbd className="rounded border border-[#ff6d05]/25 px-1.5 py-0.5 font-mono text-[10px] text-[#d4af7a]">
                esc
              </kbd>
            </div>

            <ul
              ref={listRef}
              id="command-palette-list"
              role="listbox"
              aria-label={t('list')}
              className="max-h-[19rem] overflow-y-auto py-2"
            >
              {pal.filtered.length === 0
                ? null
                : pal.filtered.map((action, i) => {
                    const header =
                      action.section && action.section !== lastSection
                        ? action.section
                        : null;
                    lastSection = action.section;
                    const active = i === pal.activeIndex;
                    return (
                      <li key={action.id} role="presentation">
                        {header ? (
                          <div
                            aria-hidden="true"
                            className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-[#ffaa2a]"
                          >
                            {header}
                          </div>
                        ) : null}
                        {/* ARIA combobox pattern: the input keeps focus and
                            drives the options through aria-activedescendant
                            (arrows + Enter), so an option is never focusable
                            and owns no key handler. */}
                        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- aria-activedescendant listbox; the input owns the keyboard */}
                        <div
                          id={`palette-opt-${action.id}`}
                          role="option"
                          aria-selected={active}
                          onClick={() => pal.run(action)}
                          onMouseMove={() => {
                            if (active) return;
                            pointerSelectRef.current = true;
                            pal.setActiveIndex(i);
                          }}
                          className={`relative mx-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                            active ? 'bg-[#ff6d05]/15 text-[#f9d174]' : 'text-[#ead9b0]'
                          }`}
                        >
                          {/* The active row's accent: a 2px ember rule on the
                              reading-start edge (logical, so it mirrors in
                              right-to-left). Decorative. */}
                          <span
                            aria-hidden="true"
                            className={`absolute inset-y-2 start-0 w-[2px] rounded-full transition-colors duration-150 ${
                              active ? 'bg-[#ff6d05]' : 'bg-transparent'
                            }`}
                          />
                          <span lang={action.lang} dir={action.dir} className="min-w-0 truncate">
                            <Highlight text={action.label} ranges={pal.ranges.get(action.id)} />
                          </span>
                          {action.hint ? (
                            <span
                              dir="auto"
                              className="shrink-0 font-mono text-xs text-[#d4af7a]"
                            >
                              {action.hint}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
            </ul>
            {/* The empty state lives OUTSIDE the listbox, as a polite status
                (issue #92, found by the component suite's axe pass). It used to
                be a bare <li> inside role="listbox", which may only own options,
                and nothing announced it: a screen-reader user typing a query that
                matched nothing heard silence. The listbox itself stays mounted,
                empty, because the combobox's aria-controls points at it.
                The status is mounted EMPTY with the palette and only its text
                changes, as PrivacyNotice's live region does: a role="status"
                inserted with "Nothing matches" already inside is often not
                announced at all, so an unmatched query could still be silent. */}
            <p
              role="status"
              className={
                pal.filtered.length === 0
                  ? 'px-4 pb-6 pt-4 text-center font-mono text-xs text-[#d4af7a]'
                  : undefined
              }
            >
              {pal.filtered.length === 0 ? t('empty') : null}
            </p>
          </>
        )}
      </m.div>
    </div>
  );
}
