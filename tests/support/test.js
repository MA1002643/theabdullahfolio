import { test as base, expect } from '@playwright/test';

// The shared Playwright fixture for the issue #92 browser layers. Import
// `test` and `expect` from HERE, not from @playwright/test, and every spec gets
// three guarantees without asking for them:
//
//   1. A HERMETIC BROWSER. Requests to any origin other than the test server
//      are answered locally: images with a transparent pixel, everything else
//      with an empty 204. The server is sandboxed the same way
//      (network-sandbox.cjs), so nothing in a run depends on the internet.
//
//   2. AN ERROR SENTINEL. Any uncaught exception in the page, and any
//      console.error, fails the test that caused it, with the message. A
//      broken page that still renders its <h1> passes a naive assertion; it
//      does not pass this. A spec that EXPECTS an error declares it: for a
//      whole file or block with `test.use({ allowedErrors: [/pattern/] })`, for
//      one test with the `expectErrors(/pattern/)` fixture. Note the DOUBLE
//      brackets in `allowedErrors: [[/a/, /b/]]`: Playwright reads an array
//      given to test.use as `[value, options]` when its second element is an
//      object, and a RegExp is an object, so `[/a/, /b/]` would silently
//      become the value /a/ with /b/ taken as fixture options.
//
//   3. WEBKIT ON LOCALHOST. The production CSP carries
//      `upgrade-insecure-requests`, which real WebKit honours even for
//      http://localhost: every asset is upgraded to https and the page renders
//      unstyled. Chrome exempts localhost; WebKit does not. For WebKit only,
//      the directive is stripped from document responses, so the page tested
//      is the page a visitor on https gets.
//
// The pre-issue-#92 specs (seo, uses, guestbook*) import @playwright/test
// directly and are unaffected.

const LOCAL = new Set(['localhost', '127.0.0.1']);
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

// Guarantees 1 and 3 alone, without the error sentinel. For the image-cache
// warm-ups (tests/warmup), which visit every route ahead of the real suites
// and must not reach the internet doing it, but assert nothing about the page:
// its errors are the dependent suites' to report (code review: the warm-ups
// used the base fixture, so their visits went to third-party hosts unchecked).
export const hermeticTest = base.extend({
  _hermetic: [
    async ({ context, browserName }, use) => {
      await context.route(
        (url) => !LOCAL.has(url.hostname) || browserName === 'webkit',
        async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (!LOCAL.has(url.hostname)) {
            return request.resourceType() === 'image'
              ? route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
              : route.fulfill({ status: 204, body: '' });
          }
          if (request.resourceType() !== 'document') return route.continue();
          const response = await route.fetch();
          const headers = { ...response.headers() };
          if (headers['content-security-policy']) {
            headers['content-security-policy'] = headers['content-security-policy']
              .split(';')
              .filter((d) => d.trim() !== 'upgrade-insecure-requests')
              .join(';');
          }
          return route.fulfill({ response, headers });
        },
      );
      await use();
    },
    { auto: true },
  ],
});

export const test = hermeticTest.extend({
  allowedErrors: [[], { option: true }],

  // Patterns one test declares it expects; read when the sentinel tears down.
  _expected: async ({}, use) => {
    await use([]);
  },

  expectErrors: async ({ _expected }, use) => {
    await use((...patterns) => _expected.push(...patterns));
  },

  _errorSentinel: [
    async ({ page, allowedErrors, _expected }, use, testInfo) => {
      const seen = [];
      page.on('pageerror', (err) => seen.push(`pageerror: ${err.message}`));
      page.on('console', (msg) => {
        if (msg.type() === 'error') seen.push(`console.error: ${msg.text()}`);
      });
      await use();
      // Flattened, so every spelling works: /re/, [/re/] and [[/a/, /b/]] (the
      // double brackets are what keeps Playwright from reading a two-pattern
      // list as [value, options]; see the note in the header).
      const allowed = [allowedErrors, _expected].flat(Infinity).filter((re) => re instanceof RegExp);
      const errors = seen.filter((text) => !allowed.some((re) => re.test(text)));
      if (errors.length) {
        await testInfo.attach('page-errors', { body: errors.join('\n'), contentType: 'text/plain' });
      }
      expect(errors, 'the page logged errors during this test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Serve a JSON body for an API path in this page only. */
export const stubJson = (page, glob, body, status = 200) =>
  page.route(glob, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );

/**
 * Wait for the page to be quiet enough to inspect: loaded, fonts ready, and
 * two animation frames past that so first-paint effects have run.
 */
export async function settle(page) {
  await page.waitForLoadState('load');
  // The intro loader covers every first visit for ~3 s and holds the page
  // inert beneath it (src/components/loaderWrapper). Wait for its reveal
  // signal, or for there to be no loader at all (a repeat visit skips it).
  await page
    .waitForFunction(() => window.__loaderDone === true || !document.querySelector('.fixed.inset-0.z-\\[9999\\]'), null, {
      timeout: 15_000,
    })
    .catch(() => {});
  // …and for the overlay element itself to leave (its exit fade).
  await page
    .locator('.fixed.inset-0.z-\\[9999\\]')
    .waitFor({ state: 'detached', timeout: 5_000 })
    .catch(() => {});
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
