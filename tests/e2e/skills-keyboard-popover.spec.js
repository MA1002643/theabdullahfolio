import { expect, settle, test } from '../support/test.js';

// The About skills card's repository panel under a keyboard, in FULL motion.
//
// Keyboard focus on an icon opens its repository panel, and in the scrub stage
// focus also drives the scroll (revealFocusedIcon): an icon that has not slid
// in yet is scrolled into the stage one frame after it takes focus. The panel
// closes on any scroll, because its anchor rect is frozen. The first cut opened
// the panel at focus time, from the icon's off-stage rect, and the reveal's own
// scroll reached the close-on-scroll listener a frame later: tabbing to an icon
// that needed scrolling dismissed its panel the instant it appeared. The panel
// now opens once the reveal has settled, from the icon's final rect.

// The desktop stage is about a thousand pixels wide, so a realistic two-dozen
// row can fit it outright; sixty is comfortably more than any viewport here.
// The slugs need not be real: the hermetic browser answers every icon request
// with a transparent pixel.
const SLUGS = Array.from({ length: 60 }, (_, i) => `lang${i}`);

// One long category, so the row overflows the stage and its tail starts
// off-screen. Private-only repo counts are enough to make every icon a
// disclosure button, without inventing repository URLs.
const PAYLOAD = {
  categories: {
    languages: SLUGS.map((slug) => ({
      slug,
      displayName: slug.toUpperCase(),
      source: 'skillicons',
      repos: [],
      privateRepoCount: 1,
    })),
    frameworks: [],
    libraries: [],
    tools: [],
    software: [],
  },
  diff: { added: [], removed: [] },
  fetchedAt: '2026-01-01T00:00:00.000Z',
};

test('tabbing to an off-stage skill icon reveals it and keeps its repository panel open', async ({ page }) => {
  await page.route('**/api/github-skills*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAYLOAD) }),
  );
  await page.goto('/about');
  await settle(page);

  const last = SLUGS[SLUGS.length - 1];
  const tile = page.locator(`[data-slug="${last}"] [data-skill-row]`);
  await expect(tile).toHaveCount(1, { timeout: 20_000 });
  // Bring the STAGE into view, not the tile: scrolling the tile into view
  // would scroll the nested scroller too, and the scrub would reveal the icon
  // before the test begins.
  await tile.evaluate((el) => el.closest('.overflow-y-auto').scrollIntoView({ block: 'center' }));

  // Precondition: the icon really is off the stage, or this tests nothing.
  const stageEdge = (el) => {
    const stage = el.closest('.overflow-y-auto').getBoundingClientRect();
    const icon = el.getBoundingClientRect();
    return { iconLeft: icon.left, iconRight: icon.right, stageLeft: stage.left, stageRight: stage.right };
  };
  const before = await tile.evaluate(stageEdge);
  expect(before.iconLeft, 'the last icon should start beyond the stage').toBeGreaterThanOrEqual(before.stageRight);

  // A Tab keydown is what puts the card in keyboard modality; then arrive on
  // the off-stage icon directly, as a Tab from its neighbour would.
  await page.keyboard.press('Tab');
  await tile.focus();

  const panel = page.locator('[data-skill-popover]');
  await expect(panel).toBeVisible();
  await expect(tile).toHaveAttribute('aria-expanded', 'true');

  // Still open well after the reveal's scroll has landed (the defect closed it
  // within a frame or two), and the icon it belongs to is now on the stage.
  await page.waitForTimeout(800);
  await expect(panel).toBeVisible();
  await expect(tile).toHaveAttribute('aria-expanded', 'true');
  const after = await tile.evaluate(stageEdge);
  // 1px of slack: the scrub rounds its translate to whole pixels (crisp icons).
  expect(after.iconRight).toBeLessThanOrEqual(after.stageRight + 1);
  expect(after.iconLeft).toBeGreaterThanOrEqual(after.stageLeft - 1);
});
