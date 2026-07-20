'use client';

import { useEffect, useRef, useState } from 'react';

// Polls /api/spotify and hands the widget the latest track. Deliberately small:
// one endpoint, no data-fetching library (per the issue's constraints).
//
// Visibility-aware, mirroring src/components/home/LiveMaintenanceHeader.jsx:
//   • visible tab → poll every `pollInterval` (default 30s, aligned to the
//     route's 30s edge cache, so the server sees ~2 Spotify calls/min at most).
//   • hidden tab  → stop polling entirely (nobody's looking), and fire one
//     immediate refresh the moment the tab becomes visible again so the widget
//     is never stale when the user returns.
// Network errors keep the PREVIOUS data (no flash to empty); the widget only
// disappears when the server genuinely reports nothing to show.

const HIDDEN = () =>
  typeof document !== 'undefined' && document.visibilityState === 'hidden';

export function useNowPlaying(pollInterval = 30000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function fetchNowPlaying() {
      // Hard client-side timeout so a slow/hung route can never stall the poll
      // cadence — abort after 8s and keep the previous data.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch('/api/spotify', {
          cache: 'no-store',
          signal: controller.signal,
        });
        // A non-2xx (the route returns 502 on an upstream Spotify failure) is
        // treated as an error so we KEEP the previous track rather than blanking
        // — only a genuine 200 "nothing playing" replaces it.
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (mountedRef.current) setData(json);
      } catch {
        // Keep whatever we last had — a transient poll failure (network, abort,
        // or upstream 502) shouldn't blank the widget. Just clears loading.
      } finally {
        clearTimeout(timeout);
        if (mountedRef.current) setLoading(false);
      }
    }

    function schedule() {
      clearTimeout(timerRef.current);
      // Never re-arm after unmount: schedule() is chained onto in-flight fetch
      // promises (mount, poll callback, visibility regain), any of which can
      // resolve AFTER cleanup ran — without this guard that would arm an
      // untracked timer that polls forever on a detached component.
      if (!mountedRef.current || HIDDEN()) return; // also paused while hidden
      timerRef.current = setTimeout(async () => {
        await fetchNowPlaying();
        schedule();
      }, pollInterval);
    }

    function onVisibility() {
      if (!HIDDEN()) {
        // Returned to the tab — refresh now, then resume the cadence.
        fetchNowPlaying().then(schedule);
      } else {
        clearTimeout(timerRef.current);
      }
    }

    fetchNowPlaying().then(schedule);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pollInterval]);

  return { data, loading };
}
