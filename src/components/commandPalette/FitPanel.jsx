'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BriefcaseBusiness, Check, CircleDashed, CircleHelp } from 'lucide-react';
import { claimEscape } from '@/lib/escapeKey';
import { FIT_LIMITS, normaliseJob } from '@/lib/ask/limits';
import { formatNumber } from '@/i18n/format';
import { errorCopyKey, useAsk } from './useAsk';

// The palette's fit check (issue #41 §4) — a deferred chunk. A recruiter
// pastes a job description; Claude extracts its requirements and assesses
// each one against the site's facts as STRUCTURED output (src/app/api/ask,
// mode "fit"): a verdict, one evidence sentence, the facts it rests on. Rows
// stream in as each is complete, under a summary bar that fills as they land.
//
// Honesty is the design: the three verdicts are "Strong" (directly evidenced),
// "Partial" (adjacent evidence) and "Not shown" — never "missing" or "no",
// because a gap means the site does not mention it, not that he cannot do it.
// Every verdict carries its word and an icon, never colour alone. Evidence
// chips link to the page that holds the fact, from the registry.
//
// Unlike the Ask view this panel has more than one control (the field, the
// submit button, the evidence chips), so Tab moves between them — trapped
// inside the dialog — rather than being blocked. ⌘/Ctrl+Enter submits from
// the field; Esc goes back to the command list.

const VERDICT_STYLE = {
  strong: { Icon: Check, cls: 'border-[#ff6d05]/50 text-[#ff8a1e]', bar: 'bg-[#ff6d05]' },
  partial: { Icon: CircleDashed, cls: 'border-[#ffaa2a]/40 text-[#ffaa2a]', bar: 'bg-[#ffaa2a]/70' },
  // "Not shown" stays the quietest voice (soft gold, not amber or ember),
  // so the three verdicts still read apart at a glance.
  gap: { Icon: CircleHelp, cls: 'border-[#b8946a]/40 text-[#b8946a]', bar: 'bg-[#b8946a]/30' },
};

const FOCUSABLE = 'button:not([disabled]), textarea, input, [tabindex="0"]';

export default function FitPanel({ initialJob = '', onBack, onClose, t, locale, resolveSource, onNavigate, shortcutKey }) {
  const [job, setJob] = useState(initialJob);
  const fieldRef = useRef(null);
  const rootRef = useRef(null);
  const result = useAsk({ locale, path: null });
  const { checkFit } = result;
  const length = normaliseJob(job).length;
  const ready = length >= FIT_LIMITS.minLen && length <= FIT_LIMITS.maxLen;
  const busy = result.status === 'pending' || result.status === 'streaming';

  useEffect(() => {
    fieldRef.current?.focus();
    // A long paste into the palette lands here pre-filled: check it at once.
    if (normaliseJob(initialJob).length >= FIT_LIMITS.minLen) checkFit(initialJob);
  }, [checkFit, initialJob]);

  const submit = () => {
    if (ready && !busy) checkFit(job);
  };

  const counts = useMemo(() => {
    const c = { strong: 0, partial: 0, gap: 0 };
    for (const row of result.rows) c[row.verdict] += 1;
    return c;
  }, [result.rows]);
  const total = result.rows.length;

  const sourceFor = (id) => {
    const source = result.sources.find((s) => s.id === id);
    if (!source) return null;
    const resolved = resolveSource(source);
    return resolved.label ? { ...source, ...resolved } : null;
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      claimEscape(e);
      result.cancel();
      onBack();
      return;
    }
    if (e.key === 'Tab') {
      const nodes = [...(rootRef.current?.closest('[role="dialog"]')?.querySelectorAll(FOCUSABLE) ?? [])];
      if (!nodes.length) return;
      const at = nodes.indexOf(document.activeElement);
      const next = e.shiftKey ? (at <= 0 ? nodes.length - 1 : at - 1) : at === nodes.length - 1 ? 0 : at + 1;
      e.preventDefault();
      nodes[next].focus();
    }
  };

  const errorKey = result.status === 'error' ? errorCopyKey(result.error) : null;
  const status = result.status === 'done' ? t('fit.ready') : errorKey ? t(`ask.errors.${errorKey}`) : '';

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- delegates Escape and the Tab trap for the controls inside
    <div ref={rootRef} onKeyDown={onKeyDown}>
      <div className="flex items-center gap-3 border-b border-[#ff6d05]/20 px-4 py-3">
        <BriefcaseBusiness aria-hidden="true" className="h-4 w-4 shrink-0 text-[#ff6d05]" />
        <h2 className="min-w-0 flex-1 truncate font-mono text-sm text-[#f4e3b8]">{t('fit.title')}</h2>
        <kbd className="shrink-0 rounded border border-[#ff6d05]/25 px-1.5 py-0.5 font-mono text-[10px] text-[#d4af7a]">
          esc · {t('ask.back')}
        </kbd>
      </div>

      <div className="max-h-[min(30rem,70vh)] overflow-y-auto px-4 py-3">
        <label htmlFor="fit-job" className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-[#ffaa2a]">
          {t('fit.inputLabel')}
        </label>
        <textarea
          id="fit-job"
          ref={fieldRef}
          value={job}
          onChange={(e) => setJob(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={result.rows.length ? 3 : 6}
          maxLength={FIT_LIMITS.maxLen + 500}
          placeholder={t('fit.placeholder')}
          dir="auto"
          className="w-full resize-y rounded-lg border border-[#ff6d05]/25 bg-black/30 px-3 py-2 text-sm text-[#f4e3b8] outline-none placeholder:text-[#b8946a] focus-visible:border-[#ff6d05]/70"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className={`font-mono text-[10px] ${length > FIT_LIMITS.maxLen ? 'text-[#ffaa2a]' : 'text-[#d4af7a]'}`}>
            {t('fit.counter', { count: length, max: FIT_LIMITS.maxLen })}
            {' · '}
            {t('fit.shortcut', { key: shortcutKey })}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!ready || busy}
            className="rounded-full border border-[#ff6d05]/50 bg-[#ff6d05]/[0.12] px-4 py-1.5 text-xs text-[#f9d174] transition-colors duration-150 hover:bg-[#ff6d05]/20 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05]"
          >
            {busy ? t('fit.running') : t('fit.submit')}
          </button>
        </div>
        {!ready && length > 0 && length < FIT_LIMITS.minLen ? (
          <p className="mt-2 text-xs text-[#d4af7a]">{t('fit.tooShort', { min: FIT_LIMITS.minLen })}</p>
        ) : null}

        {total || busy ? (
          <section aria-label={t('fit.rowsLabel')} aria-busy={busy} className="mt-4">
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
              {['strong', 'partial', 'gap'].map((v) =>
                counts[v] ? (
                  <span
                    key={v}
                    className={`${VERDICT_STYLE[v].bar} h-full transition-[width] duration-300 motion-reduce:transition-none`}
                    style={{ width: `${(counts[v] / Math.max(total, 1)) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <p className="mt-1.5 font-mono text-[10px] text-[#d4af7a]">
              {total
                ? t('fit.summary', {
                    strong: formatNumber(counts.strong, locale),
                    partial: formatNumber(counts.partial, locale),
                    gap: formatNumber(counts.gap, locale),
                  })
                : t('fit.running')}
            </p>
            <ol className="mt-3 space-y-2">
              {result.rows.map((row, i) => {
                const { Icon, cls } = VERDICT_STYLE[row.verdict];
                return (
                  // eslint-disable-next-line react/no-array-index-key -- rows only ever append
                  <li key={i} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cls}`}
                      >
                        <Icon aria-hidden="true" className="h-3 w-3" />
                        {t(`fit.verdicts.${row.verdict}`)}
                      </span>
                      <p dir="auto" className="min-w-0 flex-1 text-sm text-[#f4e3b8]">
                        {row.requirement}
                      </p>
                    </div>
                    {row.evidence ? (
                      <p dir="auto" className="mt-1.5 text-xs leading-relaxed text-[#ead9b0]">
                        {row.evidence}
                      </p>
                    ) : null}
                    {row.sources.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {row.sources.map(sourceFor).filter(Boolean).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              onClose();
                              onNavigate(s.href, s.label);
                            }}
                            className="rounded-full border border-[#ff6d05]/25 px-2 py-0.5 text-[11px] text-[#ead9b0] transition-colors duration-150 hover:border-[#ff6d05]/60 hover:text-[#f9d174] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05]"
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
        {errorKey ? <p className="mt-3 text-sm text-[#ffaa2a]">{t(`ask.errors.${errorKey}`)}</p> : null}
      </div>

      <p role="status" className="sr-only">
        {status}
      </p>
      <p className="border-t border-[#ff6d05]/15 px-5 py-2.5 text-[11px] leading-snug text-[#d4af7a]">
        {t('fit.disclaimer')}
      </p>
    </div>
  );
}
