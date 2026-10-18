import { expect, settle, test } from '../support/test.js';

// The privacy notice's page-wide Escape (issue #92, formerly tracked as K1).
//
// On the homepage, which does not scroll, the bottom-sheet notice can sit over
// controls a keyboard user is tabbing through. WCAG 2.4.11 allows covering
// content only if it can be dismissed WITHOUT moving focus, so Escape now
// declines and closes it from anywhere: but as a last resort, never stealing
// the key from something else that owns it.
//
// @cross-browser: these are journeys every visitor can take, so they run on
// WebKit, Firefox and both phones too, not desktop Chromium alone. WebKit is
// also the only engine that takes the palette test's ⌘K (Meta) branch.

const notice = (page) => page.getByRole('region', { name: 'Privacy notice' });

async function openWithNotice(page, path) {
  await page.goto(path);
  await settle(page);
  await expect(notice(page)).toBeVisible({ timeout: 15_000 });
}

test.describe('privacy notice Escape', { tag: '@cross-browser' }, () => {
  test('Escape closes the notice from anywhere, as a decline, without moving focus', async ({ page }) => {
    await openWithNotice(page, '/');
    // Focus something on the page that is NOT inside the notice.
    await page.keyboard.press('Tab');
    const focusedBefore = await page.evaluate(() => {
      document.activeElement.dataset.escProbe = '1';
      return !document.activeElement.closest('[aria-label="Privacy notice"]');
    });
    expect(focusedBefore).toBe(true);

    // Escape is a LAST resort: if the focused control opened something of its
    // own (the homepage's first stop opens the maintenance popover on focus),
    // the first press closes that, and the next one the notice. Never more than
    // a couple of presses, and focus never moves.
    for (let press = 0; press < 3 && (await notice(page).count()) > 0; press += 1) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
    await expect(notice(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement.dataset.escProbe)).toBe('1');
    // Escape means DECLINE (#141), never accept.
    const records = await page.evaluate(() =>
      Object.values(localStorage).filter((v) => v.includes('"analytics"')),
    );
    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0]).analytics).toBe(false);
  });

  test('Escape belongs to the ⌘K palette while it is open, not to the notice', async ({ page, browserName }) => {
    await openWithNotice(page, '/uses');
    await page.keyboard.press(browserName === 'webkit' ? 'Meta+k' : 'Control+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
    await expect(notice(page)).toBeVisible(); // untouched: the palette owned that key
  });

  test('Escape on the 404 page goes home and does NOT also decline', async ({ page, expectErrors }) => {
    // The 404 shortcut listens on window, which runs after the notice's document
    // listener, so the notice must wait for dispatch to end before deciding.
    expectErrors(/status of 404/); // the browser logs the 404 document itself
    await openWithNotice(page, '/no-such-page-escape-probe');
    await page.keyboard.press('Escape');
    await page.waitForURL((url) => url.pathname === '/');
    const records = await page.evaluate(() =>
      Object.values(localStorage).filter((v) => v.includes('"analytics"')),
    );
    expect(records).toHaveLength(0); // the press went home; consent was never answered
    await expect(notice(page)).toBeVisible({ timeout: 15_000 });
  });

  test('Escape while typing in a field leaves the notice alone', async ({ page }) => {
    await openWithNotice(page, '/contact');
    await page.getByLabel('Full Name', { exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(notice(page)).toBeVisible();
  });
});
