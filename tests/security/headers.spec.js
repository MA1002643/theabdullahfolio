import { ALL_ROUTES } from '../support/routes.js';
import { expect, test } from '../support/test.js';

// The security headers the production server actually SENDS (issue #92, L9).
//
// tests/unit/cspAnalytics.test.js pins what next.config.mjs DECLARES. Only a
// real request proves what is SERVED: config can be shadowed by a route, a
// middleware, or a later `headers()` entry, and a header that never reaches
// the wire protects nobody. `request` (no browser) is used on purpose, so what
// is asserted is the raw response.

/** Parse a CSP header into { directive: [sources] }. */
const parseCsp = (header) =>
  Object.fromEntries(
    header
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources]),
  );

test.describe('security headers, on every route', () => {
  for (const path of ALL_ROUTES) {
    test(`${path}`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      const h = res.headers();

      const csp = parseCsp(h['content-security-policy'] ?? '');
      // Clickjacking: nobody may frame the site (the modern X-Frame-Options).
      expect(csp['frame-ancestors']).toEqual(["'none'"]);
      // No plugins, no <base> hijack, forms post only to this origin.
      expect(csp['object-src']).toEqual(["'none'"]);
      expect(csp['base-uri']).toEqual(["'self'"]);
      expect(csp['form-action']).toEqual(["'self'"]);
      expect(csp['default-src']).toEqual(["'self'"]);
      // The production-only upgrade directive is present on a production build.
      expect(Object.keys(csp)).toContain('upgrade-insecure-requests');

      // MIME sniffing off: a user-uploaded or mis-typed file is never executed
      // as script because a browser guessed.
      expect(h['x-content-type-options']).toBe('nosniff');
      // Full URLs never leak to other origins in the Referer header.
      expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
      // Powerful features this site never uses are switched off for every
      // frame, so an injected script cannot ask for them either.
      const permissions = h['permissions-policy'] ?? '';
      for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
        expect(permissions).toContain(`${feature}=()`);
      }
      // No framework fingerprint for a scanner to key an exploit list on.
      expect(h['x-powered-by']).toBeUndefined();
    });
  }
});

test('API responses carry the same hardening', async ({ request }) => {
  const res = await request.get('/api/github-stats?username=MA1002643');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['x-powered-by']).toBeUndefined();
});
