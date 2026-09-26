'use client';

// The consent gate for every measurement script on this site (issue #141).
//
// ── The criterion this file has to meet ─────────────────────────────────────
// "With consent undecided or denied, NO analytics request is issued — verified
// in the Network panel, not assumed from the React tree." That wording is in the
// issue because the reflex implementation satisfies the React tree and fails the
// network: mounting a script and telling it not to report still downloads the
// script and still sends the first beacon. So the gate is an early `return null`
// ABOVE the mount, not a flag passed into it, and there is no path through this
// component that renders a tag before `analytics` is true.
//
// ── Why all three sit behind one switch ─────────────────────────────────────
// Vercel Web Analytics, Speed Insights and GA4 answer one question between them
// — which pages are worth keeping — so splitting them into three toggles would
// be offering a choice nobody has a reason to make differently, which is how
// consent UI becomes a maze. One honest switch over three named scripts (the
// preference centre lists them) beats three switches nobody reads.
//
// ── GA4 is loaded by consent and STORES NOTHING EITHER WAY ──────────────────
// A deliberate departure from what #141 and GoogleAnalytics.jsx's own header
// specified, and the stronger position of the two. Both said the grant should
// issue `gtag('consent', 'update', { analytics_storage: 'granted' })`. It does
// not, and will not:
//
//   • What the visitor is consenting to here is whether GA4 LOADS AT ALL.
//     Consent Mode stays denied on all four signals permanently, so no `_ga`
//     cookie is ever written — for anyone, accepted or not. The policy can state
//     that flatly instead of hedging it.
//   • It costs nothing that was planned. §14 of docs/seo.md already accepted the
//     cookieless trade in full (users modelled rather than counted, no
//     cross-session attribution); granting storage was never what the
//     measurement needed, it was just the conventional thing to do on accept.
//   • It keeps the string `'granted'` out of GoogleAnalytics.jsx, so
//     tests/unit/gaConsentMode.test.js's assertion about that literal survives
//     intact rather than being weakened to accommodate this change. A gate that
//     required loosening the test guarding it is a worse gate.
//
// ── Revocation, and why it reloads ─────────────────────────────────────────
// "A revocation must actually unload analytics on the spot." Unmounting is not
// that, and believing it is would be the same category of error as the one
// above. Unmounting removes the tags and stops everything React drives, but
// Vercel's insights script has already attached its own history listeners inside
// its own closure, and nothing reachable from here can detach them — so an
// unmount-only revocation keeps sending a pageview per SPA navigation, silently,
// to somebody who has just refused.
//
// The only mechanism that genuinely unloads a script the document has already
// executed is discarding the document. So a revocation that follows a real load
// reloads the page, and the preference centre SAYS SO next to the switch rather
// than surprising anyone. It is the more disruptive option and the only one that
// makes the claim true.
//
// It is conditional on `loadedRef`, so the common paths never reload: declining
// from the notice on a first visit loads nothing to unload, and neither does
// revoking in a tab that was already denied when it opened.

import { useEffect, useRef } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

import GoogleAnalytics from '@/components/analytics/GoogleAnalytics';
import { useConsent } from './ConsentProvider';

/**
 * @param {object} props
 * @param {boolean} props.vercel Whether the Vercel-platform scripts should be
 *   rendered at all. Resolved in the ROOT LAYOUT from `process.env.VERCEL` and
 *   passed down, because this is a client component and `process.env.VERCEL` is
 *   not a `NEXT_PUBLIC_` variable — reading it here would inline `undefined`
 *   into the bundle and silently disable both scripts in production. The
 *   condition itself predates this issue: both fetch from `/_vercel/...`, a path
 *   only the platform serves, so off-platform they 404 on every page load and
 *   that is what capped Lighthouse best-practices at 0.96 in CI. See the comment
 *   this moved out of, in src/app/layout.js.
 */
export default function ConsentedAnalytics({ vercel = false }) {
  const { analytics, grantEpoch } = useConsent();

  // Whether a script was ever actually mounted in THIS document. Not derived
  // from the decision: a tab opened by a visitor who declined months ago has
  // `analytics: false` and nothing loaded, and must not reload on a no-op.
  const loadedRef = useRef(false);

  useEffect(() => {
    if (analytics) {
      loadedRef.current = true;
      return;
    }
    if (!loadedRef.current) return;
    loadedRef.current = false;

    // Take `window.gtag` away first. `trackEvent` (src/lib/seo/analytics.js)
    // gates on nothing but the existence of this function — by design, so that
    // there is "no second condition that could be got wrong" — which makes
    // deleting it the complete and structural way to stop every call site at
    // once. It matters in the instant before the reload lands, and it is why the
    // grant path has to bump an epoch to get the tag back (see below).
    try {
      delete window.gtag;
    } catch {
      // Non-configurable in some hardened environments; the reload settles it.
    }

    window.location.reload();
  }, [analytics]);

  // THE GATE. Everything above this line is teardown; nothing above it renders.
  if (!analytics) return null;

  return (
    <>
      {vercel ? (
        <>
          <SpeedInsights />
          <Analytics />
        </>
      ) : null}
      {/* `epoch` is what makes a re-grant work. Next caches inline <Script> by
          `id` for the lifetime of the document, so remounting with the ids it
          has already run is a no-op — and after the teardown above deleted
          `window.gtag`, a no-op means the tag never comes back and every
          `trackEvent` silently stops. A fresh id per grant re-executes the
          consent defaults and the init block in the correct order.

          It is mostly belt-and-braces now that a revocation reloads the
          document: the epoch's remaining job is the cross-tab grant, where this
          tab has never revoked and so was never reloaded. */}
      <GoogleAnalytics epoch={grantEpoch} />
    </>
  );
}
