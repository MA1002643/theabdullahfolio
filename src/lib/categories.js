/**
 * Canonicalise a category / sub-category label from a data file: trimmed,
 * first letter upper-cased, rest lower-cased — so `"web"`, `"Web"` and
 * `"WEB "` all fold into one "Web" tab instead of minting lookalikes.
 *
 * Shared by the /projects list and the /qualifications carousel, whose
 * filter tabs are both DERIVED from their data (issue #27): the tab
 * derivation, the per-tab counts, and the filter comparisons must all pass
 * labels through the SAME fold, or a typo'd entry silently falls out of the
 * tab it visually belongs to.
 *
 * Empty / missing labels return "" — callers skip those.
 */

// Acronym labels the default fold would mangle ("AI" → "Ai"). Keyed by the
// lowercased label so every authored variant ("ai", "AI", "Ai ") lands on
// the one display form — the same no-lookalikes guarantee as the fold.
// A Map, not an object literal: bare-object indexing also reads inherited
// keys, so a "constructor" / "__proto__" label would return a non-string.
const ACRONYMS = new Map([["ai", "AI"]]);

export const normalizeCategory = (raw) => {
  const label = String(raw ?? "").trim();
  if (!label) return "";
  return (
    ACRONYMS.get(label.toLowerCase()) ??
    label[0].toUpperCase() + label.slice(1).toLowerCase()
  );
};

// Warm palette for project-category encodings, drawn from the same 5-tone
// scheme the years card uses (vivid orange → golds). Index 0/1 are the exact
// two colours of the years card's Personal/Employment segments, so a
// two-category split reads as the same visual system; extra categories fall
// back to the cooler golds further down the palette. Lives here (not in
// about/index.jsx, its original home) because the Project Progress popup
// (issue #48) colour-codes the SAME categories — one shared constant means
// the card's split bar and the popup's breakdown can never drift apart.
// Assign by the breakdown's count-desc order so the largest category always
// leads with the lead colour.
export const PROJECT_CATEGORY_COLORS = [
  "#ff6d05",
  "#ffd27d",
  "#ffaa2a",
  "#d4af7a",
  "#b8946a",
];
