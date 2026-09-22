import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// ── Why this file exists ────────────────────────────────────────────────────
// GA4 is mounted here with NO cookie banner, and the entire legal basis for
// that is one configuration value: `analytics_storage: 'denied'`, which stops
// GA4 writing the `_ga` cookie. Flip it — or add a signal and forget to deny it
// — and the site starts storing an identifier on a UK/EU visitor's device with
// no consent in sight, which is a compliance failure that looks like nothing at
// all in the browser.
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

  it('redacts ad identifiers from the cookieless ping', () => {
    expect(defaults.ads_data_redaction).toBe(true);
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

describe('the mount', () => {
  const layout = readFileSync(
    new URL('../../src/app/layout.js', import.meta.url),
    'utf8',
  );

  it('is in the root layout, so every route is measured', () => {
    expect(layout).toContain('<GoogleAnalytics />');
    expect(layout).toContain(
      "import GoogleAnalytics from '@/components/analytics/GoogleAnalytics'",
    );
  });

  it('does not replace Vercel Analytics', () => {
    // The two answer different questions and are expected to disagree (§8).
    // Dropping the cookieless, already-working counter in favour of a modelled
    // one would be a straight downgrade.
    expect(layout).toContain('<Analytics />');
  });
});
