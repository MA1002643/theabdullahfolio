// Centralized allowlist for filtering employment roles down to those that
// count as "software-engineering experience." Used by the resume parser to
// drop unrelated roles (e.g. "Security Officer", retail shifts) before
// aggregating months. Substring match is case-insensitive and runs against
// the role title only — the company name and bullet text are ignored.
//
// Keep entries lowercase. Order doesn't matter; `isSoftwareRole` exits on
// the first hit. Add new keywords here rather than in callers so the
// filter stays consistent across the API route, the parser, and any
// future debug tooling.
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

export function isSoftwareRole(title) {
  if (typeof title !== "string" || title.length === 0) return false;
  const t = title.toLowerCase();
  for (const kw of SOFTWARE_ROLE_KEYWORDS) {
    if (t.includes(kw)) return true;
  }
  return false;
}
