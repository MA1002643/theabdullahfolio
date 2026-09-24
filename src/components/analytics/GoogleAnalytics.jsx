'use client';

import Script from 'next/script';

// GA4 under Consent Mode v2, denied by default (issue #32, W5 / #141).
//
// ── NOTHING MOUNTS THIS YET, AND THAT IS THE POINT ──────────────────────────
// src/app/layout.js does not render this component; the mount is #141's, inside
// the `<ConsentedAnalytics />` boundary that issue specifies, beside the two
// Vercel scripts. `tests/unit/gaConsentMode.test.js` pins the absence, so a
// mount cannot reappear by accident.
//
// It ships ahead of the gate because the tag is the quick half. The CSP
// allowance for the tag manager, the EVENTS map in src/lib/seo/analytics.js and
// the consent defaults below are the parts worth reviewing, and none of them
// can be reviewed while the component they configure is a TODO. Written now,
// switched on in one line later.
//
// ── Why Consent Mode v2 is the shape, even behind a gate ────────────────────
// docs/seo.md §8 recorded GA4 as hard-blocked on consent gating. What PECR
// governs is the STORAGE — reading or writing information on someone's
// terminal equipment — and GA4's default behaviour writes a `_ga` cookie,
// which is exactly that.
//
// PECR alone, deliberately: this comment named the UK GDPR alongside it once,
// and that is a different instrument answering a different question. The GDPR
// governs the PROCESSING of personal data whether or not anything touches the
// device, so it is not disposed of by removing a cookie — see the correction in
// docs/seo.md §14. The distinction is the whole reason this file is unmounted.
//
// Consent Mode v2 with `analytics_storage: 'denied'` is the configuration where
// GA4 writes nothing. No cookie is set, no identifier is stored or read, and
// what leaves the browser is a cookieless ping: page path, referrer, coarse
// geography and device class, with no key tying two of them to one person.
//
// That is a narrower argument than it first looks, and the distinction is why
// this file is not mounted on the strength of it: it says the DENIED state
// needs no storage consent, not that an undecided visitor should be pinged.
// #141 asks for no analytics request at all before a decision, and a cookieless
// ping is still a request. So the denied defaults are what the gate opens
// FROM — the state a visitor who declines stays in permanently — rather than a
// licence to skip the gate.
//
// The trade is real and worth stating plainly, because the numbers will look
// wrong to anyone expecting normal GA4:
//
//   • No stable user identifier, so "users" is modelled, not counted, and
//     returning visitors are indistinguishable from new ones.
//   • No cross-session attribution. A recruiter who finds the site on Monday
//     and returns on Thursday is two unrelated pings.
//   • Nothing that depends on a user journey — funnels, cohorts, retention —
//     means anything.
//
// What survives is exactly what this site needs GA4 for and Search Console
// cannot give: which pages are read, in what proportion, and from where. Vercel
// Analytics already counts visits; the point of GA4 here is the referrer and
// landing-page breakdown alongside Search Console's query data (§8).
//
// ── What #141 has to do here ────────────────────────────────────────────────
// Render this component inside the consent boundary, and on a grant make one
// call: `gtag('consent', 'update', { analytics_storage: 'granted' })` from
// wherever the accept button lives. Nothing else in this file moves and no call
// site of `trackEvent` is affected. That call is deliberately absent today —
// there is no UI that could produce consent, so a granting path with no way to
// reach it would be dead code asserting a capability the site does not have,
// and `tests/unit/gaConsentMode.test.js` fails on a `granted` literal appearing
// in this module before then.
//
// ── Why the events still work ───────────────────────────────────────────────
// `trackEvent` (src/lib/seo/analytics.js) calls `window.gtag` and no-ops when it
// is absent. Cookieless pings still carry events, so the EVENTS map records
// what happened without recording who it happened to — which is the right
// bargain for a portfolio and the one this file implements.

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/**
 * The consent defaults, as a `dataLayer` command.
 *
 * All four Consent Mode v2 signals are named explicitly rather than relying on
 * GA4's own defaults. That is the whole safety property of this file: an
 * unnamed signal falls back to whatever the product decides it should be, and
 * that default has changed before. Naming each one means a future change to
 * Google's defaults cannot silently start storing something here.
 *
 * Four signals and nothing else. `ads_data_redaction` was here once and did
 * nothing: it is NOT a Consent Mode parameter, it is a gtag SETTING, and the
 * `consent` command ignores keys it does not recognise rather than rejecting
 * them. So the object read as though it carried a fifth protection, the test
 * below asserted that protection was present by reading the literal, and no
 * part of the stack could report that the value never reached gtag.js. It is
 * issued as its own `set` command in the script body instead.
 */
const CONSENT_DEFAULTS = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
};

export default function GoogleAnalytics() {
  // Unset is a SUPPORTED state, not a misconfiguration: local development,
  // every preview deployment and any fork runs without a measurement ID, and
  // none of them should be reporting into the production property. Rendering
  // nothing is also what keeps `window.gtag` undefined there, which is the
  // structural gate `trackEvent` already relies on.
  if (!MEASUREMENT_ID) return null;

  return (
    <>
      {/* This script MUST execute before gtag.js reads the queue, which is why
          it is a separate tag rendered first rather than folded into the init
          block below. Next emits same-strategy scripts in source order, and
          the consent command only has to be IN `dataLayer` before the library
          processes it — not before the library downloads — so ordering here is
          sufficient without reaching for `beforeInteractive` (which would put
          a blocking script in the document head on every route for a
          measurement concern).

          `ads_data_redaction` rides along for the same reason, and is a
          `set` command rather than a member of the consent object: it is a
          gtag setting, not a Consent Mode signal, and the `consent` command
          drops unrecognised keys silently — so written the other way it was
          decoration that looked like a control. It strips ad identifiers from
          requests made while `ad_storage` is denied, which is permanently,
          and must be set before the library reads the queue to apply to the
          first ping as well as the rest. */}
      <Script
        id="ga-consent-default"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
window.dataLayer = window.dataLayer || [];
window.gtag = function gtag(){window.dataLayer.push(arguments);};
gtag('consent', 'default', ${JSON.stringify(CONSENT_DEFAULTS)});
gtag('set', 'ads_data_redaction', true);
`.trim(),
        }}
      />

      <Script
        id="ga-lib"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
      />

      <Script
        id="ga-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
gtag('js', new Date());
gtag('config', ${JSON.stringify(MEASUREMENT_ID)}, {
  transport_type: 'beacon'
});
`.trim(),
        }}
      />
    </>
  );
}
