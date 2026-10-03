import { expect, settle, test } from '../support/test.js';

// Chaos testing for the data-driven pages (issue #92, L5).
//
// Every live panel on this site (GitHub stats, skills, the Spotify strip, the
// maintenance header, the location line, project progress) is fed by an
// /api/* call, and every one promises to degrade rather than break. This
// suite breaks ALL of them at once, three ways, and checks the promise: the
// page still renders its content and nothing throws.
//
// console.error is ALLOWED here: a failed fetch logging that it failed is the
// correct behaviour. An uncaught exception (pageerror) is still fatal: that is
// a component that did not handle the failure.

const PAGES = ['/', '/about', '/uses', '/projects', '/journey', '/guestbook'];

const FAULTS = {
  'aborted (connection reset)': (route) => route.abort('connectionreset'),
  'HTTP 500': (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"chaos"}' }),
  'malformed JSON': (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"truncated": ' }),
  'slow (4 s)': async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  },
};

test.use({ allowedErrors: [[/^console\.error:/]] });

// Lazily loaded code failing (issue #92). The WebGL backdrops (three.js, well
// over half a megabyte) are fetched AFTER first paint, on purpose, so on a
// flaky phone connection they are exactly the requests most likely to fail.
// A decorative effect that cannot load must leave the page working. This
// blocks every JS chunk requested after the load event and checks just that.
test.describe('a lazy chunk fails to load (flaky network after first paint)', () => {
  for (const path of ['/contact', '/about', '/', '/projects/1']) {
    test(`${path} keeps working without its deferred code`, async ({ page }) => {
      let loaded = false;
      await page.route('**/_next/static/chunks/**/*.js', (route) =>
        loaded ? route.abort('connectionreset') : route.continue(),
      );
      await page.goto(path);
      await settle(page);
      loaded = true;
      await page.waitForTimeout(6000); // past the intro loader, when deferred imports fire
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('body')).not.toContainText(/Application error|Something went wrong/);
    });
  }
});

for (const [fault, handler] of Object.entries(FAULTS)) {
  test.describe(`every data API ${fault}`, () => {
    for (const path of PAGES) {
      test(`${path} still renders and throws nothing`, async ({ page }) => {
        // The slow fault delays EVERY data call by 4 s on purpose; triple the
        // budget for it so a loaded runner cannot turn the design into a flake.
        if (fault.startsWith('slow')) test.slow();
        await page.route('**/api/**', (route) =>
          // Leave auth alone: a broken session endpoint is a different test.
          route.request().url().includes('/api/auth/') ? route.continue() : handler(route),
        );
        const response = await page.goto(path);
        expect(response.status()).toBe(200);
        await settle(page);
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('body')).not.toContainText(/Application error|Unhandled Runtime Error/);
        // Give the polling/retry paths a moment to hit the fault too.
        await page.waitForTimeout(1500);
      });
    }
  });
}
