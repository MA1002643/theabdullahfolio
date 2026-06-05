"use client";

import { useCallback, useEffect, useState } from "react";

import { computeStreakDiff, streakFingerprint } from "@/utils/streakDiff";

// Single-user site, so one fixed key suffices — mirrors the keying discipline
// of `useLanguagesUpdateSignal`.
const STORAGE_KEY = "streak-update:last-seen";

function readStored() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Corrupt entry or storage blocked (private mode) — treat as no baseline
    // so the banner simply stays silent rather than throwing.
    return null;
  }
}

function writeStored(value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // QuotaExceeded / private-mode block — we lose the next-visit diff but the
    // card still renders fine.
  }
}

/**
 * Decides whether the Current Streak update banner should appear, based on
 * whether the streak stats changed since this device last saw them (issue #21).
 *
 * Persists the last-seen fingerprint + streak snapshot in localStorage. When
 * the current snapshot's fingerprint differs from the stored one, it diffs the
 * two (via `computeStreakDiff`) and surfaces a human-readable `pendingMessage`
 * describing exactly what changed. The fingerprint is derived from the data
 * itself (`streakFingerprint`) — not a server field — so it also works on the
 * bundled fallback payload and can never drift from the server.
 *
 * This is what makes a background update visible: if the streak changes while
 * the user is already on the About page (a 10-min poll lands new data), the
 * fingerprint moves, the baseline advances, and `pendingMessage` is set —
 * the consumer then shows it on the next time the section is in view and calls
 * `consume()` to clear it.
 *
 * Behaviour:
 *   - First load on a device (no baseline) → record silently, no banner.
 *   - Fingerprint unchanged → no banner.
 *   - Fingerprint changed but no tracked field actually moved → no banner
 *     (advance the baseline anyway so we don't re-diff the same snapshot).
 *   - Fingerprint changed with a real diff → store the new baseline, expose
 *     `pendingMessage`.
 *
 * Keyed on the fingerprint STRING (not object identity), so it runs only on a
 * genuine data change — re-renders with a fresh-but-equal object don't re-fire.
 *
 * @param {object|null} streaks - `data.stats.streaks`
 * @returns {{ pendingMessage: string|null, consume: () => void }}
 */
export function useStreakUpdateSignal(streaks) {
  const [pendingMessage, setPendingMessage] = useState(null);

  const fingerprint = streakFingerprint(streaks);

  useEffect(() => {
    if (!fingerprint) return;
    // Use the `streaks` captured by THIS render's closure — the exact snapshot
    // `fingerprint` was computed from — not a mutable "latest" ref. If a newer
    // payload commits before this passive effect flushes, a ref would pair an
    // old `fingerprint` with the newer snapshot, so the stored
    // `{ fingerprint, streaks }` could diff against the wrong baseline and
    // suppress or misreport the banner. The effect is still gated on
    // `fingerprint` ALONE (not `streaks`, whose identity changes every render
    // and would re-run it constantly); a new `streaks` object carrying
    // identical values produces the same fingerprint, so the captured snapshot
    // stays value-equivalent.
    const current = streaks;
    const stored = readStored();

    if (!stored) {
      // No baseline yet — record this snapshot and stay silent.
      writeStored({ fingerprint, streaks: current });
      return;
    }
    if (stored.fingerprint === fingerprint) return; // nothing changed

    const diff = computeStreakDiff(stored.streaks, current);
    // Advance the baseline immediately so a reload before the user scrolls
    // doesn't replay the same banner indefinitely. The message lives in React
    // state until the section becomes visible and the consumer shows it.
    writeStored({ fingerprint, streaks: current });
    if (diff.hasChanged) setPendingMessage(diff.summaryMessage);
    // `streaks` is intentionally captured by closure, not listed as a dep — see
    // the comment above; `fingerprint` is the change-only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const consume = useCallback(() => setPendingMessage(null), []);

  return { pendingMessage, consume };
}
