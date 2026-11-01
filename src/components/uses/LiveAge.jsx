'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUsesFormat } from './useUsesFormat';

// The Stack plate's "verified 3m 25s ago" readout (owner correction,
// 2026-09-05: the age must visibly count up second by second, and its digits
// must wear the page title's ember). It is the maintenance header's digit
// grammar, as ProjectProgressPopup's SyncAge already renders it: every digit
// run in flat `#ff6d05`, the unit text in the provenance line's own grey, so
// the numbers read as the instrument's readout and the words as its label.
//
// Cadence is the same adaptive, self-rescheduling timeout: every second while
// formatAge exposes a seconds component (under an hour), every 30 s in the
// hours band (only the minutes part moves), every 30 min beyond — the age
// counts up at whatever grain the format shows, without burning renders past
// it. A hidden tab skips the state write and re-syncs the moment it returns.
//
// Owned by its own component on purpose: the per-second render touches this
// one span, never the plate — the tile grid above it is forty-odd framer
// nodes and must not re-render on a clock.

// Delay until the next tick, from how old the fix is right now.
export function nextAgeDelay(fromISO, now) {
  const sec = Math.max(0, (now - Date.parse(fromISO)) / 1000);
  if (sec < 3600) return 1000;
  if (sec < 86400) return 30 * 1000;
  return 30 * 60 * 1000;
}

// "3m 25s ago" → digit runs and the text between them, in order. A fixed
// split of a formatter this module owns, so index keys are stable. `\p{Nd}`
// rather than `\d` (issue #82): the digit runs may be Arabic-Indic or any
// other script's decimal digits, and they must still wear the ember.
export const splitAge = (text) => text.split(/(\p{Nd}+)/u).filter(Boolean);

// formatAge's grammar (src/utils/formatAge.js — "3m 25s ago", "2h 04m ago",
// "1d 03h ago"), as parts the catalogue can word: the unit band and its two
// numbers, the trailing one zero-padded. The words are the Uses catalogue's
// (liveAge.s / ms / hm / dh), so English renders exactly formatAge's string
// and every other locale its own, in its own digits.
export function ageParts(fromISO, now) {
  const fromMs = Date.parse(fromISO);
  if (Number.isNaN(fromMs)) return null;
  const sec = Math.max(0, Math.floor((now - fromMs) / 1000));
  if (sec < 60) return { key: 's', a: sec };
  if (sec < 3600) return { key: 'ms', a: Math.floor(sec / 60), b: sec % 60 };
  if (sec < 86400) return { key: 'hm', a: Math.floor(sec / 3600), b: Math.floor((sec % 3600) / 60) };
  return { key: 'dh', a: Math.floor(sec / 86400), b: Math.floor((sec % 86400) / 3600) };
}

const AGE_VARS = { s: ['s'], ms: ['m', 's'], hm: ['h', 'm'], dh: ['d', 'h'] };

export default function LiveAge({ fetchedAt }) {
  const t = useTranslations('Uses');
  const { num, ord } = useUsesFormat();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!fetchedAt) return undefined;
    setNow(Date.now());
    let timeoutId;
    const schedule = () => {
      timeoutId = setTimeout(() => {
        if (document.visibilityState !== 'hidden') setNow(Date.now());
        schedule();
      }, nextAgeDelay(fetchedAt, Date.now()));
    };
    schedule();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchedAt]);

  if (!fetchedAt) return null;

  const parts = ageParts(fetchedAt, now);
  const [first, second] = parts ? AGE_VARS[parts.key] : [];
  const age = parts
    ? t(`liveAge.${parts.key}`, {
        [first]: num(parts.a),
        ...(second ? { [second]: ord(parts.b) } : {}),
      })
    : '';

  return (
    <span className="uses-age tabular-nums">
      {splitAge(t('liveAge.verified', { age })).map((part, i) =>
        /^\p{Nd}+$/u.test(part) ? (
          <span key={i} className="font-semibold text-[#ff6d05]">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
