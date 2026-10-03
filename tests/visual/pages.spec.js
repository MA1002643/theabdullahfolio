import { expect, settle, test } from '../support/test.js';

// Visual regression (issue #92, L7). Screenshot baselines of the views whose
// look is STABLE: documents and the form at rest, not the WebGL hero or the
// live GitHub panels, whose pixels change by design.
//
// Baselines are rendered in the official Playwright Linux container, never on a
// Mac (font rasterisation differs by a pixel per glyph), which is why this
// project only exists on Linux (playwright.config.mjs). To update them after an
// intended visual change:
//
//     npm run test:visual:update      # runs the same container via Docker
//
// then review every changed PNG in the PR diff and say why it changed.
// Animations are disabled and reduced motion is on; anything that still
// varies run to run (live times, counters) is masked, so a diff means the
// layout or styling genuinely moved.

const VIEWS = [
  { name: 'cv', path: '/cv' },
  { name: 'privacy', path: '/privacy' },
  { name: 'notes-index', path: '/notes' },
  { name: 'contact', path: '/contact' },
];

// Content that legitimately differs between runs.
const MASKS = ['time', '[data-live]', '[aria-live]', 'canvas', 'video'];

for (const { name, path } of VIEWS) {
  test(`${name} matches its baseline`, async ({ page }) => {
    await page.goto(path);
    await settle(page);
    await page.waitForTimeout(3000); // past every entrance, even under reduced motion
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
      mask: MASKS.map((selector) => page.locator(selector)),
      maxDiffPixelRatio: 0.002,
    });
  });
}

test.describe('the 404 page', () => {
  test.use({ allowedErrors: [[/status of 404/]] });
  test('matches its baseline', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-92');
    await settle(page);
    await page.waitForTimeout(3000);
    await expect(page).toHaveScreenshot('not-found.png', {
      animations: 'disabled',
      caret: 'hide',
      mask: MASKS.map((selector) => page.locator(selector)),
      maxDiffPixelRatio: 0.002,
    });
  });
});
