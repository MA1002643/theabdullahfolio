// Centralized allowlist for filtering employment roles down to those that
// count as "software-engineering experience." Used by the resume parser to
// drop unrelated roles (e.g. "Security Officer", retail shifts) before
// aggregating months.
//
// Matching is case-insensitive and *word-boundary aware on the leading
// edge* — a plain substring match would let short abbreviations like
// "ml" and "sre" false-positive against unrelated tokens ("HTML",
// "XML", "presale"). Boundary-on-the-left + free-form right side keeps
// the inflected forms working (e.g. the keyword "engineer" still
// matches "engineering" and "engineers", and "developer" matches
// "developers"), while rejecting mid-word collisions.
//
// Keep entries lowercase. Order doesn't matter; `isSoftwareRole` exits
// on the first hit. Add new keywords here rather than in callers so
// the filter stays consistent across the API route, the parser, and
// any future debug tooling.
export const SOFTWARE_ROLE_KEYWORDS = Object.freeze([
  "software",
  "engineer",
  "developer",
  "full stack",
  "fullstack",
  "frontend",
  "backend",
  "devops",
  "platform",
  "sre",
  "site reliability",
  "cloud",
  "data engineer",
  "ml",
  "machine learning",
]);

// Escape regex metacharacters so a keyword containing one (e.g. a
// future ".net" or "C++") doesn't blow up the compiled regex. None of
// the current entries trigger any escape, but the future-proofing is
// nearly free.
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Precompile one regex per keyword. The left anchor is `(?:^|\W)` —
// start-of-string OR any non-word char — rather than `\b`. `\b` only
// fires on the seam between a word and a non-word character, which
// silently fails for keywords that themselves start with a non-word
// char: e.g. for ".net", `\b\.net` would require a word char immediately
// before the `.`, which is the opposite of what we need to match
// ".NET Developer" at the start of a title or after a space. This
// form rejects the original `"ml"` false-positives ("HTML developer"
// has `t` — a word char — before "ml", so `\W` doesn't match) AND
// will correctly match a future ".net"-style keyword once added.
// The right side stays unbounded so "engineer" still matches
// "engineer" / "engineering" / "engineers" without each variant being
// added to the list. Building regexes at module load keeps
// `isSoftwareRole` allocation-free.
const KEYWORD_REGEXES = SOFTWARE_ROLE_KEYWORDS.map(
  (kw) => new RegExp(`(?:^|\\W)${escapeRegex(kw)}`, "i"),
);

export function isSoftwareRole(title) {
  if (typeof title !== "string" || title.length === 0) return false;
  for (const re of KEYWORD_REGEXES) {
    if (re.test(title)) return true;
  }
  return false;
}
