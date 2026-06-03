"use client";

import { useCallback, useEffect, useState } from "react";

// Single fixed key — the completed-projects count is a site-wide value
// (driven by `projectsData.length`), not per-user. Mirrors the keying
// discipline of `useLanguagesUpdateSignal` without a username segment.
const STORAGE_KEY = "project-count:last-seen";

function readStored() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const n = Number(JSON.parse(raw));
    return Number.isFinite(n) ? n : null;
  } catch {
    // Corrupt entry or storage blocked (private mode) — treat as no
    // baseline so the banner simply stays silent rather than throwing.
    return null;
  }
}

function writeStored(count) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(count));
  } catch {
    // QuotaExceeded / private-mode block — we lose the next-visit diff but
    // the counter still renders fine.
  }
}

/**
 * Decides whether the "Completed Projects" update banner should appear,
 * based on whether the project count changed since this device last saw it.
 *
 * `projectsData` is a static module import, so the count only ever changes
 * across a deploy — there's no runtime data source to poll. This signal
 * therefore compares the current count against a per-device baseline
 * persisted in `localStorage` (exactly the model `useLanguagesUpdateSignal`
 * uses for the language fingerprint): the first visit records the count
 * silently, and a later visit after the count changed surfaces a one-time
 * `pendingMessage` that the consumer shows once the section scrolls into
 * view, then clears via `consume()`.
 *
 * Behaviour:
 *   - First load on a device (no baseline) → record silently, no banner.
 *   - Count unchanged → no banner.
 *   - Count changed → advance the baseline immediately (so a reload before
 *     the user scrolls doesn't replay the banner) and expose a message.
 *
 * Keyed on the numeric `count`, so it runs only when the value actually
 * changes — not on every re-render.
 *
 * @param {number} count - current completed-projects count
 * @returns {{ pendingMessage: string|null, consume: () => void }}
 */
export function useProjectCountSignal(count) {
  const [pendingMessage, setPendingMessage] = useState(null);

  useEffect(() => {
    // Guard against the pre-hydration 0 / non-numeric values — there's
    // nothing meaningful to compare or announce until a real count lands.
    if (typeof count !== "number" || count <= 0) return;

    const stored = readStored();

    if (stored === null) {
      // No baseline yet — record this count and stay silent.
      writeStored(count);
      return;
    }
    if (stored === count) return; // nothing changed

    // Advance the baseline immediately so a reload before the user scrolls
    // doesn't replay the same banner; the message lives in React state until
    // the consumer shows + consumes it once the section is visible.
    writeStored(count);

    const delta = count - stored;
    const message =
      delta > 0
        ? `${delta} new completed project${delta !== 1 ? "s" : ""} added — now ${count}`
        : `Completed projects updated — now ${count}`;
    setPendingMessage(message);
  }, [count]);

  const consume = useCallback(() => setPendingMessage(null), []);

  return { pendingMessage, consume };
}
