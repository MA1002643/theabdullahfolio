"use client";

import { useCallback, useEffect, useState } from "react";

import {
  diffLanguages,
  languagesFingerprint,
  risenLanguages,
  risenRepoKeys,
} from "@/utils/languageDiff";

// Single-user site, so one fixed key suffices. Mirrors the keying
// discipline of `useExperienceSummary` (which keys per-username) without
// the extra param — the languages card never receives a username, and the
// allowlisted endpoint only ever serves the owner's account.
const STORAGE_KEY = "languages-update:last-seen";

function readStored() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Corrupt entry or storage blocked (private mode) — treat as no
    // baseline so the banner simply stays silent rather than throwing.
    return null;
  }
}

function writeStored(value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // QuotaExceeded / private-mode block — we lose the next-visit diff but
    // the card still renders fine.
  }
}

/**
 * Decides whether the "Most Used Languages" update banner should appear,
 * based on whether the language stats changed since this device last saw
 * them.
 *
 * Persists the last-seen fingerprint + language list in localStorage. When
 * the current list's fingerprint differs from the stored one, it diffs the
 * two (via `diffLanguages`) and surfaces a human-readable `pendingMessage`.
 * The fingerprint is derived from the data itself (`languagesFingerprint`)
 * rather than trusting a server-provided field, so it also works on the
 * bundled fallback payload and can never drift from the server's value
 * (same helper on both sides).
 *
 * Behaviour:
 *   - First load on a device (no baseline) → record silently, no banner
 *     (QA: don't announce a "change" when there's nothing to compare to).
 *   - Fingerprint unchanged → no banner.
 *   - Fingerprint changed → store new baseline, expose `pendingMessage`.
 *     The consumer shows it once the section scrolls into view and calls
 *     `consume()` to clear it.
 *
 * The effect keys on the fingerprint *string* (not the array identity), so
 * it runs only on a genuine data change — re-renders with a fresh-but-
 * equal array don't re-fire it.
 *
 * @param {Array<{language: string, percentage: string|number}>} languages
 * @returns {{
 *   pendingMessage: string|null,
 *   consume: () => void,
 *   changedLanguages: string[],
 *   changedRepoKeys: string[],
 *   clearChangedLanguage: (name: string) => void,
 *   clearChangedRepo: (key: string) => void,
 * }}
 */
export function useLanguagesUpdateSignal(languages) {
  const [pendingMessage, setPendingMessage] = useState(null);
  // The language NAMES that rose this change cycle (moved up or % increased) and
  // the repo KEYS (`"<language>::<repo>"`) that rose within a language's
  // breakdown — surfaced so the card can heartbeat exactly those rows (and the
  // popover those repos) once the section is in view and the banner has cleared.
  // Each is consumed per-item by the card so a row pulses only the first time.
  const [changedLanguages, setChangedLanguages] = useState([]);
  const [changedRepoKeys, setChangedRepoKeys] = useState([]);

  const fingerprint =
    Array.isArray(languages) && languages.length > 0
      ? languagesFingerprint(languages)
      : null;

  useEffect(() => {
    if (!fingerprint) return;
    // Use the `languages` captured by THIS render's closure — the exact list
    // `fingerprint` was computed from — not a mutable "latest" ref. If a newer
    // payload commits before this passive effect flushes, a ref would pair an
    // old `fingerprint` with the newer list, so the stored
    // `{ fingerprint, languages }` could diff against the wrong baseline and
    // suppress or misreport the banner. The effect is still gated on
    // `fingerprint` ALONE (not `languages`, whose identity changes every render
    // and would re-run it constantly); a fresh-but-equal array produces the same
    // fingerprint, so the captured snapshot stays value-equivalent.
    const current = languages;
    const stored = readStored();

    if (!stored) {
      // No baseline yet — record this snapshot and stay silent.
      writeStored({ fingerprint, languages: current });
      return;
    }
    if (stored.fingerprint === fingerprint) return; // nothing changed

    const diff = diffLanguages(stored.languages, current);
    // Advance the baseline immediately so a reload before the user scrolls
    // doesn't replay the same banner indefinitely. The message lives in
    // React state until the section becomes visible and the consumer
    // shows + consumes it.
    writeStored({ fingerprint, languages: current });
    if (diff.hasChanges) {
      setPendingMessage(diff.summaryMessage);
      // Rows to heartbeat: languages that rose, and repos that rose within a
      // language's breakdown. Repo-share shifts only surface here when a
      // language-level change ALSO moved the fingerprint (the popover heartbeat
      // piggybacks on the banner rather than firing it on noisy share drift).
      setChangedLanguages(risenLanguages(diff.details));
      setChangedRepoKeys(risenRepoKeys(stored.languages, current));
    }
    // `languages` is intentionally captured by closure, not listed as a dep —
    // see the comment above; `fingerprint` is the change-only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const consume = useCallback(() => setPendingMessage(null), []);
  // Drop one language / repo key once its heartbeat has played, so each pulses
  // only the first time the user sees it (not on every viewport re-entry).
  const clearChangedLanguage = useCallback(
    (name) => setChangedLanguages((prev) => prev.filter((n) => n !== name)),
    [],
  );
  const clearChangedRepo = useCallback(
    (key) => setChangedRepoKeys((prev) => prev.filter((k) => k !== key)),
    [],
  );

  return {
    pendingMessage,
    consume,
    changedLanguages,
    changedRepoKeys,
    clearChangedLanguage,
    clearChangedRepo,
  };
}
