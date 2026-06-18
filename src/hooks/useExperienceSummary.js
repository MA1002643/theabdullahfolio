"use client";

import { useEffect, useState } from "react";

import { formatDuration } from "@/utils/experience/dateMath";

// Polling interval mirrors the about page's /api/github-stats cadence.
// The endpoint is server-cached (`unstable_cache`, 10 min TTL), so the
// poll is cheap in steady state: most hits return from cache. Picks up
// resume edits + GitHub repo create/rename/delete events within ~one
// interval, which is the "live update" the experience modal needs.
const POLL_INTERVAL_MS = 10 * 60 * 1000;

// Per-username storage key so multiple identities on the same machine
// don't clobber each other's last-seen payload. The current allowlist
// pins us to one username, but the keying scheme stays future-proof.
const storageKey = (username) => `experience-summary:last-payload:${username}`;

// Stable identifier for a role across diff cycles — company + title +
// start covers rename detection (title change with same start fires as
// a "new role" record) while still avoiding false positives from
// transient updatedAt-style fields not present on this payload.
// Exported so the breakdown modal can build the SAME key for its rendered roles
// and match them against `addedRoleKeys` (below) for the per-role heartbeat.
export const roleKey = (r) => `${r?.company ?? ""}|${r?.role ?? ""}|${r?.start ?? ""}`;

// Build the human-readable change message from a (prev, next) pair.
// Returns null when nothing meaningful changed (banner stays hidden).
// Messages are prioritised: the most specific / user-impacting change
// wins, so we don't surface "1 new repository" when the actual story
// is "new employment role".
function buildChangeMessage(prev, next) {
  if (!prev || !next) return null;

  // 1. New employment role — highest priority because role additions
  //    are rare and the most "headline" change for a portfolio.
  const prevRoleKeys = new Set((prev.employment?.roles ?? []).map(roleKey));
  const newRoles = (next.employment?.roles ?? []).filter(
    (r) => !prevRoleKeys.has(roleKey(r)),
  );
  if (newRoles.length > 0) {
    return `New role detected from resume: ${newRoles[0].company}`;
  }

  // 2. Total experience tipped over to a new "X+" bucket. Only fire
  //    on an upward move per spec — counting *down* is a parser
  //    regression and shouldn't be celebrated. Display strings come
  //    from the same `formatDuration` helper the server uses for its
  //    `total.display` field, so the banner text can't drift from the
  //    payload's own formatting over time.
  const prevDisplay = formatDuration(prev.total?.months ?? 0);
  const nextDisplay = formatDuration(next.total?.months ?? 0);
  if (
    prevDisplay !== nextDisplay &&
    (next.total?.months ?? 0) > (prev.total?.months ?? 0)
  ) {
    return `Years of experience updated: ${prevDisplay} → ${nextDisplay}`;
  }

  // 3. Employment months ticked without crossing a display bucket
  //    boundary. Captures the in-between cases the bucket check
  //    above misses (e.g. 14 → 16 months still reads as "1+ year").
  const prevEmpMonths = prev.employment?.months ?? 0;
  const nextEmpMonths = next.employment?.months ?? 0;
  if (nextEmpMonths > prevEmpMonths) {
    const delta = nextEmpMonths - prevEmpMonths;
    return `Employment experience updated: +${delta} month${delta === 1 ? "" : "s"}`;
  }

  // 4. New repositories detected on GitHub. Surfaces creates without
  //    being overly chatty about renames or deletes (handled below).
  const prevRepoNames = new Set(
    (prev.personalProjects?.repos ?? []).map((r) => r.name),
  );
  const newRepos = (next.personalProjects?.repos ?? []).filter(
    (r) => !prevRepoNames.has(r.name),
  );
  if (newRepos.length === 1) {
    return `New repository detected: ${newRepos[0].name}`;
  }
  if (newRepos.length > 1) {
    return `${newRepos.length} new repositories detected on GitHub`;
  }

  // 5. Source-date drift: the earliest-repo date changed (probably
  //    because the previously-earliest repo was deleted or renamed).
  if (
    prev.personalProjects?.firstRepoDate !==
    next.personalProjects?.firstRepoDate
  ) {
    return "Personal projects timeline updated";
  }

  return null;
}

// Which split-bar categories actually GREW between (prev, next) — the labels
// the years card heartbeats in its legend (issue #20 follow-up, mirroring the
// Skills / Completed-projects category pulse). Returned values match the
// ExperienceSplitBar legend labels EXACTLY ("Personal" / "Employment") so the
// card can pulse a category's name + percentage by simple membership test.
//
// Derived from real growth (months up, a new repo/role, or a timeline shift),
// NOT from which `buildChangeMessage` branch won — so the pulse always lands on
// the side that moved even when a higher-priority message (e.g. an "X+ → Y+"
// bucket cross) is what's shown. Both percentages technically shift when either
// side moves (they're shares of the total), but only the side whose underlying
// experience grew is the meaningful "this went up", so only it pulses.
function changedExperienceCategories(prev, next) {
  if (!prev || !next) return [];
  const cats = [];

  const prevRepoNames = new Set(
    (prev.personalProjects?.repos ?? []).map((r) => r.name),
  );
  const newRepos = (next.personalProjects?.repos ?? []).filter(
    (r) => !prevRepoNames.has(r.name),
  );
  const personalGrew =
    (next.personalProjects?.months ?? 0) > (prev.personalProjects?.months ?? 0) ||
    newRepos.length > 0 ||
    prev.personalProjects?.firstRepoDate !== next.personalProjects?.firstRepoDate;
  if (personalGrew) cats.push("Personal");

  const prevRoleKeys = new Set((prev.employment?.roles ?? []).map(roleKey));
  const newRoles = (next.employment?.roles ?? []).filter(
    (r) => !prevRoleKeys.has(roleKey(r)),
  );
  const employmentGrew =
    (next.employment?.months ?? 0) > (prev.employment?.months ?? 0) ||
    newRoles.length > 0;
  if (employmentGrew) cats.push("Employment");

  return cats;
}

// The exact repos / roles ADDED between (prev, next) — surfaced so the breakdown
// modal can heartbeat precisely those rows (repo name + date; role name +
// company + duration) and the "N owned repositories" total, mirroring the
// per-item heartbeat the Skills card applies to a just-added icon. Repos are
// keyed by name, roles by the shared `roleKey`. Empty arrays on first load or
// when nothing was added.
function addedExperienceItems(prev, next) {
  if (!prev || !next) return { repoNames: [], roleKeys: [] };

  const prevRepoNames = new Set(
    (prev.personalProjects?.repos ?? []).map((r) => r.name),
  );
  const repoNames = (next.personalProjects?.repos ?? [])
    .filter((r) => r && typeof r.name === "string" && !prevRepoNames.has(r.name))
    .map((r) => r.name);

  const prevRoleKeys = new Set((prev.employment?.roles ?? []).map(roleKey));
  const roleKeys = (next.employment?.roles ?? [])
    .filter((r) => !prevRoleKeys.has(roleKey(r)))
    .map(roleKey);

  return { repoNames, roleKeys };
}

// Strip volatile fields before serialising — `generatedAt` and the
// `changeFingerprint` itself change every fetch and would defeat the
// "did anything *meaningful* change" check. `pdfStatus` and
// `_pdfDiagnosticInternal` mirror the server's fingerprint whitelist
// (route.js buildFingerprint): a flapping PDF error otherwise leaks
// into the stored baseline and would break the equality check if a
// future message rule ever compared at the object level.
function pickContent(payload) {
  if (!payload) return null;
  const {
    generatedAt,
    changeFingerprint,
    pdfStatus,
    _pdfDiagnosticInternal,
    ...rest
  } = payload;
  return rest;
}

function readStoredPayload(username) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(username));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    // Corrupt entry or storage access blocked — treat as no prior
    // baseline so the banner stays silent on the next compare.
    return null;
  }
}

function writeStoredPayload(username, content) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(username), JSON.stringify(content));
  } catch {
    // QuotaExceededError, private-mode blocks, etc. The hook still
    // returns the live data; we just lose the next-visit diff.
  }
}

/**
 * Client hook for `/api/experience-summary`.
 *
 * Fetches on mount, then re-fetches every `POLL_INTERVAL_MS` so a
 * long-open about page picks up GitHub repo changes (rename/create/
 * delete) and resume edits without a manual refresh.
 *
 * Diffs each response against the last payload stored in
 * `localStorage` so the banner can announce "Years of experience
 * updated: 4+ → 5+" only when the value actually moves between visits
 * (or polls). First-ever load has no baseline → no message; subsequent
 * loads / polls compare content fields (excluding generatedAt /
 * fingerprint) and surface the highest-priority change. After the
 * compare runs, the new payload becomes the stored baseline.
 *
 * @param {string} username
 * @returns {{
 *   data: object|null,
 *   isLoading: boolean,
 *   error: Error|null,
 *   changeMessage: string|null,
 *   changedCategories: string[],
 *   addedRepoNames: string[],
 *   addedRoleKeys: string[]
 * }}
 */
export function useExperienceSummary(username) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // `null` = no banner-worthy change to display (either first load or
  // current === last stored). Set to a human-readable sentence when a
  // meaningful diff is detected. Consumed by ExperienceUpdateBanner,
  // which manages its own one-shot-per-message display logic.
  const [changeMessage, setChangeMessage] = useState(null);
  // The split-bar categories ("Personal" / "Employment") whose underlying
  // experience grew this diff cycle — surfaced so the years card can heartbeat
  // exactly those legend entries (label + percentage). `[]` when nothing grew
  // or on first load, matching `changeMessage`'s null contract.
  const [changedCategories, setChangedCategories] = useState([]);
  // The exact repos / roles added this diff cycle, for the breakdown modal's
  // per-row heartbeat. `[]` when nothing was added or on first load.
  const [addedRepoNames, setAddedRepoNames] = useState([]);
  const [addedRoleKeys, setAddedRoleKeys] = useState([]);

  useEffect(() => {
    // Clear any message from a previous username on every effect
    // re-run, so a consumer can't briefly render a sentence that
    // belonged to the prior username (or to no username at all when
    // the caller has unset it). Per-poll clearing inside `fetchOnce`
    // handles the no-diff case; this clears the cross-username case.
    setChangeMessage(null);
    setChangedCategories([]);
    setAddedRepoNames([]);
    setAddedRoleKeys([]);

    if (!username) {
      setIsLoading(false);
      return;
    }

    // Instant-paint hydration. The hook already writes `pickContent`
    // to localStorage on every successful fetch (as the diff baseline);
    // reading it back here means returning visitors see the real value
    // on first paint instead of the "0 months of experience" placeholder
    // while the network round-trip completes. We keep the existing
    // fetchOnce below so the live payload still revalidates the cache,
    // and the change-message diff still works because it reads the same
    // stored baseline before overwriting it.
    //
    // Done inside the effect (not in `useState(() => ...)`) to avoid
    // an SSR/CSR hydration mismatch: the server has no localStorage,
    // so its initial render is `data: null`. Reading here lets the
    // client mount with `null`, match the server HTML, then immediately
    // upgrade to the cached value in the same tick.
    const cached = readStoredPayload(username);
    if (cached) {
      setData(cached);
      setIsLoading(false);
    }

    // Cancellation flag so a late response can't `setState` after the
    // component unmounts (or after a StrictMode double-mount). We
    // *don't* use a module/ref guard to dedupe across mounts — that
    // would skip the legitimate second mount entirely and leave the
    // component stranded with `data: null` (the first mount's response
    // was cancelled, the second never refetched). Letting both mounts
    // fetch is harmless: the browser/HTTP cache absorbs the duplicate
    // in dev, and StrictMode isn't active in production.
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const res = await fetch(
          `/api/experience-summary?username=${encodeURIComponent(username)}`,
        );
        if (!res.ok) {
          throw new Error(
            `experience-summary HTTP ${res.status} ${res.statusText}`,
          );
        }
        const payload = await res.json();
        if (cancelled) return;

        // Diff against stored baseline before updating storage —
        // otherwise the comparison would always see itself and never
        // produce a message. `pickContent` strips volatile fields so
        // identical content doesn't trip on `generatedAt` drift.
        const nextContent = pickContent(payload);
        const prevContent = readStoredPayload(username);
        const message = buildChangeMessage(prevContent, nextContent);
        // Always set the state to the current comparison result —
        // including `null` when there's no diff. The previous "only set
        // when truthy" path left a stale sentence on screen across
        // subsequent no-diff polls. ExperienceUpdateBanner dedupes its
        // one-shot display via sessionStorage, so writing `null` here
        // just means "no new banner-worthy change this poll".
        setChangeMessage(message);
        // Per-category attribution for the legend heartbeat — derived from the
        // same (prev, next) pair, so it stays in lockstep with the message.
        setChangedCategories(changedExperienceCategories(prevContent, nextContent));
        // Exact added repos / roles for the breakdown modal's per-row heartbeat.
        const added = addedExperienceItems(prevContent, nextContent);
        setAddedRepoNames(added.repoNames);
        setAddedRoleKeys(added.roleKeys);
        writeStoredPayload(username, nextContent);

        setData(payload);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // Log but don't throw — the about page should still render with
        // its other cards even when this endpoint is degraded.
        console.warn("useExperienceSummary fetch failed:", err);
        setError(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchOnce();
    const intervalId = setInterval(fetchOnce, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [username]);

  return {
    data,
    isLoading,
    error,
    changeMessage,
    changedCategories,
    addedRepoNames,
    addedRoleKeys,
  };
}
