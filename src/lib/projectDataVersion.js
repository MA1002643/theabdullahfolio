import { projectsData } from "@/app/data";

/**
 * Fingerprint of the projectsData fields the Project Progress popup's
 * payload is derived from (issue #48). Shared by BOTH halves of the sync
 * loop so neither cache layer can outlive a data.js edit:
 *
 *   - /api/project-progress mixes it into its unstable_cache key, so adding,
 *     removing or re-categorising a project mints a NEW cache entry — the
 *     12 h TTL stops pinning a payload built from the previous project list.
 *   - useProjectProgress stamps/compares it against the localStorage
 *     last-good, so a snapshot persisted before a data.js change is
 *     discarded instead of hydrating a stale project list on every visit.
 *
 * The `length-` prefix keeps the common change (a project added) readable in
 * cache keys and payloads; the hash catches renames, category moves and repo
 * swaps that leave the count unchanged.
 */

// djb2 — tiny, dependency-free, deterministic across server and client.
// Collision resistance is irrelevant here: versions only ever compare
// against the previous fingerprint, not against an open set.
const djb2 = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
};

export const PROJECT_DATA_VERSION = `${projectsData.length}-${djb2(
  projectsData
    .map((p) => [p.id, p.name, p.category, p.repo ?? "", p.private ? 1 : 0].join(":"))
    .join("|"),
)}`;
