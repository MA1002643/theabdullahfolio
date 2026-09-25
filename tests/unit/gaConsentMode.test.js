import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// ── Why this file exists ────────────────────────────────────────────────────
// GA4 is NOT mounted (see the last describe, which pins that) — the component
// is written and waiting for #141's consent gate. These assertions are about
// the state it will be switched on IN, and they are worth having now for the
// same reason the component is worth having now: the defaults are the part
// nobody looks at again once the tag starts reporting.
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

  it('denies analytics storage — the whole basis for having no banner', () => {
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
    // There is no UI on this site that could produce consent, so a `granted`
    // literal here could only be an unconditional grant — the exact bug this
    // whole arrangement exists to make impossible.
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

describe('the mount, which deliberately does not exist yet', () => {
  const layout = codeOnly(
    readFileSync(new URL('../../src/app/layout.js', import.meta.url), 'utf8'),
  );

  it('is absent from the root layout until the consent gate lands (#141)', () => {
    // The component is finished and the CSP already allows the tag — what is
    // missing is the only thing that may switch it on. #141's acceptance
    // criterion is that a visitor who has not decided issues NO analytics
    // request, and the denied defaults above suppress STORAGE, not the
    // cookieless ping: a mounted GA4 still sends page path, referrer and coarse
    // geography for an undecided visitor.
    //
    // Asserted against the layout SOURCE, with comments stripped, because this
    // is a claim about what ships rather than about what renders — and because
    // an accidental mount is the failure that looks like nothing at all in a
    // browser, which is the same reason the defaults above are pinned.
    expect(layout).not.toContain('<GoogleAnalytics />');
    expect(layout).not.toContain('@/components/analytics/GoogleAnalytics');
  });

  it('leaves Vercel Analytics where it is', () => {
    // Unchanged by the above, and not an endorsement: it is mounted on Vercel
    // only, and #141 gates all three together. Named here so that removing it
    // is a deliberate act rather than a side effect of this file.
    expect(layout).toContain('<Analytics />');
  });
});
