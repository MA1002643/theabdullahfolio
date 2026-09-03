'use client';

import { useEffect, useState } from 'react';
import { randomAnonId } from '@/lib/guestbook/anonId';

// "N here now" presence for the guestbook (issue #40 Phase 4). Each tab
// heartbeats an anonymous per-tab id every 15s — the POST both registers the
// beat and returns the current count, so polling and presence are one
// request. Hidden tabs skip their beats entirely (the interval stays armed
// but does nothing), which is both the battery-polite move and what makes
// the count honest: a backgrounded tab ages out of the server's 60s window.
const HEARTBEAT_MS = 15 * 1000;
const ID_KEY = 'guestbook:presence-id';

// Never throws: randomAnonId() has its own non-crypto fallback, because the
// first cut called crypto.randomUUID in BOTH branches below — a secure-context
// API that is simply undefined over plain http on a LAN address (the dev
// server viewed from a real phone), so the catch re-threw and the effect took
// the whole wall down for the sake of a decorative counter.
function tabId() {
  try {
    let id = sessionStorage.getItem(ID_KEY);
    if (!id) {
      id = randomAnonId();
      sessionStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked — a per-mount id still dedupes within this visit.
    return randomAnonId();
  }
}

export function usePresence(enabled = true) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    const id = tabId();

    const beat = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/guestbook/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        if (res.ok && !stopped) {
          const data = await res.json();
          if (Number.isFinite(data.count)) setCount(data.count);
        }
      } catch {
        // A missed beat is fine — the next tick retries; presence is
        // best-effort decoration, never load-bearing.
      }
    };

    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    // Coming back to the tab beats immediately instead of waiting out the
    // remainder of the interval.
    const onVisible = () => {
      if (!document.hidden) beat();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  return count;
}
