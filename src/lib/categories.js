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
export const normalizeCategory = (raw) => {
  const label = String(raw ?? "").trim();
  if (!label) return "";
  return label[0].toUpperCase() + label.slice(1).toLowerCase();
};
