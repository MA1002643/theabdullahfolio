import { expect, test } from '../support/test.js';

// While the opaque intro loader covers the page, nothing beneath it may take
// keyboard focus (WCAG 2.4.11, issue #92). LoaderWrapper makes what it wraps
// `inert`; this checks the RESULT in the browser: every focusable element on
// the page is either part of the loader itself or under an inert ancestor.
// tests/fitness/loaderInertBoundary.test.js pins the layout for the controls
// this server never renders (NowPlaying, the floating sound toggle).

const LOADER = '.fixed.inset-0.z-\\[9999\\]';
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

for (const path of ['/', '/about', '/projects/1']) {
  test(`${path}: nothing outside the intro loader can take focus while it covers the page`, async ({ page }) => {
    // A fresh context is a first visit, so the loader shows.
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.locator(LOADER).waitFor({ state: 'attached' });
    // `inert` is applied once the wrapper hydrates; wait for it rather than
    // judging the server HTML, which no keyboard can reach yet anyway.
    await page.waitForFunction(() => document.querySelector('[inert]'));

    const result = await page.evaluate(
      ({ loader, focusable }) => {
        const overlay = document.querySelector(loader);
        if (!overlay) return { covered: false, escapees: [] };
        const escapees = [...document.querySelectorAll(focusable)]
          .filter((el) => !overlay.contains(el) && !el.closest('[inert]') && el.getClientRects().length > 0)
          .map((el) => el.outerHTML.slice(0, 120));
        return { covered: true, escapees };
      },
      { loader: LOADER, focusable: FOCUSABLE },
    );

    expect(result.covered, 'the loader had already gone; the check sampled nothing').toBe(true);
    expect(result.escapees).toEqual([]);
  });
}

// The page must stay inert for as long as the overlay is MOUNTED, not just
// until the reveal begins. The wipe (or the reduced-motion cross-fade) keeps the
// overlay mostly opaque for REVEAL_DURATION_MS, and the page was released at the
// start of it, so Tab in that window reached controls still hidden behind it.
// This samples every frame from hydration until the overlay is removed.
test('the page stays inert until the intro loader is removed, through the reveal', async ({ page }) => {
  await page.goto('/about', { waitUntil: 'domcontentloaded' });
  await page.locator(LOADER).waitFor({ state: 'attached' });
  await page.waitForFunction(() => document.querySelector('[inert]'));

  const result = await page.evaluate(
    (loader) =>
      new Promise((resolve) => {
        let frames = 0;
        let exposedFrames = 0;
        const tick = () => {
          if (!document.querySelector(loader)) return resolve({ frames, exposedFrames });
          frames += 1;
          if (!document.querySelector('[inert]')) exposedFrames += 1;
          requestAnimationFrame(tick);
        };
        tick();
      }),
    LOADER,
  );

  expect(result.frames, 'the loader was never sampled').toBeGreaterThan(0);
  expect(result.exposedFrames, 'frames where the overlay was up but the page was not inert').toBe(0);
});
