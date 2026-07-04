// Skills diffing + fingerprinting for the About-page skills grid (issue #20).
//
// Pure, framework-agnostic JS — the mirror of `languageDiff.js`/`streakDiff.js`.
// The fingerprint is computed CLIENT-side: `useSkillsUpdateSignal` derives it
// from the rendered skill set to decide whether the "skills changed" banner
// appears since this device last visited, so the banner is per-visitor and can
// never drift from a server field.
//
// Functions operate on a FLAT skill list — `{ slug, displayName, category }` —
// which `flattenCategories` produces from the `{ languages, frameworks, ... }`
// category shape the API and SkillsCard pass around.

import { CATEGORY_ORDER } from "./skillsIconUrl";

/**
 * Flatten the category map into one ordered list. Categories are walked in
 * CATEGORY_ORDER and items kept in their in-category order, so the flattened
 * sequence is deterministic — which is what makes the fingerprint stable and
 * lets a pure add/remove be told apart from a reorder.
 *
 * Each flat item also carries the skill's per-repo usage data — public repo
 * names (`repos`, already server-sorted) and the bare `privateRepoCount` — so
 * the update signal can detect COUNT/list changes on an existing icon (a new
 * repo using the skill) and heartbeat it, not just presence/category changes.
 *
 * @param {Record<string, Array<{ slug: string, displayName: string, repos?: Array<{nameWithOwner?: string, name?: string}>, privateRepoCount?: number }>>} categories
 * @returns {Array<{ slug: string, displayName: string, category: string, repos: string[], privateRepoCount: number }>}
 */
export function flattenCategories(categories) {
  if (!categories || typeof categories !== "object") return [];
  const flat = [];
  for (const category of CATEGORY_ORDER) {
    const items = categories[category];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item.slug !== "string") continue;
      flat.push({
        slug: item.slug,
        displayName: typeof item.displayName === "string" ? item.displayName : item.slug,
        category,
        repos: Array.isArray(item.repos)
          ? item.repos.map((r) => r?.nameWithOwner || r?.name || "").filter(Boolean)
          : [],
        privateRepoCount: Number.isFinite(item.privateRepoCount) ? item.privateRepoCount : 0,
      });
    }
  }
  return flat;
}

/**
 * Stable fingerprint of a flat skill list — the ordered, pipe-joined
 * `slug:category` pairs. Identity is each skill's slug AND its category in
 * render order: a hover-label rename without a slug change won't register (the
 * icon is the same), but an add, a removal, a reorder, OR a category move (same
 * icon, different bucket) will — which is what lets the banner report moves.
 * Returns "" for an empty/invalid list so the signal hook can treat "nothing to
 * compare yet" uniformly.
 *
 * @param {Array<{ slug: string, category?: string }>} skills
 * @returns {string}
 */
export function skillsFingerprint(skills) {
  if (!Array.isArray(skills) || skills.length === 0) return "";
  return skills.map((s) => `${s?.slug ?? ""}:${s?.category ?? ""}`).join("|");
}

/**
 * Data-level fingerprint — the structural pair PLUS each skill's repo usage
 * (public repo names and private count). Registers everything the structural
 * fingerprint does AND a repo starting/stopping to use an existing skill, which
 * is what drives the per-icon "data updated" heartbeat. Kept SEPARATE from
 * `skillsFingerprint` on purpose: the banner diffs presence/category only, and
 * folding counts into its fingerprint would fire a banner with nothing to say.
 * Deterministic for a given payload (repos arrive server-sorted, flatten order
 * is CATEGORY_ORDER).
 *
 * @param {Array<{ slug: string, category?: string, repos?: string[], privateRepoCount?: number }>} skills
 * @returns {string}
 */
export function skillsDataFingerprint(skills) {
  if (!Array.isArray(skills) || skills.length === 0) return "";
  return skills
    .map(
      (s) =>
        `${s?.slug ?? ""}:${s?.category ?? ""}:${(Array.isArray(s?.repos) ? s.repos : []).join(",")}:${
          Number.isFinite(s?.privateRepoCount) ? s.privateRepoCount : 0
        }`,
    )
    .join("|");
}

/**
 * Skills present in BOTH lists whose repo usage changed — the public repo list
 * (by content: both sides are sorted before comparing, so ordering — the
 * server's, or a future change to it — can never read as a usage change) or
 * the private count. These get the icon heartbeat WITHOUT a banner entry (the banner
 * vocabulary is Added/Removed/Moved; a count change isn't any of those).
 * Baseline items saved before repo data existed (no `repos`/`privateRepoCount`
 * fields) are skipped — "unknown" must not read as "changed", or the first
 * visit after deploy would pulse every icon at once.
 *
 * @param {Array<{ slug: string, category?: string, repos?: string[], privateRepoCount?: number }>} prev
 * @param {Array<{ slug: string, category?: string, repos?: string[], privateRepoCount?: number }>} next
 * @returns {Array<{ slug: string, category: string|null }>}
 */
export function diffSkillData(prev, next) {
  const hasSlug = (s) => s != null && typeof s.slug === "string" && s.slug.length > 0;
  const prevBySlug = new Map(
    (Array.isArray(prev) ? prev : []).filter(hasSlug).map((s) => [s.slug, s]),
  );
  const changed = [];
  for (const s of Array.isArray(next) ? next : []) {
    if (!hasSlug(s)) continue;
    const before = prevBySlug.get(s.slug);
    if (!before) continue; // brand-new skill — that's `added`, not `changed`
    if (!Array.isArray(before.repos) || !Number.isFinite(before.privateRepoCount)) continue;
    // Sort copies before joining: repos arrive server-sorted today, but the
    // baseline was saved under an older deploy — canonicalising here keeps a
    // server-side ordering change from pulsing every icon at once.
    const sortedJoin = (list) => [...list].sort().join(",");
    const reposChanged =
      sortedJoin(before.repos) !== sortedJoin(Array.isArray(s.repos) ? s.repos : []);
    const privateChanged =
      before.privateRepoCount !== (Number.isFinite(s.privateRepoCount) ? s.privateRepoCount : 0);
    if (reposChanged || privateChanged) changed.push({ slug: s.slug, category: s.category ?? null });
  }
  return changed;
}

/**
 * Diff a previously-seen flat skill list against the latest one, by slug. Reports
 * three kinds of change:
 *   - `added`   — slug present only in next, as `{ slug, name, category }` (added TO)
 *   - `removed` — slug present only in prev, as `{ name, category }` (removed FROM)
 *   - `moved`   — slug in BOTH but its category changed, as `{ name, from, to }`
 * plus a convenience `hasChanges`. Pure reorders within a category are ignored —
 * for an icon grid only presence and bucket matter.
 *
 * @param {Array<{ slug: string, displayName: string, category: string }>} prev
 * @param {Array<{ slug: string, displayName: string, category: string }>} next
 * @returns {{ added: Array<{ slug: string, name: string, category: string|null }>, removed: Array<{ name: string, category: string|null }>, moved: Array<{ name: string, from: string, to: string }>, hasChanges: boolean }}
 */
export function diffSkills(prev, next) {
  // `prev` arrives from localStorage and the read-side validator
  // (`skillsFingerprint`, in useSkillsUpdateSignal) keys on `s?.slug ?? ""`, so a
  // hand-edited-but-fingerprint-consistent baseline can carry null items or
  // non-string/empty slugs. Drop anything without a real string slug up front:
  // otherwise a null item throws on the `.slug` map below, and an
  // `undefined`/numeric/`""` slug propagates through the Sets/Maps into the diff
  // output (phantom added/removed entries, an `undefined` heartbeat key).
  const hasSlug = (s) => s != null && typeof s.slug === "string" && s.slug.length > 0;
  const prevList = (Array.isArray(prev) ? prev : []).filter(hasSlug);
  const nextList = (Array.isArray(next) ? next : []).filter(hasSlug);

  const prevSlugs = new Set(prevList.map((s) => s.slug));
  const nextSlugs = new Set(nextList.map((s) => s.slug));
  const nameFor = new Map(
    [...prevList, ...nextList].map((s) => [s.slug, s.displayName ?? s.slug]),
  );
  const prevCat = new Map(prevList.map((s) => [s.slug, s.category ?? null]));
  const nextCat = new Map(nextList.map((s) => [s.slug, s.category ?? null]));

  const added = [...nextSlugs]
    .filter((slug) => !prevSlugs.has(slug))
    .map((slug) => ({ slug, name: nameFor.get(slug), category: nextCat.get(slug) ?? null }));
  const removed = [...prevSlugs]
    .filter((slug) => !nextSlugs.has(slug))
    .map((slug) => ({ name: nameFor.get(slug), category: prevCat.get(slug) ?? null }));
  // Same icon, different bucket. Both categories must be known (a legacy baseline
  // saved without a category can't be classified as a move — skip it).
  const moved = [...nextSlugs]
    .filter((slug) => prevSlugs.has(slug))
    .filter((slug) => {
      const from = prevCat.get(slug);
      const to = nextCat.get(slug);
      return from != null && to != null && from !== to;
    })
    .map((slug) => ({ name: nameFor.get(slug), from: prevCat.get(slug), to: nextCat.get(slug) }));

  return {
    added,
    removed,
    moved,
    hasChanges: added.length > 0 || removed.length > 0 || moved.length > 0,
  };
}

// Title-case a category slug ("languages" → "Languages") for the banner. All
// CATEGORY_ORDER values are single lowercase words, so capitalising the first
// letter is sufficient. Returns null for a missing/invalid category so the entry
// falls back to just its name.
function categoryLabel(category) {
  if (typeof category !== "string" || category.length === 0) return null;
  return category.charAt(0).toUpperCase() + category.slice(1);
}

// One added/removed entry → "Name (Category)", or just "Name" if the category
// is unknown (e.g. a legacy baseline saved without one).
function formatEntry(entry) {
  if (!entry || typeof entry !== "object") return String(entry ?? "");
  const label = categoryLabel(entry.category);
  return label ? `${entry.name} (${label})` : entry.name;
}

// One moved entry → "Name (From → To)", or just "Name" if either label is
// missing (shouldn't happen — diffSkills only emits moves with both known).
function formatMove(entry) {
  if (!entry || typeof entry !== "object") return String(entry ?? "");
  const from = categoryLabel(entry.from);
  const to = categoryLabel(entry.to);
  return from && to ? `${entry.name} (${from} → ${to})` : entry.name;
}

/**
 * Render a diff into the exact-changes banner copy (issue #20, acceptance #14).
 * Added/removed icons show their name + the category they entered/left; moved
 * icons show the category transition, e.g.
 *   `"Added: Rust (Languages) · Removed: Replit (Software) · Moved: Vercel (Tools → Software)"`.
 * Returns null when nothing changed so the caller can suppress the banner.
 *
 * @param {{ added?: Array<{ name: string, category: string|null }>, removed?: Array<{ name: string, category: string|null }>, moved?: Array<{ name: string, from: string, to: string }> }} diff
 * @returns {string|null}
 */
export function buildBannerMessage({ added = [], removed = [], moved = [] } = {}) {
  const parts = [];
  if (added.length > 0) parts.push(`Added: ${added.map(formatEntry).join(", ")}`);
  if (removed.length > 0) parts.push(`Removed: ${removed.map(formatEntry).join(", ")}`);
  if (moved.length > 0) parts.push(`Moved: ${moved.map(formatMove).join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
