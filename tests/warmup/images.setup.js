import { ALL_ROUTES } from '../support/routes.js';
import { hermeticTest as setup } from '../support/test.js';

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
// Warming asserts nothing about the page: an HTTP error does not stop `load`,
// so a route that renders a broken page still warms, and the real specs report
// it. What warming DOES require is that `load` arrives, because that is the
// cache being warm. It used to swallow a timeout and report success, which
// sent the dependent suites into exactly the cold-cache flake this exists to
// prevent, behind a green setup step (code review). Now a timed-out visit is
// retried once (the encodes it queued keep running, so the second visit meets
// a warmer cache), and a second timeout fails the setup so nothing downstream
// runs against a cache that is known to be cold.
//
// The visits go through the shared fixture's browser interception
// (tests/support/test.js, `hermeticTest`), so a warm-up reaches no host the
// dependent specs could not: the server's fetch sandbox cannot stop browser
// traffic. Not through its error sentinel, for the reason above: a warm-up
// that failed on a page error would hide the cache it was there to warm.

const WARM_TIMEOUT = 150_000;
const WARM_ATTEMPTS = 2;

for (const path of ALL_ROUTES) {
  setup(`warm ${path}`, async ({ page }) => {
    setup.setTimeout(WARM_TIMEOUT * WARM_ATTEMPTS + 10_000);
    for (let attempt = 1; ; attempt++) {
      const started = Date.now();
      try {
        await page.goto(path, { waitUntil: 'load', timeout: WARM_TIMEOUT });
        console.log(`warmed ${path} in ${((Date.now() - started) / 1000).toFixed(1)} s (attempt ${attempt})`);
        return;
      } catch (error) {
        if (attempt >= WARM_ATTEMPTS) {
          throw new Error(`could not warm ${path}: no load event in ${WARM_ATTEMPTS} attempts of ${WARM_TIMEOUT / 1000} s`, {
            cause: error,
          });
        }
        console.log(`warm-up of ${path} timed out (attempt ${attempt}), retrying: ${error.message.split('\n')[0]}`);
      }
    }
  });
}
