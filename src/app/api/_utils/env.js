// Shared env-parsing helpers for the API route surface. Centralized here so the
// finite-positive validation used by every timeout / budget knob stays in
// lockstep across routes — historically /api/experience-summary,
// /api/repo-refresh, /api/github-stats, /api/github-skills and /api/project-repo
// each carried their own identical copy, a known drift hazard (one route
// updated, the rest forgotten). Folder is `_utils` so Next.js's underscore-
// prefix convention excludes it from routing.

/**
 * Parse an env value as a number, accepting it only when finite AND positive.
 *
 * A plain `Number(env) || fallback` is NOT sufficient: it only rejects the
 * falsy results (0, NaN), so a NEGATIVE value slips through — forcing immediate
 * aborts / instant budget exhaustion at every call — and `Infinity` slips
 * through, disabling the timeout / cap entirely. Anything that isn't a finite
 * positive number (missing, NaN, <= 0, Infinity) falls back to `fallback`.
 *
 * @param {string | number | undefined} envValue - raw env value, e.g. `process.env.X`
 * @param {number} fallback - default used when `envValue` isn't a finite positive number
 * @returns {number} the parsed value, or `fallback`
 */
export function envPositiveMs(envValue, fallback) {
  const n = Number(envValue);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
