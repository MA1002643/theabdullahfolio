'use client';

import Script from 'next/script';

// GA4 under Consent Mode v2, denied by default (issue #32, W5 / #141).
//
// ── MOUNTED ONLY BY THE CONSENT GATE ────────────────────────────────────────
// #141 shipped, so the "nothing mounts this yet" note that stood here is gone.
// The single mount is inside `src/components/privacy/ConsentedAnalytics.jsx`,
// below that component's `if (!analytics) return null`, beside the two Vercel
// scripts. `src/app/layout.js` still does not render this component and must
// not: `tests/unit/gaConsentMode.test.js` fails on an import of it appearing
// there, so the gate cannot be bypassed by accident.
//
// It shipped ahead of the gate because the tag was the quick half. The CSP
// allowance for the tag manager, the EVENTS map in src/lib/seo/analytics.js and
// the consent defaults below were the parts worth reviewing, and none of them
// could be reviewed while the component they configure was a TODO.
//
// ── The gate loads it; it never grants storage ───────────────────────────────
// The "what #141 has to do here" section below said the grant would be one
// `gtag('consent', 'update', { analytics_storage: 'granted' })`. It is not, and
// the departure is deliberate — see the reasoning in ConsentedAnalytics.jsx.
// What a visitor consents to is whether this component RENDERS AT ALL. The four
// signals below stay denied permanently, in both states, so no `_ga` cookie is
// ever written for anyone and /privacy can say so without a caveat. Everything
// §14 of docs/seo.md accepted about the cookieless trade still holds; nothing
// the measurement needed depended on storage.
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
// docs/seo.md §14. The distinction is the whole reason this file spent a
// fortnight unmounted, and the reason the gate above it now exists.
//
// Consent Mode v2 with `analytics_storage: 'denied'` is the configuration where
// GA4 writes nothing. No cookie is set, no identifier is stored or read, and
// what leaves the browser is a cookieless ping: page path, referrer, coarse
// geography and device class, with no key tying two of them to one person.
//
// That is a narrower argument than it first looks, and the distinction is why
// this file was never mounted on the strength of it: it says the DENIED state
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
// ── What #141 actually did here ─────────────────────────────────────────────
// Rendered this component inside the consent boundary, and added the `epoch`
// prop below. No grant call, for the reason above, so
// `tests/unit/gaConsentMode.test.js`'s assertion that the literal `'granted'`
// appears nowhere in this module's code still holds — and is still worth
// holding: with a consent UI now in existence, a stray `'granted'` here would be
// a storage grant nobody asked for rather than merely dead code.
//
// ── Why the events still work ───────────────────────────────────────────────
// `trackEvent` (src/lib/seo/analytics.js) calls `window.gtag` and no-ops when it
// is absent. Cookieless pings still carry events, so the EVENTS map records
// what happened without recording who it happened to — which is the right
// bargain for a portfolio and the one this file implements.

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/**
 * Whether this build renders a tag at all. Exported so ConsentedAnalytics can
 * tell "a grant loaded GA4" from "a grant loaded nothing" without reading the
 * variable a second time. Without an ID the component below returns null.
 */
export const GA_CONFIGURED = Boolean(MEASUREMENT_ID);

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

/**
 * @param {object} props
 * @param {number} [props.epoch] Bumped once per grant by ConsentProvider, and
 *   woven into all three script ids.
 *
 *   It exists because Next caches an inline `<Script>` by `id` for the lifetime
 *   of the document: remounting with an id it has already executed does nothing
 *   at all. That is the right default — it stops a re-render re-running a tag —
 *   and it is exactly wrong for a consent gate, where the sequence
 *   grant → revoke → grant has to put `window.gtag` back after the revoke
 *   deleted it. With a fixed id the second grant renders three inert tags and
 *   every `trackEvent` no-ops for the rest of the session, which is a failure
 *   with no symptom: the UI says analytics are on and nothing is recorded.
 *
 *   The default of 0 keeps the ids stable for a single-grant session and for any
 *   caller that does not pass one.
 */
export default function GoogleAnalytics({ epoch = 0 }) {
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
        id={`ga-consent-default-${epoch}`}
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
        id={`ga-lib-${epoch}`}
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
      />

      <Script
        id={`ga-init-${epoch}`}
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
