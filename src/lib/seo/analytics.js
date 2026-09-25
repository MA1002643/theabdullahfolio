// GA4 event taxonomy and a typed emitter (issue #32, W4).
//
// ── READ THIS FIRST: GA4 IS NOT MOUNTED ─────────────────────────────────────
// No tag is loaded anywhere in this codebase, and `trackEvent` below is a
// deliberate no-op until one is. That is not an oversight — it is a hard
// dependency on #141 (privacy notice & consent gating), which is still open.
// Analytics must not fire before consent exists, and inventing a consent
// primitive here would build a throwaway surface on that issue's turf and risk
// getting the gate wrong.
//
// What lands now is the half of W4 that is safe and that #141 should not have to
// re-derive:
//
//   1. `https://www.googletagmanager.com` in `script-src` (next.config.mjs).
//      This is F4, the issue's most dangerous finding: without it, dropping in
//      <GoogleAnalytics /> yields a page that looks completely healthy, sends
//      zero hits, and logs no error. Pinned by tests/unit/cspAnalytics.test.js.
//   2. The frozen event map below, so the taxonomy is reviewed as data rather
//      than accreted as string literals across twelve call sites.
//   3. `trackEvent`, so no call site ever passes a free-form string.
//
// ── What #141 has to do to switch this on ───────────────────────────────────
// Exactly two things, both outside this file:
//   • Mount GA4 (`@next/third-parties/google`) only AFTER consent is granted,
//     with Consent Mode v2 defaults (`analytics_storage: 'denied'`,
//     `ad_storage: 'denied'`) set BEFORE any tag loads, and
//     `gtag('consent', 'update', …)` on grant.
//   • Set `NEXT_PUBLIC_GA_MEASUREMENT_ID`.
// Nothing in this module changes. `trackEvent` starts working the moment a
// `gtag` exists on `window`, because that is the only thing it checks.
//
// ── Why a frozen map instead of string literals ─────────────────────────────
// GA4 creates an event the first time it sees its name. There is no schema and
// no validation: a typo does not error, it silently registers a NEW event that
// collects a trickle of traffic while the one you meant stays at zero. By the
// time anyone notices, the comparison window is gone. Every name a call site
// can pass therefore has to come from here.

/**
 * Every event this site is allowed to send.
 *
 * Frozen so a call site cannot add a key at runtime — which would defeat the
 * point, since the whole guarantee is that the set is knowable by reading this
 * file. The taxonomy is specific to THIS site (the refine feature, the
 * guestbook, the command palette, the footer audio); it is deliberately not a
 * generic template, because a generic template measures nothing anyone here
 * would act on.
 *
 * Keys are the identifiers call sites import. Values are the wire names, in
 * GA4's `snake_case` convention.
 */
export const EVENTS = Object.freeze({
  PROJECT_OPEN: 'project_open',
  DEMO_CLICK: 'demo_click',
  REPO_CLICK: 'repo_click',
  CV_DOWNLOAD: 'cv_download',
  CONTACT_SUBMIT: 'contact_submit',
  CONTACT_SUCCESS: 'contact_submit_success',
  CONTACT_ERROR: 'contact_submit_error',
  REFINE_USED: 'refine_used',
  GUESTBOOK_SIGN: 'guestbook_sign',
  PALETTE_OPEN: 'palette_open',
  USES_LINK_OUT: 'uses_link_out',
  SOUND_TOGGLE: 'sound_toggle',
  SCROLL_DEPTH: 'scroll_depth',
});

// The wire names, as a Set, for the O(1) membership check in `trackEvent` and
// for the unit test that asserts no two keys share a name — a copy-paste
// duplicate would make two call sites indistinguishable in the reports.
const EVENT_NAMES = new Set(Object.values(EVENTS));

/**
 * The parameters each event is expected to carry.
 *
 * Documentation with teeth: `trackEvent` warns in development when a required
 * parameter is missing, which is the only moment anyone is looking. It does NOT
 * throw and does not drop the event — a missing dimension is worth less than
 * the event itself, and an analytics call must never be able to break a user
 * interaction.
 */
export const EVENT_PARAMS = Object.freeze({
  [EVENTS.PROJECT_OPEN]: ['project_id', 'project_name', 'category'],
  [EVENTS.DEMO_CLICK]: ['project_name', 'destination'],
  [EVENTS.REPO_CLICK]: ['project_name', 'repo'],
  [EVENTS.CV_DOWNLOAD]: ['source_route'],
  [EVENTS.CONTACT_SUBMIT]: [],
  [EVENTS.CONTACT_SUCCESS]: [],
  [EVENTS.CONTACT_ERROR]: ['error_code'],
  [EVENTS.REFINE_USED]: ['mode', 'length_delta'],
  [EVENTS.GUESTBOOK_SIGN]: ['has_signature'],
  [EVENTS.PALETTE_OPEN]: ['trigger'],
  [EVENTS.USES_LINK_OUT]: ['tool_name'],
  [EVENTS.SOUND_TOGGLE]: ['state'],
  [EVENTS.SCROLL_DEPTH]: ['route', 'percent'],
});

/**
 * Send one event, if and only if a consented tag is present.
 *
 * The consent gate is structural rather than a flag this module reads: `gtag`
 * only exists on `window` once #141's consent flow has mounted GA4. So before
 * consent there is nothing to call and this returns false; there is no second
 * condition that could be got wrong, and no path by which a mistake here sends
 * a hit to Google.
 *
 * Never throws — including on its own arguments, which is the part that has to
 * be enforced rather than assumed. An analytics failure must not be able to
 * break the interaction that triggered it: a contact-form submission has to
 * complete whether or not its event was recorded, and that promise is worth
 * nothing if a malformed params bag can take the submission down with it.
 *
 * @param {string} name A value from `EVENTS`.
 * @param {Record<string, unknown>} [params] Event parameters. Anything that is
 *   not a plain object — `null` included — is normalised to `{}` and warned
 *   about in development, never trusted and never forwarded as-is.
 * @returns {boolean} True when the event was handed to gtag.
 */
export function trackEvent(name, params = {}) {
  // Rejected rather than forwarded. An unknown name is a bug at the call site,
  // and forwarding it would create the phantom GA4 event this module exists to
  // prevent.
  if (!EVENT_NAMES.has(name)) {
    if (process.env.NODE_ENV !== 'production') {
      // `String(name)`, not `${name}`, and it is the same defect as the params
      // normalisation below rather than a stylistic preference. Template
      // interpolation on a Symbol THROWS ("Cannot convert a Symbol value to a
      // string"), so the diagnostic for a bad argument became an exception out
      // of the function whose contract is that it never throws — reached only
      // by the malformed call it exists to report, and development-only, so it
      // breaks the interaction in the browser of whoever is mid-feature while
      // production swallows it. `String()` is total: every value has a string
      // form, Symbols included.
      console.error(
        `trackEvent: "${String(name)}" is not in the EVENTS map (src/lib/seo/analytics.js). ` +
          'Add it there first — GA4 silently creates unknown events and they ' +
          'cannot be merged with the one you meant afterwards.',
      );
    }
    return false;
  }

  // ── Normalised BEFORE anything reads it ─────────────────────────────────────
  // A default parameter fires for `undefined` and nothing else, so `params = {}`
  // above does not cover `trackEvent(name, null)` — and null is the shape a call
  // site produces the moment its params come from something that can return one
  // (a ref that has not attached, a lookup that missed, a JSON field that came
  // back null). That value arrived here intact, and the development check below
  // then indexed it: `null['mode']` THROWS, out of a function whose whole
  // contract is that it cannot.
  //
  // Which made the throw both real and easy to miss. It needs an event that
  // DECLARES params — `REFINE_USED` and ten others; the two with an empty list
  // filter over nothing and never index — and it is development-only, because
  // production skips this block and hands the null to `gtag` inside the `try`.
  // So it fires exactly where an analytics bug is least acceptable: in the
  // browser of whoever is mid-interaction on the feature, breaking the click
  // that triggered it rather than the reporting it was for.
  //
  // `typeof null === 'object'` is why null is checked explicitly. Arrays are
  // objects too and would validate without throwing, but an array carries no
  // parameter NAMES, so forwarding one can only produce a hit GA4 cannot read.
  // Both become `{}`: a dropped dimension is worth less than the event, and far
  // less than the interaction.
  const isParamBag =
    typeof params === 'object' && params !== null && !Array.isArray(params);
  const safeParams = isParamBag ? params : {};

  if (process.env.NODE_ENV !== 'production') {
    // Said out loud rather than normalised quietly. The missing-param warning
    // below will fire too, but it reports the symptom — every expected param
    // absent — while this names the cause, which is the difference between
    // hunting for the wrong bug and fixing the call site.
    if (!isParamBag) {
      console.warn(
        `trackEvent("${name}"): params must be an object, received ` +
          `${params === null ? 'null' : typeof params}. Sent as {} instead.`,
      );
    }

    const missing = (EVENT_PARAMS[name] ?? []).filter(
      (key) => safeParams[key] === undefined,
    );
    if (missing.length > 0) {
      console.warn(
        `trackEvent("${name}"): missing expected param(s) ${missing.join(', ')}.`,
      );
    }
  }

  // SSR, and every pre-consent client render.
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
    return false;
  }

  try {
    window.gtag('event', name, safeParams);
    return true;
  } catch {
    // Swallowed on purpose — see the note above. A blocked or half-initialised
    // tag is not this call site's problem.
    return false;
  }
}

/**
 * Referrer hosts that mean "an assistant sent this visitor".
 *
 * W3 asks for these to be separable from classic organic, and the reason is
 * that they are currently invisible: GA4's default channel grouping files every
 * one of them under Referral, mixed in with any other site that links here. The
 * trend that matters most to this issue's actual goal — assistants describing
 * the site accurately — is the one the default report cannot show.
 *
 * Exported as data so #141's GA4 mount can register a custom channel group from
 * it, and so `docs/seo.md` and the W6 report read the same list.
 */
export const ASSISTANT_REFERRERS = Object.freeze([
  'chatgpt.com',
  'chat.openai.com',
  'perplexity.ai',
  'www.perplexity.ai',
  'claude.ai',
  'copilot.microsoft.com',
  'gemini.google.com',
]);

/**
 * Whether a referrer host is an assistant.
 *
 * Matches the host exactly or as a subdomain — `eTLD+1` matching would be
 * wrong here (`google.com` must not match, only `gemini.google.com`), so the
 * check is suffix-on-a-dot-boundary against the explicit list.
 *
 * @param {string} referrer A full referrer URL or bare hostname.
 * @returns {boolean} True when the referrer is a known assistant.
 */
export function isAssistantReferrer(referrer) {
  if (typeof referrer !== 'string' || referrer === '') return false;
  let host = referrer;
  try {
    // Tolerates a bare hostname: `new URL` throws on one, so fall through.
    host = new URL(referrer).hostname;
  } catch {
    /* already a hostname */
  }
  host = host.toLowerCase();
  return ASSISTANT_REFERRERS.some(
    (known) => host === known || host.endsWith(`.${known}`),
  );
}
