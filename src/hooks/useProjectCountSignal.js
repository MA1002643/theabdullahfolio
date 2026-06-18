"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Single fixed key — the completed-projects count is a site-wide value
// (driven by `projectsData`), not per-user. Mirrors the keying discipline of
// `useLanguagesUpdateSignal` without a username segment.
const STORAGE_KEY = "project-count:last-seen";

// Normalise a breakdown array (`[{ label, count }]`) into a plain
// `{ [label]: count }` map — the shape the per-category diff and the persisted
// baseline both use.
function toCatMap(breakdown) {
  const map = {};
  if (Array.isArray(breakdown)) {
    for (const b of breakdown) {
      if (b && typeof b.label === "string" && Number.isFinite(b.count)) {
        map[b.label] = b.count;
      }
    }
  }
  return map;
}

function readStored() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    // Legacy baseline: a bare non-negative finite number (written before this
    // hook tracked per-category counts). Accept it as a count-only baseline so
    // the banner still fires on the next change; `cats: null` just means that
    // ONE post-upgrade change can't be attributed to specific categories (no
    // per-category heartbeat that once) — it self-heals on the next write.
    if (typeof parsed === "number") {
      return Number.isFinite(parsed) && parsed >= 0 ? { count: parsed, cats: null } : null;
    }
    // Current shape: `{ count: number>=0, cats: { [label]: number>=0 } }`. Validate
    // the full shape before trusting it — a hand-edited / corrupt entry must be
    // treated as no baseline (overwritten silently) rather than diffed against,
    // which would fabricate or suppress a banner + heartbeat.
    //
    // `typeof x === "object"` is also true for arrays AND null, so both `parsed`
    // and `parsed.cats` need explicit `Array.isArray` / `=== null` guards: an
    // array (e.g. `cats: []`) would otherwise pass the bare typeof check and then
    // `Object.keys([])` / index access downstream yields a nonsense diff. Every
    // `cats` VALUE must also be a finite, non-negative number — the same contract
    // `count` and `toCatMap` hold — so a corrupt `{ Web: "x" }` / `{ Web: NaN }`
    // can't slip in and poison the per-category compare.
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      typeof parsed.count !== "number" ||
      !Number.isFinite(parsed.count) ||
      parsed.count < 0 ||
      typeof parsed.cats !== "object" ||
      parsed.cats === null ||
      Array.isArray(parsed.cats) ||
      !Object.values(parsed.cats).every(
        (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
      )
    ) {
      return null;
    }
    return { count: parsed.count, cats: parsed.cats };
  } catch {
    // Corrupt entry or storage blocked (private mode) — treat as no baseline so
    // the banner simply stays silent rather than throwing.
    return null;
  }
}

function writeStored(count, cats) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ count, cats }));
  } catch {
    // QuotaExceeded / private-mode block — we lose the next-visit diff but the
    // counter still renders fine.
  }
}

/**
 * Decides whether the "Completed Projects" update banner should appear AND which
 * project categories changed, based on whether the project breakdown changed
 * since this device last saw it.
 *
 * `projectsData` is a static module import, so the breakdown only ever changes
 * across a deploy — there's no runtime source to poll. This signal therefore
 * compares the current breakdown against a per-device baseline persisted in
 * `localStorage` (the model `useLanguagesUpdateSignal` / `useSkillsUpdateSignal`
 * use): the first visit records the breakdown silently, and a later visit after
 * a change surfaces a one-time `pendingMessage` plus `changedCategories` — the
 * labels whose count grew or that are newly present. The consumer shows the
 * banner once the section scrolls into view and heartbeats the changed
 * categories' legend entry (label + count), exactly like the Skills card's
 * category-header heartbeat.
 *
 * Behaviour:
 *   - First load on a device (no baseline) → record silently, nothing surfaced.
 *   - Breakdown unchanged → nothing surfaced.
 *   - Breakdown changed → advance the baseline immediately (so a reload before
 *     the user scrolls doesn't replay it) and expose the message + the grown/new
 *     category labels.
 *
 * Keyed on a breakdown fingerprint, so it runs only when the value actually
 * changes — not on every re-render.
 *
 * @param {Array<{ label: string, count: number }>} breakdown - per-category counts
 * @returns {{ pendingMessage: string|null, consume: () => void, changedCategories: string[], clearChangedCategories: () => void }}
 */
export function useProjectCountSignal(breakdown) {
  const [pendingMessage, setPendingMessage] = useState(null);
  // The category labels whose count GREW or that are newly present in this
  // change cycle — surfaced so the card can heartbeat exactly those legend
  // entries. Cleared by the consumer once the pulse has played.
  const [changedCategories, setChangedCategories] = useState([]);

  // Derived, deterministic trigger so the effect runs only when the breakdown
  // actually moves (a project added/removed/moved, or a new category), never on
  // an unrelated re-render. `count` is the sum (drives the banner total);
  // `fingerprint` is the ordered label:count string (the change-only key).
  const count = useMemo(
    () =>
      Array.isArray(breakdown)
        ? breakdown.reduce((s, b) => s + (Number.isFinite(b.count) ? b.count : 0), 0)
        : 0,
    [breakdown],
  );
  const fingerprint = useMemo(
    () => (Array.isArray(breakdown) ? breakdown.map((b) => `${b.label}:${b.count}`).join("|") : ""),
    [breakdown],
  );

  useEffect(() => {
    if (!Array.isArray(breakdown) || breakdown.length === 0) return;
    const cats = toCatMap(breakdown);
    const stored = readStored();

    if (stored === null) {
      // No baseline yet — record this breakdown and stay silent.
      writeStored(count, cats);
      return;
    }

    const storedCats = stored.cats; // may be null for a legacy (count-only) baseline

    // Legacy numeric baseline whose total still matches: upgrade it to the
    // per-category shape silently (no banner — nothing changed). Without this,
    // an unchanged returning device would keep the count-only entry forever and
    // the FIRST post-upgrade change could never attribute its categories.
    if (!storedCats && stored.count === count) {
      writeStored(count, cats);
      return;
    }
    // Did anything change? With a per-category baseline, compare every label on
    // either side; with a legacy baseline, fall back to the total.
    const hasChange = storedCats
      ? [...new Set([...Object.keys(storedCats), ...Object.keys(cats)])].some(
          (l) => (storedCats[l] ?? 0) !== (cats[l] ?? 0),
        )
      : stored.count !== count;
    if (!hasChange) return;

    // Advance the baseline immediately so a reload before the user scrolls
    // doesn't replay the banner/heartbeat; both live in React state until the
    // consumer shows + consumes them once the section is visible.
    writeStored(count, cats);

    const delta = count - stored.count;
    const message =
      delta > 0
        ? `${delta} new completed project${delta !== 1 ? "s" : ""} added — now ${count}`
        : `Completed projects updated — now ${count}`;
    setPendingMessage(message);

    // Heartbeat targets: categories that GREW or are NEW since the baseline. A
    // legacy (cats: null) baseline can't attribute the change, so none pulse
    // that once — the freshly-written `cats` map makes the next change precise.
    const grown = storedCats
      ? Object.keys(cats).filter((l) => cats[l] > (storedCats[l] ?? 0))
      : [];
    setChangedCategories(grown);
    // `fingerprint` is the change-only trigger; `breakdown`/`count` are read
    // through it and intentionally not extra deps (they move together).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const consume = useCallback(() => setPendingMessage(null), []);
  const clearChangedCategories = useCallback(() => setChangedCategories([]), []);

  return { pendingMessage, consume, changedCategories, clearChangedCategories };
}
