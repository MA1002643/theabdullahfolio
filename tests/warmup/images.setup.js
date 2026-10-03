import { test as setup } from '@playwright/test';

import { ALL_ROUTES } from '../support/routes.js';

// Warms the image optimiser before the e2e projects run (issue #92).
//
// The test server is a fresh `next start`, so its `/_next/image` cache is
// empty, and the first request for each image width is encoded on the spot.
// AVIF encoding is CPU-heavy: on a 2-vCPU GitHub runner a Pixel 7's first visit
// to /qualifications queued fifteen `w=1080` encodes behind each other, 11 to 43
// seconds apiece (trace from run 37146259341), so the page's `load` event could
// not fire inside a 60 s test. The retry then passed in 13 s against a warm
// cache: a timeout that reported as a page bug and was really a cold cache.
//
// Production never sees that queue: Vercel's optimiser cache is shared and
// persistent. So the honest fix is to warm the cache, not to stop waiting for
// `load` or to switch optimisation off, either of which would test a different
// site. Each warm project uses the SAME viewport and pixel ratio as the project
// that depends on it, because those decide which widths get requested.
//
// Warming asserts nothing and never fails: a route that is genuinely broken is
// the real specs' business, and they still run against it.

const WARM_TIMEOUT = 150_000;

for (const path of ALL_ROUTES) {
  setup(`warm ${path}`, async ({ page }) => {
    setup.setTimeout(WARM_TIMEOUT + 10_000);
    const started = Date.now();
    try {
      await page.goto(path, { waitUntil: 'load', timeout: WARM_TIMEOUT });
      console.log(`warmed ${path} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    } catch (error) {
      console.log(`warm-up of ${path} gave up after ${WARM_TIMEOUT / 1000} s: ${error.message.split('\n')[0]}`);
    }
  });
}
