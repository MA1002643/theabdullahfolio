import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// ── Why this file exists ────────────────────────────────────────────────────
// GA4 is mounted now — only ever inside #141's consent gate, which the last
// describe pins from both ends. These assertions are about the state it reports
// IN, and they matter more since the gate landed rather than less: the defaults
// are the part nobody looks at again once the tag starts reporting, and there is
// now a live path by which a tag can actually run.
//
// `analytics_storage: 'denied'` is what stops GA4 writing the `_ga` cookie.
// Flip it — or add a signal and forget to deny it — and the site starts storing
// an identifier on a UK/EU visitor's device with no consent in sight, which is
// a compliance failure that looks like nothing at all in the browser.
//
// That makes these defaults the highest-consequence four lines in the repo and
// the least visible. They are asserted against the SOURCE TEXT rather than by
// rendering the component, deliberately: what matters is the literal that ships
// in the inline script, and a render test in a jsdom environment would pass on
// a component whose script body had been emptied.

const SOURCE = readFileSync(
  new URL('../../src/components/analytics/GoogleAnalytics.jsx', import.meta.url),
  'utf8',
);

/**
 * Source with `//` and block comments removed.
 *
 * Crude — it would mangle a `//` inside a string literal — which is fine for
 * what it is used for here: one assertion about a quoted word, over a file that
 * contains no such literal. It is not a parser and must not grow into one.
 */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** The CONSENT_DEFAULTS object literal, parsed out of the module source. */
function consentDefaults() {
  const match = SOURCE.match(/const CONSENT_DEFAULTS = \{([\s\S]*?)\n\};/);
  if (!match) throw new Error('CONSENT_DEFAULTS literal not found');

  const defaults = {};
  for (const line of match[1].split('\n')) {
    const pair = line.match(/^\s*([a-z_]+):\s*(?:'([^']*)'|(true|false))\s*,?\s*$/);
    if (pair) defaults[pair[1]] = pair[2] ?? pair[3] === 'true';
  }
  return defaults;
}

describe('Consent Mode v2 defaults', () => {
  const defaults = consentDefaults();

  it('denies analytics storage, permanently and in both consent states', () => {
    // This used to be titled "the whole basis for having no banner". There is a
    // notice now, and the assertion survives it unchanged — because #141
    // deliberately did NOT flip this on accept. Consent decides whether the tag
    // loads; storage stays denied either way, so no `_ga` cookie is ever written
    // for anyone. /privacy says exactly that, and this is the line that makes it
    // true.
    expect(defaults.analytics_storage).toBe('denied');
  });

  it('denies every advertising signal too', () => {
    // Named explicitly rather than left to GA4's own defaults. An unnamed
    // signal takes whatever value the product currently ships, and that default
    // has changed before — so naming all four is what stops a change on
    // Google's side silently enabling storage here.
    expect(defaults.ad_storage).toBe('denied');
    expect(defaults.ad_user_data).toBe('denied');
    expect(defaults.ad_personalization).toBe('denied');
  });

  it('redacts ad identifiers with the command that actually applies it', () => {
    // This assertion used to read `defaults.ads_data_redaction === true`, and
    // it passed for a value that never reached gtag.js. `ads_data_redaction`
    // is not a Consent Mode parameter — it is a gtag SETTING, issued as
    // `gtag('set', …)` — and the `consent` command ignores keys it does not
    // recognise rather than rejecting them. So the literal carried a fifth
    // protection, the test confirmed the literal, and nothing anywhere could
    // observe that the setting was inert. A test that reads the source has to
    // assert the CALL, not the shape of an object the call never receives.
    expect(SOURCE).toMatch(/gtag\('set', 'ads_data_redaction', true\)/);
    expect(defaults.ads_data_redaction).toBeUndefined();
  });

  it('sets the redaction before the library is loaded', () => {
    // Same window as the consent default below: a setting applied after
    // gtag.js has processed the queue does not apply to the pings already sent.
    expect(SOURCE.indexOf("gtag('set', 'ads_data_redaction'")).toBeLessThan(
      SOURCE.indexOf('googletagmanager.com/gtag/js'),
    );
  });

  it('claims no protection GA4 does not honour', () => {
    // `anonymize_ip` was passed to `gtag('config', …)` and did nothing: it is a
    // Universal Analytics parameter, and GA4 anonymises IP addresses
    // unconditionally with no way to turn it off. Harmless as code and
    // actively misleading as documentation — in a file whose whole job is to
    // make the privacy posture legible, a line that reads as a safeguard while
    // being a no-op is worse than its absence. The protection is real; this was
    // not the thing providing it.
    expect(codeOnly(SOURCE)).not.toContain('anonymize_ip');
  });

  it('grants nothing, anywhere in the module', () => {
    // The original reason was that no UI existed which could produce consent, so
    // a `granted` literal here could only be an unconditional grant. #141 built
    // that UI and the assertion got STRONGER rather than obsolete: this component
    // has no access to consent state, so a `granted` here is still necessarily
    // unconditional — and it would now be a storage grant on a live tag rather
    // than dead code. The grant that does exist is "render this component at
    // all", and it lives in ConsentedAnalytics.
    //
    // Checked against the CODE with comments stripped. The module's header
    // deliberately quotes the `gtag('consent','update',{…:'granted'})` call a
    // future banner would make, and a naive text search would either fail on
    // that documentation or force the docs to avoid naming the thing they
    // exist to explain.
    expect(codeOnly(SOURCE)).not.toMatch(/'granted'/);
  });

  it('sets the defaults before the library is loaded', () => {
    // gtag.js processes the dataLayer queue as it initialises. If the consent
    // command is pushed after the library tag, GA4 can initialise under its own
    // defaults — storage ALLOWED — for the window in between, which is long
    // enough to write a cookie.
    expect(SOURCE.indexOf("gtag('consent', 'default'")).toBeLessThan(
      SOURCE.indexOf('googletagmanager.com/gtag/js'),
    );
  });
});

describe('the unset-measurement-id path', () => {
  it('renders nothing without an id', () => {
    // Local development, every preview deployment and every fork run without
    // one, and none of them should report into the production property. It is
    // also what keeps `window.gtag` undefined there — the structural gate
    // `trackEvent` relies on instead of a flag it could get wrong.
    expect(SOURCE).toMatch(/if \(!MEASUREMENT_ID\) return null;/);
  });

  it('reads the id from the documented variable', () => {
    expect(SOURCE).toContain('process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID');
  });
});

// ── The gate, pinned from both ends ─────────────────────────────────────────
// This describe used to be called "the mount, which deliberately does not exist
// yet" and asserted that `layout.js` contained neither `<GoogleAnalytics />` nor
// an import of it. #141 shipped, so half of that is now the wrong question — but
// only half. The absence from `layout.js` is still exactly the right assertion,
// because a mount THERE would bypass the consent gate entirely while looking
// completely ordinary in review. What changed is that the mount has to exist
// somewhere, and that somewhere has to be behind the gate.
//
// So: read both files, and check the relationship between them. Asserted against
// SOURCE TEXT rather than by rendering, for the reason the defaults above are:
// this is a claim about what ships, and the failure it guards against — a script
// loading for somebody who never agreed — looks like nothing at all in a browser.
describe('the consent gate around the mount', () => {
  const layout = codeOnly(
    readFileSync(new URL('../../src/app/layout.js', import.meta.url), 'utf8'),
  );
  const gateSource = readFileSync(
    new URL('../../src/components/privacy/ConsentedAnalytics.jsx', import.meta.url),
    'utf8',
  );
  const gate = codeOnly(gateSource);

  it('keeps GA4 out of the root layout, which would bypass the gate', () => {
    // Unchanged from before #141, and deliberately so. The root layout is a
    // Server Component with no access to consent state, so anything mounted
    // there runs for every visitor on the first paint — which is the one
    // outcome this whole arrangement exists to prevent.
    expect(layout).not.toContain('<GoogleAnalytics');
    expect(layout).not.toContain('@/components/analytics/GoogleAnalytics');
  });

  it('keeps Vercel Analytics and Speed Insights out of the root layout too', () => {
    // These two WERE in the layout, behind `process.env.VERCEL`, and that
    // condition is not a consent gate — it only asks whether the platform can
    // serve the script, never whether the visitor agreed to it. Both moved
    // behind ConsentedAnalytics; an import reappearing here is the same bypass
    // as the GA4 one above.
    expect(layout).not.toContain('@vercel/analytics');
    expect(layout).not.toContain('@vercel/speed-insights');
  });

  it('mounts all three inside the consent boundary', () => {
    expect(gate).toContain('@/components/analytics/GoogleAnalytics');
    expect(gate).toContain('@vercel/analytics/next');
    expect(gate).toContain('@vercel/speed-insights/next');
    expect(gate).toContain('<GoogleAnalytics');
    expect(gate).toContain('<Analytics />');
    expect(gate).toContain('<SpeedInsights />');
  });

  it('puts the gate ABOVE every mount, not a flag inside one', () => {
    // The distinction the issue was explicit about: mounting a script and
    // telling it not to report still downloads the script and still sends the
    // first beacon. Only an early return can produce "no network request".
    //
    // Checked by POSITION, which is the only property that expresses it: the
    // `return null` must come before the first tag in the file. A test that
    // merely asserted the guard exists would pass on a guard placed after the
    // markup it is supposed to protect.
    const guard = gate.indexOf('if (!analytics) return null;');
    expect(
      guard,
      'ConsentedAnalytics must early-return when analytics are not granted.',
    ).toBeGreaterThan(-1);

    for (const tag of ['<SpeedInsights />', '<Analytics />', '<GoogleAnalytics']) {
      expect(
        gate.indexOf(tag),
        `${tag} is rendered before the consent guard, so it would load for a ` +
          `visitor who has not agreed.`,
      ).toBeGreaterThan(guard);
    }
  });

  it('never grants analytics storage, from anywhere', () => {
    // The `'granted'` assertion above covers GoogleAnalytics.jsx. This covers
    // the gate, which is the file that would plausibly have issued
    // `gtag('consent', 'update', { analytics_storage: 'granted' })` — both the
    // issue and the component's own header specified exactly that, and the
    // implementation deliberately departed from it. Consent decides whether GA4
    // LOADS; Consent Mode stays denied permanently, so no `_ga` cookie is ever
    // written for anyone. /privacy states that without a caveat, and this is
    // what keeps the statement true.
    expect(gate).not.toContain('analytics_storage');
    expect(gate).not.toMatch(/'granted'/);
  });

  it('resolves the Vercel-platform flag on the server, not in the client', () => {
    // `process.env.VERCEL` is not a `NEXT_PUBLIC_` variable, so a client
    // component reading it gets `undefined` inlined at build — and both Vercel
    // scripts then silently never load in production. A failure with no symptom
    // anywhere, which is why it is pinned in both directions: resolved in the
    // Server Component, never read inside the boundary.
    expect(layout).toContain('<ConsentedAnalytics vercel={Boolean(process.env.VERCEL)} />');
    expect(gate).not.toContain('process.env.VERCEL');
  });

  it('gives the GA4 tags an id that changes per grant', () => {
    // Next caches an inline <Script> by `id` for the life of the document, so
    // re-granting after a revoke would render three inert tags and leave
    // `window.gtag` deleted — analytics silently off while the UI says on.
    // Pinned because it is invisible: the bug needs the sequence
    // grant → revoke → grant to appear at all.
    const component = readFileSync(
      new URL('../../src/components/analytics/GoogleAnalytics.jsx', import.meta.url),
      'utf8',
    );
    for (const id of ['ga-consent-default', 'ga-lib', 'ga-init']) {
      expect(
        component,
        `The ${id} script must carry the grant epoch in its id.`,
      ).toContain(`id={\`${id}-\${epoch}\`}`);
    }
    expect(gate).toContain('epoch={grantEpoch}');
  });
});
