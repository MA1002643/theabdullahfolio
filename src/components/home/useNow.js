'use client';

import { useEffect, useState } from 'react';

// Shared once-per-second clock for the popover age labels (issue #94
// §6.3). One module-level requestAnimationFrame loop serves every
// subscriber — N open age cells never means N timers — and the loop only
// runs while at least one component subscribes, so a closed popover costs
// zero renders. rAF (vs setInterval) also pauses automatically while the
// tab is hidden.

const listeners = new Set();
let rafId = null;
let lastEmit = 0;

function tick() {
  rafId = requestAnimationFrame(tick);
  const now = Date.now();
  if (now - lastEmit >= 1000) {
    lastEmit = now;
    listeners.forEach((listener) => listener(now));
  }
}

function subscribe(listener) {
  listeners.add(listener);
  if (rafId === null) {
    lastEmit = Date.now();
    rafId = requestAnimationFrame(tick);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}

// Returns the current epoch ms, updating every ~1s while `enabled`.
// Pass `enabled=false` to suspend (e.g. popover closed) — the value
// freezes and the shared loop stops when the last subscriber leaves.
export function useNow(enabled = true) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    // Re-sync immediately on (re)subscribe so a just-opened popover shows
    // fresh ages instead of waiting up to a second for the first tick.
    setNow(Date.now());
    return subscribe(setNow);
  }, [enabled]);

  return now;
}
