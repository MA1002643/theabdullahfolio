'use client';

import { useEffect, useState } from 'react';
import { formatAge } from '@/utils/formatAge';

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
// split of a formatter this module owns, so index keys are stable.
export const splitAge = (text) => text.split(/(\d+)/).filter(Boolean);

export default function LiveAge({ fetchedAt }) {
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

  return (
    <span className="uses-age tabular-nums">
      verified{' '}
      {splitAge(formatAge(fetchedAt, now)).map((part, i) =>
        /^\d+$/.test(part) ? (
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
