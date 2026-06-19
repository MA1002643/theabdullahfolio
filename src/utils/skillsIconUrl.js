// Client-safe skills helpers — the SMALL surface that UI components need, kept
// free of the heavy detection machinery so it can be bundled into the client
// WITHOUT dragging the ~3.4k-slug Simple Icons catalog (`simpleIconsSlugs.js`)
// or the SKILL_MAP build along with it.
//
// The detection / resolution side (the curated SKILLS table, SKILL_MAP, the
// Simple Icons fallback catalog, `resolveSkill` / `categorizeSkills*`) lives in
// `skillsIconMap.js` and is imported ONLY by the server route
// (/api/github-skills). Anything a client component ("use client") needs should
// come from HERE, never from skillsIconMap — otherwise the catalog ends up in
// the About-page payload for nothing.
//
// Pure + framework-agnostic (no Node/Next imports), so it's safe on both sides.

// Ordering only — categories are NEVER shown as headings (issue #20, Task 3).
// The grid renders groups in this sequence with an invisible row-break between
// them so alignment resets cleanly without a visible label. `skillsIconMap` also
// imports this (single source of truth) to build SKILL_MAP and bucket detections.
export const CATEGORY_ORDER = ["languages", "frameworks", "libraries", "tools", "software"];

// The empty category shape — every category present, all empty. Replaces a
// client-side `categorizeSkills([])` call: that only ever built this object (the
// detection path is never reached for an empty input), but importing it pulled
// the whole heavy module into the client bundle. Derived from CATEGORY_ORDER so
// the client never touches the catalog.
export function emptyCategories() {
  return Object.fromEntries(CATEGORY_ORDER.map((c) => [c, []]));
}

/**
 * Build the icon URL for a slug from the chosen CDN. skillicons.dev is the
 * preferred illustrated style; simpleicons / devicon are fallbacks for tools
 * skillicons doesn't carry. All three render through the same <img> with
 * identical sizing, so colour may differ but layout never does.
 *
 * @param {string} slug
 * @param {"skillicons"|"simpleicons"|"devicon"} [source="skillicons"]
 * @returns {string}
 */
export function getIconUrl(slug, source = "skillicons") {
  // Defensive only: every slug we emit is already [a-z0-9] (curated short names
  // + the Simple Icons fallback's `replace(/[^a-z0-9]/g, "")`), so this is a
  // no-op for current inputs. It just keeps the URL well-formed if a future
  // caller ever passes a slug containing reserved characters.
  const encoded = encodeURIComponent(slug);
  if (source === "simpleicons") return `https://cdn.simpleicons.org/${encoded}`;
  if (source === "devicon") {
    return `https://raw.githubusercontent.com/devicons/devicon/master/icons/${encoded}/${encoded}-original.svg`;
  }
  // skillicons (default + safe fallback for an unknown source value)
  return `https://skillicons.dev/icons?i=${encoded}`;
}
