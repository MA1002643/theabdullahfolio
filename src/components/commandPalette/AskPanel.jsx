'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Command,
  CornerDownRight,
  Loader2,
  MessageSquare,
  PanelLeft,
  Plus,
  Radio,
  Sparkles,
  Square,
} from 'lucide-react';
import { claimEscape } from '@/lib/escapeKey';
import { askable, normaliseQuestion } from '@/lib/ask/limits';
import { formatNumber } from '@/i18n/format';
import { citedSources, errorCopyKey } from './useAsk';
import { activeConversation, ask, select, startNew, stop, useAskSession } from './askSession';

// The palette's research assistant (issue #41 §4) — a deferred chunk, loaded
// only when a visitor is about to ask. Laid out like a chat client:
//
//   SIDEBAR   (reading-start side) the conversations so far, newest first; a
//             new conversation; the job-description check; and "Commands",
//             which goes back to the command list WITHOUT losing anything.
//             Below `sm` it folds away behind a toggle in the header.
//   THREAD    every turn of the conversation: the question, then the agent's
//             trace (live checks, a plan it retracted), the streamed answer
//             with numbered citations, its sources and provenance.
//   OPTIONS   under the latest answer: its sources and the follow-ups it
//             suggests; in an empty conversation, starter questions.
//   COMPOSER  pinned to the bottom: type any question, Enter sends, Stop
//             ends an answer that is streaming.
//
// The conversations live in askSession.js, not here, so this panel can
// unmount (back to the list, the palette closing) and come back to them.
//
// Keyboard: the composer is a combobox whose options are the OPTIONS list
// (aria-activedescendant): ↑/↓ move, Enter runs the highlighted option or,
// with none highlighted, sends the typed question. Tab moves between the
// controls and is trapped inside the dialog. Esc closes the folded sidebar
// if it is open, otherwise goes back to the command list (a second Esc there
// closes the palette).
//
// Everything the model wrote is rendered as TEXT. Announcements: the answer
// region is aria-busy while it streams, and one polite status mounted empty
// says "Answer ready" (or the error) when the latest answer ends.

const SECONDS = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex="0"]';
const STARTERS = ['strongest', 'stack', 'experience', 'live'];
// Small labels are monospaced and letter-spaced in Latin scripts. Under right
// to left they drop both (`rtl:font-sans rtl:tracking-normal`): letter-spacing
// pulls Arabic, Urdu and Persian letters out of their joins, and the mono
// face has no Arabic glyphs of its own. Numbers, keys and paths keep mono.

function TraceRow({ row, t }) {
  if (row.note) {
    return (
      <li className="flex gap-2 text-[11px] leading-snug text-[#d4af7a]">
        <CornerDownRight aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 rtl:-scale-x-100" />
        <span>
          <span className="font-mono rtl:font-sans rtl:tracking-normal uppercase tracking-wider text-[#ffaa2a]">{t('ask.trace.plan')}</span>{' '}
          <span dir="auto">{row.note}</span>
        </span>
      </li>
    );
  }
  const d = row.data ?? {};
  // Raw numbers, not formatted strings: the messages pluralise on them ("1
  // recent push", "8 recent pushes") and ICU formats them in the locale.
  const n = (v) => (Number.isFinite(v) ? v : 0);
  const args = {
    commits: n(d.commits),
    contributions: n(d.contributionsLastYear),
    streak: n(d.longestStreakDays),
    tracked: n(d.trackedProjects),
    overall: n(d.overallCompletionPercent),
    prs: n(d.activePullRequests),
    pushes: n(d.recentPushes),
  };
  const known = ['get_github_activity', 'get_project_progress', 'get_current_work'].includes(row.tool);
  const key = known ? `ask.trace.${row.tool}.${row.status}` : `ask.trace.other.${row.status}`;
  const Icon = row.status === 'running' ? Loader2 : row.status === 'failed' ? AlertCircle : Check;
  return (
    <li className="flex items-start gap-2 text-[11px] leading-snug">
      <Icon
        aria-hidden="true"
        className={`mt-0.5 h-3 w-3 shrink-0 ${
          row.status === 'running'
            ? 'animate-spin text-[#ffaa2a] motion-reduce:animate-none'
            : row.status === 'failed'
              ? 'text-[#d4af7a]'
              : 'text-[#ff6d05]'
        }`}
      />
      <span className={row.status === 'done' ? 'text-[#f4e3b8]' : 'text-[#d4af7a]'}>
        {t(key, args)}
        {row.status === 'done' && d.live === false ? (
          <span className="text-[#d4af7a]"> · {t('ask.trace.snapshot')}</span>
        ) : null}
      </span>
    </li>
  );
}

/** One question and its answer. The latest turn's options are rendered by the caller. */
function Turn({ turn, t, locale, sources, latest, children }) {
  const answer = turn.answer;
  const busy = answer.status === 'pending' || answer.status === 'streaming';
  const errorKey = answer.status === 'error' ? errorCopyKey(answer.error) : null;
  const number = new Map(sources.map((s, i) => [s.id, i + 1]));
  const provenance =
    answer.status === 'done' && answer.meta
      ? t('ask.meta', {
          facts: answer.meta.facts,
          steps: answer.stats?.steps ?? 0,
          seconds: formatNumber((answer.stats?.ms ?? 0) / 1000, locale, SECONDS),
          model: answer.meta.model.replace(/^[^/]+\//, ''),
        })
      : null;

  return (
    <li className="space-y-3">
      <h3
        dir="auto"
        className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-se-md border border-[#ff6d05]/20 bg-[#ff6d05]/[0.08] px-4 py-2 text-sm font-normal leading-relaxed text-[#f4e3b8]"
      >
        {turn.question}
      </h3>

      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#ff6d05]/30 bg-black/30"
        >
          <Sparkles className="h-3 w-3 text-[#ff6d05]" />
        </span>
        <div className="min-w-0 flex-1 space-y-2.5">
          {answer.trace.length ? (
            <section aria-label={t('ask.trace.label')}>
              <ol className="space-y-1.5">
                {answer.trace.map((row) => (
                  <TraceRow key={row.id} row={row} t={t} />
                ))}
              </ol>
            </section>
          ) : null}

          <section aria-label={t('ask.answerLabel')} aria-busy={busy}>
            {answer.status === 'pending' && !answer.trace.length ? (
              <p className="text-sm text-[#ffbb55]">{t('ask.thinking')}</p>
            ) : null}
            {answer.segments.length ? (
              <p dir="auto" className="whitespace-pre-line text-sm leading-relaxed text-[#f4e3b8]">
                {answer.segments.map((seg, i) =>
                  seg.t === 'text' ? (
                    // eslint-disable-next-line react/no-array-index-key -- segments only ever append
                    <span key={i}>{seg.v}</span>
                  ) : number.has(seg.id) ? (
                    // eslint-disable-next-line react/no-array-index-key -- segments only ever append
                    <sup key={i} className="ms-0.5 font-mono text-[10px] text-[#ffaa2a]">
                      [{formatNumber(number.get(seg.id), locale)}]
                    </sup>
                  ) : null,
                )}
                {answer.status === 'streaming' ? (
                  <span
                    aria-hidden="true"
                    className="ms-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-pulse bg-[#ff6d05] motion-reduce:animate-none"
                  />
                ) : null}
              </p>
            ) : null}
            {answer.status === 'stopped' ? (
              <p className="mt-1 font-mono rtl:font-sans rtl:tracking-normal text-[11px] text-[#d4af7a]">{t('ask.chat.stopped')}</p>
            ) : null}
            {errorKey ? (
              <p className="text-sm text-[#ffaa2a]">
                {t(`ask.errors.${errorKey}`)}
                {latest && (errorKey === 'failed' || errorKey === 'offline') ? (
                  <span className="text-[#d4af7a]"> {t('ask.enterRetry')}</span>
                ) : null}
              </p>
            ) : null}
          </section>

          {children}

          {provenance ? (
            <p className="font-mono rtl:font-sans rtl:tracking-normal text-[10px] text-[#d4af7a]" dir="auto">
              {provenance}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** An earlier turn's sources: plain buttons, reached with Tab. */
function SourceButtons({ sources, t, locale, onOpen }) {
  if (!sources.length) return null;
  return (
    <div>
      <p className="mb-1 font-mono rtl:font-sans rtl:tracking-normal text-[10px] uppercase tracking-widest text-[#ffaa2a]">{t('ask.sources')}</p>
      <ul className="flex flex-wrap gap-1.5">
        {sources.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onOpen(s)}
              className="flex max-w-full items-center gap-1.5 rounded-md border border-[#ff6d05]/20 px-2 py-1 text-xs text-[#ead9b0] transition-colors duration-150 hover:border-[#ff6d05]/50 hover:text-[#f9d174] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ff6d05]"
            >
              <span className="font-mono text-[10px] text-[#ffaa2a]">[{formatNumber(i + 1, locale)}]</span>
              <span className="truncate" dir="auto">
                {s.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AskPanel({
  question = null,
  fresh = false,
  onBack,
  onClose,
  onFit,
  t,
  locale,
  path,
  resolveSource,
  onNavigate,
}) {
  const session = useAskSession();
  const conversation = activeConversation(session);
  const turns = conversation?.turns ?? [];
  const latest = turns.at(-1) ?? null;

  const [draft, setDraft] = useState('');
  const [active, setActive] = useState(-1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const threadRef = useRef(null);
  const startedRef = useRef(false);

  // Arrival, once per mount (a ref, so React's development double-run of
  // effects cannot ask twice): a question from the list starts a new
  // conversation with it; "Ask Claude anything" starts an empty one; "Continue"
  // just shows the active conversation.
  useEffect(() => {
    inputRef.current?.focus();
    if (startedRef.current) return;
    startedRef.current = true;
    if (question) {
      startNew();
      ask(question, { locale, path });
    } else if (fresh) {
      startNew();
    }
  }, [question, fresh, locale, path]);

  // Numbered sources, labelled from the palette's own registry. A source it
  // cannot resolve is dropped rather than rendered as a bare path. (Small
  // lists: the React Compiler memoises these, so no hand-written useMemo.)
  const resolve = (answer) =>
    citedSources(answer)
      .map((s) => ({ ...s, ...resolveSource(s) }))
      .filter((s) => s.label);
  const latestSources = latest ? resolve(latest.answer) : [];

  const options = !latest
    ? STARTERS.map((id) => ({ role: 'starter', q: t(`ask.suggestions.${id}`) }))
    : [
        // `role`, not `kind`: a source carries its own `kind` (project,
        // live…), which must not overwrite what sort of option this is.
        ...latestSources.map((s) => ({ ...s, role: 'source' })),
        ...(latest.answer.status === 'done' ? latest.answer.followups.map((q) => ({ role: 'followup', q })) : []),
      ];

  useEffect(() => {
    setActive((i) => Math.min(i, options.length - 1));
  }, [options.length]);

  // Follow the answer as it streams, unless the reader has scrolled up to
  // read something earlier; a new question always comes into view.
  const turnCount = turns.length;
  const stickRef = useRef(true);
  useLayoutEffect(() => {
    stickRef.current = true;
  }, [turnCount, conversation?.id]);
  useEffect(() => {
    const el = threadRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [latest, turnCount]);

  const busy = latest ? latest.answer.status === 'pending' || latest.answer.status === 'streaming' : false;
  const latestError = latest?.answer.status === 'error' ? errorCopyKey(latest.answer.error) : null;
  const canRetry = latestError === 'failed' || latestError === 'offline';

  const send = (text) => {
    const next = normaliseQuestion(text);
    if (!askable(next)) return;
    setDraft('');
    setActive(-1);
    ask(next, { locale, path });
    inputRef.current?.focus();
  };

  const openSource = (source) => {
    onClose();
    onNavigate(source.href, source.label);
  };

  const choose = (option) => {
    if (option.role === 'source') openSource(option);
    else send(option.q);
  };

  const back = () => onBack(draft);

  const onRootKeyDown = (e) => {
    if (e.nativeEvent?.isComposing) return;
    if (e.key === 'Escape') {
      claimEscape(e);
      if (sidebarOpen) {
        setSidebarOpen(false);
        inputRef.current?.focus();
        return;
      }
      back();
    } else if (e.key === 'Tab') {
      // The folded sidebar (below `sm`, closed) is display:none: its buttons
      // cannot take focus, so they are left out of the cycle.
      const wide = window.matchMedia?.('(min-width: 640px)').matches ?? true;
      const folded = !sidebarOpen && !wide;
      const nodes = [...(rootRef.current?.querySelectorAll(FOCUSABLE) ?? [])].filter(
        (n) => !(folded && n.closest('#ask-sidebar')),
      );
      if (!nodes.length) return;
      const at = nodes.indexOf(document.activeElement);
      const next = e.shiftKey ? (at <= 0 ? nodes.length - 1 : at - 1) : at === nodes.length - 1 ? 0 : at + 1;
      e.preventDefault();
      nodes[next].focus();
    }
  };

  const onInputKeyDown = (e) => {
    if (e.nativeEvent?.isComposing) return;
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault();
      setActive((i) => (i + 1 >= options.length ? -1 : i + 1));
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault();
      setActive((i) => (i <= -1 ? options.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && options[active]) {
        choose(options[active]);
        return;
      }
      if (draft.trim()) send(draft);
      else if (canRetry && latest) send(latest.question);
    }
  };

  const status = !latest
    ? ''
    : latest.answer.status === 'done'
      ? t('ask.ready')
      : latest.answer.status === 'stopped'
        ? t('ask.chat.stopped')
        : latestError
          ? t(`ask.errors.${latestError}`)
          : '';

  const headerFor = (role) =>
    role === 'source' ? t('ask.sources') : role === 'followup' ? t('ask.followups') : t('ask.chat.tryAsking');

  let lastRole = null;
  const optionList = (
    <ul
      id="ask-options"
      role="listbox"
      aria-label={t('ask.optionsLabel')}
      className={options.length ? 'space-y-0.5' : undefined}
    >
      {options.map((option, i) => {
        const header = option.role !== lastRole ? headerFor(option.role) : null;
        lastRole = option.role;
        const isActive = i === active;
        return (
          <li key={option.role === 'source' ? option.id : `${option.role}-${option.q}`} role="presentation">
            {header ? (
              <div
                aria-hidden="true"
                className="px-3 pb-1 pt-2 font-mono rtl:font-sans rtl:tracking-normal text-[10px] uppercase tracking-widest text-[#ffaa2a]"
              >
                {header}
              </div>
            ) : null}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- aria-activedescendant listbox; the composer owns the keyboard */}
            <div
              id={`ask-opt-${i}`}
              role="option"
              aria-selected={isActive}
              onClick={() => choose(option)}
              onMouseMove={() => setActive(i)}
              className={`relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                isActive ? 'bg-[#ff6d05]/15 text-[#f9d174]' : 'text-[#ead9b0]'
              }`}
            >
              {option.role === 'source' ? (
                <>
                  <span className="w-5 shrink-0 font-mono text-[11px] text-[#ffaa2a]">
                    [{formatNumber(i + 1, locale)}]
                  </span>
                  <span className="min-w-0 flex-1 truncate" dir="auto">
                    {option.label}
                  </span>
                  {option.live ? (
                    <span className="flex shrink-0 items-center gap-1 font-mono rtl:font-sans rtl:tracking-normal text-[10px] uppercase tracking-wider text-[#ff6d05]">
                      <Radio aria-hidden="true" className="h-3 w-3" />
                      {t('ask.live')}
                    </span>
                  ) : option.hint ? (
                    <span dir="ltr" className="shrink-0 font-mono text-xs text-[#d4af7a]">
                      {option.hint}
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#ff6d05] rtl:-scale-x-100" />
                  <span className="min-w-0 flex-1" dir="auto">
                    {option.q}
                  </span>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );

  const sideButton =
    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-[#ead9b0] transition-colors duration-150 hover:bg-white/[0.04] hover:text-[#f9d174] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#ff6d05]';

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- delegates Escape and the Tab trap for the controls inside
    <div ref={rootRef} onKeyDown={onRootKeyDown} className="relative flex h-[calc(100svh-6.5rem)] sm:h-[min(80svh,40rem)]">
      {/* The sidebar. Beside the thread from `sm`; below it, a sheet over the
          thread, opened from the header. */}
      <nav
        id="ask-sidebar"
        aria-label={t('ask.chat.sidebar')}
        className={`${
          sidebarOpen ? 'flex' : 'hidden'
        } absolute inset-0 z-10 flex-col bg-[#05070f] sm:static sm:z-auto sm:flex sm:w-60 sm:shrink-0 sm:border-e sm:border-[#ff6d05]/15 sm:bg-black/20`}
      >
        <div className="space-y-0.5 p-2">
          <button
            type="button"
            className={sideButton}
            onClick={() => {
              startNew();
              setSidebarOpen(false);
              setActive(-1);
              inputRef.current?.focus();
            }}
          >
            <Plus aria-hidden="true" className="h-4 w-4 shrink-0 text-[#ff6d05]" />
            {t('ask.chat.newChat')}
          </button>
          {onFit ? (
            <button type="button" className={sideButton} onClick={onFit}>
              <BriefcaseBusiness aria-hidden="true" className="h-4 w-4 shrink-0 text-[#ffaa2a]" />
              {t('ask.chat.fit')}
            </button>
          ) : null}
        </div>

        <h2 className="px-5 pb-1 pt-2 font-mono rtl:font-sans rtl:tracking-normal text-[10px] font-normal uppercase tracking-widest text-[#ffaa2a]">
          {t('ask.chat.sidebar')}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {session.conversations.length ? (
            <ul className="space-y-0.5">
              {session.conversations.map((c) => {
                const current = c.id === session.activeId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-current={current ? 'true' : undefined}
                      onClick={() => {
                        select(c.id);
                        setSidebarOpen(false);
                        setActive(-1);
                        inputRef.current?.focus();
                      }}
                      className={`${sideButton} ${current ? 'bg-[#ff6d05]/[0.12] text-[#f9d174]' : ''}`}
                    >
                      <MessageSquare aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#b8946a]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate" dir="auto">
                          {c.title}
                        </span>
                        <span className="block font-mono rtl:font-sans rtl:tracking-normal text-[10px] text-[#b8946a]">
                          {t('ask.chat.turns', { count: c.turns.length })}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-3 py-2 text-xs leading-relaxed text-[#b8946a]">{t('ask.chat.noChats')}</p>
          )}
        </div>

        <div className="border-t border-[#ff6d05]/15 p-2">
          <button type="button" className={sideButton} onClick={back}>
            <Command aria-hidden="true" className="h-4 w-4 shrink-0 text-[#d4af7a]" />
            <span className="min-w-0 flex-1">{t('ask.chat.commands')}</span>
            <kbd className="shrink-0 rounded border border-[#ff6d05]/25 px-1.5 py-0.5 font-mono text-[10px] text-[#d4af7a]">
              esc
            </kbd>
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-[#ff6d05]/15 px-3 py-2.5 sm:px-5">
          <button
            type="button"
            aria-expanded={sidebarOpen}
            aria-controls="ask-sidebar"
            onClick={() => setSidebarOpen((v) => !v)}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-[#ead9b0] hover:text-[#f9d174] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ff6d05] sm:hidden"
          >
            <PanelLeft aria-hidden="true" className="h-4 w-4 rtl:-scale-x-100" />
            {t('ask.chat.sidebar')}
          </button>
          <p dir="auto" className="min-w-0 flex-1 truncate font-mono rtl:font-sans rtl:tracking-normal text-xs text-[#ead9b0]">
            {conversation ? conversation.title : t('ask.chat.newChat')}
          </p>
        </div>

        <div ref={threadRef} onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {latest ? (
            <ol className="space-y-6">
              {turns.map((turn) => {
                const isLatest = turn === latest;
                const sources = isLatest ? latestSources : resolve(turn.answer);
                return (
                  <Turn key={turn.id} turn={turn} t={t} locale={locale} sources={sources} latest={isLatest}>
                    {isLatest ? (
                      optionList
                    ) : (
                      <SourceButtons sources={sources} t={t} locale={locale} onOpen={openSource} />
                    )}
                  </Turn>
                );
              })}
            </ol>
          ) : (
            <div className="mx-auto max-w-md pt-4 sm:pt-8">
              <span
                aria-hidden="true"
                className="mb-3 flex h-9 w-9 items-center justify-center rounded-full border border-[#ff6d05]/30 bg-black/30"
              >
                <Sparkles className="h-4 w-4 text-[#ff6d05]" />
              </span>
              <h3 className="text-base font-semibold text-[#ff6d05]">{t('ask.chat.introTitle')}</h3>
              <p className="mb-4 mt-1 text-sm leading-relaxed text-[#ffbb55]">{t('ask.chat.introBody')}</p>
              {optionList}
            </div>
          )}
        </div>

        <p role="status" className="sr-only">
          {status}
        </p>

        <div className="border-t border-[#ff6d05]/15 px-3 pb-2.5 pt-3 sm:px-5">
          <div className="flex items-center gap-2 rounded-xl border border-[#ff6d05]/25 bg-black/30 py-1.5 pe-1.5 ps-3 transition-colors duration-150 focus-within:border-[#ff6d05]/60">
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label={t('ask.inputLabel')}
              aria-expanded={options.length > 0}
              aria-controls="ask-options"
              aria-autocomplete="none"
              aria-activedescendant={active >= 0 ? `ask-opt-${active}` : undefined}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setActive(-1);
              }}
              onKeyDown={onInputKeyDown}
              placeholder={latest ? t('ask.chat.followupPlaceholder') : t('ask.placeholder')}
              dir="auto"
              autoComplete="off"
              enterKeyHint="send"
              className="min-w-0 flex-1 border-none bg-transparent py-1 text-sm text-[#f4e3b8] outline-none placeholder:text-[#b8946a]"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label={t('ask.chat.stop')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#ff6d05]/40 text-[#ff6d05] hover:bg-[#ff6d05]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ff6d05]"
              >
                <Square aria-hidden="true" className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => send(draft)}
                disabled={!askable(normaliseQuestion(draft))}
                aria-label={t('ask.chat.send')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ff6d05] text-black transition-opacity duration-150 hover:bg-[#ff8a1e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ff6d05] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUp aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-[#d4af7a]">{t('ask.disclaimer')}</p>
        </div>
      </div>
    </div>
  );
}
