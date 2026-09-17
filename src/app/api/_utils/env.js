// Shared env-parsing helpers for the API route surface. Centralized here so the
// finite-positive validation used by every timeout / budget knob stays in
// lockstep across routes — historically /api/experience-summary,
// /api/repo-refresh, /api/github-stats, /api/github-skills and /api/project-repo
// each carried their own identical copy, a known drift hazard (one route
// updated, the rest forgotten). Folder is `_utils` so Next.js's underscore-
// prefix convention excludes it from routing.

// The widest delay every timer API here accepts. `AbortSignal.timeout` tops out
// at 2^32-1 and `setTimeout` at 2^31-1, so the SMALLER is the portable ceiling —
// and the two fail differently, which is why this is a clamp and not a check.
// Past its limit `AbortSignal.timeout` throws `ERR_OUT_OF_RANGE`, while
// `setTimeout` warns (`TimeoutOverflowWarning`) and fires after **1ms** — so an
// oversized GitHub timeout does not disable the bound, it makes every call abort
// almost immediately. About 24.8 days; nothing here is a timeout in any sense.
const MAX_TIMER_MS = 2147483647;

/**
 * Parse an env value as a millisecond delay a timer API will actually accept.
 *
 * A plain `Number(env) || fallback` is NOT sufficient: it only rejects the
 * falsy results (0, NaN), so a NEGATIVE value slips through — forcing immediate
 * aborts / instant budget exhaustion at every call — and `Infinity` slips
 * through, disabling the timeout / cap entirely. Anything that isn't a finite
 * positive number (missing, NaN, <= 0, Infinity) falls back to `fallback`.
 *
 * ── Finite and positive is not yet USABLE ───────────────────────────────────
 * Two finite positive values still break a timer, and both arrive the same way
 * a negative does — someone typing a number into an env var:
 *
 *   • A DECIMAL. `AbortSignal.timeout(1000.5)` throws `ERR_OUT_OF_RANGE`
 *     ("must be an integer") on Node 24, which `package.json` engines allow.
 *     Two routes build their deadline that way, and in /api/daily-warmup the
 *     signal is created inside the handler — so a stray `.5` in
 *     `CRON_RUN_BUDGET_MS` turns the run budget into an exception, and the cron
 *     dies with no body and no per-step results. That is the precise failure
 *     the budget was added to prevent, delivered by the knob that tunes it.
 *
 *   • A value past `MAX_TIMER_MS`, which is the same shape as the `Infinity`
 *     case this function already refuses — `1e10` is finite and positive and
 *     just as unusable.
 *
 * So the value is rounded to a whole millisecond and held inside the range
 * every timer here accepts. `Math.max(1, …)` matters more than it looks: a
 * value under half a millisecond would otherwise round to 0, and a 0ms deadline
 * aborts everything instantly — reintroducing, through the normalisation, the
 * exact failure the `n > 0` check above exists to prevent.
 *
 * Normalising HERE rather than at the two `AbortSignal.timeout` call sites is
 * the same argument that collected this helper in the first place: every knob
 * that reads a millisecond from the environment gets one definition of what a
 * usable millisecond is, and the next route to adopt a bounded signal inherits
 * it instead of rediscovering it. Sub-millisecond precision is meaningless for
 * all thirteen knobs, so nothing that currently calls `setTimeout` changes
 * behaviour.
 *
 * @param {string | number | undefined} envValue - raw env value, e.g. `process.env.X`
 * @param {number} fallback - default used when `envValue` isn't a finite positive number
 * @returns {number} a whole number of milliseconds in `[1, MAX_TIMER_MS]`
 */
export function envPositiveMs(envValue, fallback) {
  const n = Number(envValue);
  const chosen = Number.isFinite(n) && n > 0 ? n : fallback;
  return Math.min(Math.max(1, Math.round(chosen)), MAX_TIMER_MS);
}
