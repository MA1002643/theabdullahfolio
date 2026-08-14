"use client";

import { useCallback, useEffect, useState } from "react";

import { PROJECT_DATA_VERSION } from "@/lib/projectDataVersion";

// Client half of the issue #48 sync loop. Fetches /api/project-progress once
// on mount (so the popup opens warm, no skeleton on the happy path) and
// re-polls every 12 hours — matching the server cache TTL, the same
// "no point asking more often than the server will compute" discipline the
// GitHub stats poll follows. Last-good persistence mirrors the
// github-stats:lastGood pattern: a cold reload hydrates instantly from
// localStorage while the fresh fetch runs in the background.

const STORAGE_KEY = "project-progress:lastGood";
const POLL_MS = 12 * 60 * 60 * 1000;

// A payload is renderable when it carries the projects list AND the current
// payload schema (2 = board-column shape; 1 was the issue-count shape, whose
// snapshots lack the `columns` the UI now renders). Guards the localStorage
// hydrate against stale/foreign shapes surviving a payload change.
const isUsable = (payload) =>
  Array.isArray(payload?.projects) && payload.schemaVersion === 2;

export function useProjectProgress() {
  const [data, setData] = useState(null);
  // True only after a fetch cycle failed outright (network error / non-OK).
  // The popup shows its retry state only when this is set AND there's no
  // data at all — with last-good on screen a failed poll stays silent, the
  // same "never blank a card on a transient failure" rule the stats cards
  // follow.
  const [failed, setFailed] = useState(false);

  const fetchProgress = useCallback(async () => {
    let json;
    try {
      const res = await fetch("/api/project-progress");
      if (!res.ok) throw new Error(`project-progress API responded ${res.status}`);
      json = await res.json();
      if (!isUsable(json)) throw new Error("project-progress payload malformed");
    } catch (err) {
      console.error("Failed to load project progress:", err);
      setFailed(true);
      return;
    }

    setFailed(false);
    setData((prev) => {
      // The server's static `_fallback` payload (GitHub unreachable) knows
      // nothing this client doesn't already know from data.js — never let it
      // overwrite a last-good with live percentages. It only populates a
      // truly empty first load, where structure-without-percentages still
      // beats an error state.
      if (json._fallback) return prev ?? json;
      return json;
    });

    // Persist for the next cold load — live payloads only, so a transient
    // upstream failure can't downgrade the stored snapshot.
    if (!json._fallback) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
      } catch {
        // Quota exceeded or private mode — non-fatal.
      }
    }
  }, []);

  useEffect(() => {
    // Hydrate from the previous visit's payload before the network answers —
    // but ONLY if it was built from the same projectsData this bundle ships
    // (dataVersion match). A snapshot from before a data.js change carries
    // the OLD project list — wrong project count, wrong category totals —
    // and, when every later fetch is a `_fallback` (e.g. no GitHub token),
    // nothing would ever displace it. Version-mismatched snapshots are
    // deleted, not just skipped, so they can't resurface.
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isUsable(parsed) && parsed.dataVersion === PROJECT_DATA_VERSION) {
          setData((prev) => prev ?? parsed);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // Parse / access errors — the fetch below will populate state.
    }

    fetchProgress();
    const interval = setInterval(fetchProgress, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchProgress]);

  return { data, failed, refetch: fetchProgress };
}
