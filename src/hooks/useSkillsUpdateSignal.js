"use client";

import { useCallback, useEffect, useState } from "react";

import {
  buildBannerMessage,
  diffSkillData,
  diffSkills,
  skillsDataFingerprint,
  skillsFingerprint,
} from "@/utils/skillsDiff";

// Single-user site, so one fixed key suffices — mirrors the keying discipline
// of `useLanguagesUpdateSignal` / `useStreakUpdateSignal`.
const STORAGE_KEY = "skills-update:last-seen";

function readStored() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    // A valid baseline is an object shaped `{ fingerprint: string, skills: [] }`
    // whose fingerprint matches the one its own snapshot regenerates. JSON.parse
    // yields non-objects (`true`, `42`, `"oops"`) for a hand-edited or corrupt
    // entry, and the effect dereferences `stored.fingerprint`/`stored.skills`
    // directly — on a primitive that throws, and on a mismatched pair the diff
    // would run against the WRONG baseline and fabricate/suppress a banner.
    // Validate the full shape and cross-check the fingerprint (deterministic, so
    // an honest entry always round-trips); treat anything else as no baseline so
    // the `!stored` branch below overwrites it silently. (`typeof null` is
    // "object", so the explicit null check is load-bearing.)
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.fingerprint !== "string" ||
      !Array.isArray(parsed.skills) ||
      skillsFingerprint(parsed.skills) !== parsed.fingerprint
    ) {
      return null;
    }
    // `dataFingerprint` (repo usage per skill) is OPTIONAL — a baseline written
    // before it existed simply lacks it (handled as "adopt silently" by the
    // effect). But when present it must round-trip from its own snapshot, same
    // rule as the structural fingerprint above: a mismatched pair would diff
    // repo data against the wrong baseline and pulse icons that didn't change.
    if (
      parsed.dataFingerprint !== undefined &&
      (typeof parsed.dataFingerprint !== "string" ||
        skillsDataFingerprint(parsed.skills) !== parsed.dataFingerprint)
    ) {
      return null;
    }
    return parsed;
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
    // grid still renders fine.
  }
}

/**
 * Decides whether the "skills changed" banner should appear, based on whether
 * the skill set changed since this device last saw it (issue #20, Task 5).
 *
 * Persists the last-seen fingerprint + flat skill list in localStorage. When
 * the current fingerprint differs from the stored one, it diffs the two (via
 * `diffSkills`) and surfaces the exact-changes message — each icon shown as its
 * name + the category it entered/left, plus category moves ("Added: Rust
 * (Languages) · Removed: Replit (Software) · Moved: Vercel (Tools → Software)")
 * — as `pendingMessage`. The fingerprint (slug + category) is derived from the
 * skill list itself
 * (`skillsFingerprint`), so it works on the curated payload too and can never
 * drift from a server value (same helper both sides). This is the per-device
 * model every other About card uses — `useLanguagesUpdateSignal` /
 * `useStreakUpdateSignal` / `useProjectCountSignal`.
 *
 * Behaviour:
 *   - First load on a device (no baseline) → record silently, no banner.
 *   - Fingerprint unchanged → no banner.
 *   - Fingerprint changed → store the new baseline, expose `pendingMessage`.
 *     The consumer shows it once the section scrolls into view and calls
 *     `consume()` to clear it.
 *
 * Keyed on the fingerprint STRING (not array identity), so it runs only on a
 * genuine change — a fresh-but-equal list produces the same fingerprint and
 * doesn't re-fire.
 *
 * @param {Array<{ slug: string, displayName: string }>} skills - flat skill list
 * @returns {{ pendingMessage: string|null, consume: () => void }}
 */
export function useSkillsUpdateSignal(skills) {
  const [pendingMessage, setPendingMessage] = useState(null);
  // The icons ADDED in this change cycle — `{ slug, category }[]` — surfaced so
  // the card can heartbeat exactly those icons (and their category header) when
  // the user scrolls to them. Cleared per-slug by the consumer once pulsed.
  const [addedSkills, setAddedSkills] = useState([]);
  // EXISTING icons whose repo usage changed (a repo started/stopped using the
  // skill — public list content or private count). Same `{ slug, category }[]`
  // shape and same consumer lifecycle as `addedSkills`, but these pulse the
  // ICON only (no banner, no category-header beat): a count change isn't an
  // Added/Removed/Moved event, it's the same icon with fresher numbers.
  const [changedSkills, setChangedSkills] = useState([]);

  const fingerprint =
    Array.isArray(skills) && skills.length > 0 ? skillsFingerprint(skills) : null;
  // Superset trigger: any structural change also changes the data fingerprint,
  // so keying the effect on it alone still catches everything the structural
  // one did — PLUS repo-usage changes on an unchanged skill set (which is how
  // an in-session background refresh gets its heartbeat).
  const dataFingerprint =
    Array.isArray(skills) && skills.length > 0 ? skillsDataFingerprint(skills) : null;

  useEffect(() => {
    if (!fingerprint || !dataFingerprint) return;
    // Use the `skills` captured by THIS render's closure — the exact list
    // `dataFingerprint` was computed from — not a mutable "latest" ref, so a
    // newer payload committing before this passive effect flushes can't pair an
    // old fingerprint with a newer list. The effect is gated on `dataFingerprint`
    // ALONE (not `skills`, whose identity changes every render); a
    // fresh-but-equal list produces the same fingerprint, so the captured
    // snapshot stays value-equivalent.
    const current = skills;
    const stored = readStored();

    if (!stored) {
      // No baseline yet — record this snapshot and stay silent.
      writeStored({ fingerprint, dataFingerprint, skills: current });
      return;
    }
    if (stored.dataFingerprint === dataFingerprint) return; // nothing changed
    if (stored.dataFingerprint === undefined && stored.fingerprint === fingerprint) {
      // Legacy baseline (saved before repo data existed) with an unchanged
      // skill set: adopt the richer shape silently. Its items carry no repo
      // fields to diff against, and pulsing/bannering here would flag a change
      // the user never made.
      writeStored({ fingerprint, dataFingerprint, skills: current });
      return;
    }

    const diff = diffSkills(stored.skills, current);
    // Repo-usage changes on surviving skills. Baseline items without repo data
    // are skipped inside diffSkillData, so a legacy baseline can never mass-pulse.
    const dataChanged = diffSkillData(stored.skills, current);
    // Advance the baseline immediately so a reload before the user scrolls
    // doesn't replay the same banner. The message lives in React state until
    // the section becomes visible and the consumer shows + consumes it.
    writeStored({ fingerprint, dataFingerprint, skills: current });
    if (diff.hasChanges) {
      setPendingMessage(buildBannerMessage(diff));
      setAddedSkills(diff.added.map((a) => ({ slug: a.slug, category: a.category })));
    }
    // Merge-by-slug rather than replace: a changed slug from a previous cycle
    // that the user never scrolled to (so never pulsed/cleared) must survive —
    // it won't re-detect against the freshly-advanced baseline. Entries whose
    // icon no longer exists are purged; a re-changed slug keeps one entry.
    setChangedSkills((prev) => {
      const currentSlugs = new Set(current.map((s) => s?.slug));
      const fresh = new Set(dataChanged.map((c) => c.slug));
      return [
        ...prev.filter((c) => currentSlugs.has(c.slug) && !fresh.has(c.slug)),
        ...dataChanged,
      ];
    });
    // `skills` is intentionally captured by closure, not listed as a dep — see
    // the comment above; `dataFingerprint` is the change-only trigger (and
    // `fingerprint` is derived from the same snapshot).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataFingerprint]);

  const consume = useCallback(() => setPendingMessage(null), []);
  // Drop one slug once its heartbeat has played, so it pulses only the first
  // time the user scrolls to it (not on every subsequent re-entry). Clears from
  // BOTH streams — the consumer's pulse pipeline doesn't care which kind it was.
  const clearAdded = useCallback((slug) => {
    setAddedSkills((prev) => prev.filter((a) => a.slug !== slug));
    setChangedSkills((prev) => prev.filter((a) => a.slug !== slug));
  }, []);

  return { pendingMessage, addedSkills, changedSkills, consume, clearAdded };
}
