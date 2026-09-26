// The consent record's storage layer (issue #141) — read, write, and above all
// PARSE, as pure functions with no React and no `window` in their signatures.
//
// ── Why this is not just three lines inside the provider ────────────────────
// Because the parse is the part that can be wrong, and it is the part that
// cannot be tested through a component. What arrives from `localStorage` is a
// string from an untrusted source — a previous version of this site, a
// half-finished write, a person editing devtools, an extension — and every
// branch of "what if that string is nonsense" has a correct answer that matters:
// a record this module misreads as `granted` starts three analytics scripts for
// somebody who never agreed to them.
//
// Split out, every one of those branches is a one-line unit test over a string
// literal (tests/unit/consentStore.test.js). Folded into the provider they would
// need jsdom, a render, and a mocked storage object to reach, which is the
// difference between the branches being tested and being assumed.
//
// ── The one rule the whole file serves ──────────────────────────────────────
// ANY input that is not an affirmative, current, well-formed grant resolves to
// `undecided`. Not `denied` — undecided, because the two are different states
// (see STATUS below) and reading a corrupt record as a refusal would silently
// stop ever asking the person again.

import { CONSENT_KEY, CONSENT_VERSION } from './inventory';

/**
 * The three states, and why there are three.
 *
 * `undecided` is not a synonym for `denied`, and collapsing them is the mistake
 * this constant exists to prevent. They differ in the only way that matters:
 *
 *   • Both send nothing. Identical behaviour, so a two-state boolean "looks
 *     fine" in the network panel and stays fine for as long as nobody checks.
 *   • Only `undecided` shows the notice. So a bug that maps a refusal to
 *     `undecided` re-asks somebody who already said no, on every single visit —
 *     which is precisely the nagging that makes people click Accept to make a
 *     site shut up, and would turn a working consent gate into a coercive one.
 *
 * `undecided` is also the SSR default. The server cannot know a decision, so
 * the first paint is always the pre-decision state on both sides of hydration.
 */
export const STATUS = Object.freeze({
  UNDECIDED: 'undecided',
  GRANTED: 'granted',
  DENIED: 'denied',
});

/** What every unreadable, absent or stale record resolves to. */
const UNDECIDED = Object.freeze({
  status: STATUS.UNDECIDED,
  analytics: false,
  decidedAt: null,
});

/**
 * Turn a stored string into a decision.
 *
 * Total: every input has an answer and this never throws. Exported for its own
 * tests, which is most of the point of the file — the interesting inputs
 * (`null`, `'{'`, `'{"version":0,"analytics":true}'`, `'"granted"'`) are
 * one-liners here and a mocking exercise anywhere else.
 *
 * ── Why a version mismatch is `undecided` and not a migration ───────────────
 * It is the entire reason the record carries a version. The stored value is an
 * answer to a QUESTION — the disclosure the visitor was shown when they
 * answered — so once that disclosure materially changes, the old answer is no
 * longer an answer to the question now being asked. Migrating a `v1` grant
 * forward would be asserting agreement to terms the person never saw.
 *
 * It is deliberately asymmetric: a mismatch re-prompts rather than opting the
 * person in or out, so bumping `CONSENT_VERSION` can never silently grant and
 * can never silently deny. It is the one change in this system whose blast
 * radius is "everyone gets asked again", which is the only safe direction.
 *
 * @param {unknown} raw The string from storage, or null when absent.
 * @returns {{status: string, analytics: boolean, decidedAt: string|null}}
 */
export function parseConsent(raw) {
  if (typeof raw !== 'string' || raw === '') return UNDECIDED;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Truncated, hand-edited, or written by something that is not this module.
    return UNDECIDED;
  }

  // `typeof null === 'object'`, and an array would index without throwing —
  // both have to be excluded explicitly or a stored `'null'` / `'[]'` reaches
  // the field reads below. A bare `'"granted"'` is caught here too: a string is
  // not an object, so it never gets the chance to look like a status.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return UNDECIDED;
  }

  // Strict equality on a number, not `==` and not a parsed string. A record
  // whose version arrived as `'1'` was not written by this module, and treating
  // it as v1 would be trusting an unknown writer's schema.
  if (parsed.version !== CONSENT_VERSION) return UNDECIDED;

  // `=== true`, never truthiness. `analytics: 'false'` and `analytics: 1` are
  // both shapes this module never writes, so they are evidence of a foreign
  // writer rather than values to coerce — and truthiness would read the string
  // `'false'` as consent, which is the worst available failure.
  if (parsed.analytics !== true && parsed.analytics !== false) return UNDECIDED;

  return {
    status: parsed.analytics ? STATUS.GRANTED : STATUS.DENIED,
    analytics: parsed.analytics,
    // Informational only — shown on /privacy so a person can see when they
    // decided. Never load-bearing, so a missing or malformed value degrades to
    // null instead of invalidating an otherwise valid decision: the visitor's
    // answer is the part that matters and the timestamp is a courtesy.
    decidedAt: typeof parsed.decidedAt === 'string' ? parsed.decidedAt : null,
  };
}

/**
 * Read the stored decision.
 *
 * Returns `undecided` when storage is unavailable — Safari private mode throws
 * on access rather than returning null, and a fork served from a `file://` URL
 * has no storage at all. Both are supported states, and both mean "no decision
 * is on record", which is exactly `undecided`. The site still works; it just
 * asks again, which is the correct behaviour when it genuinely cannot remember.
 *
 * MUST NOT be called during render — see ConsentProvider. It is safe to call
 * (it returns `undecided` on the server), and calling it in a render would
 * still produce a server/client mismatch the moment a real record existed.
 */
export function readConsent() {
  if (typeof window === 'undefined') return UNDECIDED;
  try {
    return parseConsent(window.localStorage.getItem(CONSENT_KEY));
  } catch {
    return UNDECIDED;
  }
}

/**
 * Record a decision. Returns the decision as the app should now see it, so a
 * caller never has to re-read storage to find out what it just wrote — which
 * matters because the write can fail while the decision still has to be honoured
 * for this session.
 *
 * A blocked write (quota, private mode) is NOT an error the visitor should see.
 * They answered a question; the answer applies now. The only thing lost is that
 * it will be asked again next visit, and re-asking is a far better failure than
 * refusing to act on what someone just clicked.
 *
 * @param {boolean} analytics Whether analytics are allowed.
 */
export function writeConsent(analytics) {
  const decidedAt = new Date().toISOString();
  const record = {
    version: CONSENT_VERSION,
    analytics: analytics === true,
    decidedAt,
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
    } catch {
      // See above: in-memory state is still authoritative for this session.
    }
  }

  return {
    status: record.analytics ? STATUS.GRANTED : STATUS.DENIED,
    analytics: record.analytics,
    decidedAt,
  };
}

/**
 * Forget the decision entirely, returning the visitor to `undecided`.
 *
 * Distinct from `writeConsent(false)`, and the distinction is the reason this
 * exists: denying is an ANSWER and is remembered, while clearing is "pretend I
 * was never asked" and brings the notice back. Only the debugging path and a
 * future `CONSENT_VERSION` bump need it; the UI's Decline button writes a real
 * refusal, because a refusal that re-prompts tomorrow is not a refusal.
 */
export function clearConsent() {
  if (typeof window === 'undefined') return UNDECIDED;
  try {
    window.localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* nothing to clear if storage is unreachable */
  }
  return UNDECIDED;
}
