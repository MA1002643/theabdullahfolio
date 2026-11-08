import { expect, settle, test } from '../support/test.js';

// The homepage language selector on a phone (owner report, 2026-11-07).
//
// Two faults on the deployed site. Tapping the trigger focused the search
// field, which raised the keyboard over a list the visitor meant to scroll.
// And the field's text was 14px: iOS Safari zooms the page into a focused
// input smaller than 16px, after which the sheet could be scrolled sideways.
// Chromium does not reproduce the zoom itself, so this pins the two things
// that prevent it (a 16px field, nothing wider than the screen) and measures
// the panel against the viewport, not against its own classes.
//
// @cross-browser: the zoom is Safari's, so this has to run in mobile Safari
// (and mobile Chrome) rather than only on desktop Chromium. No `isMobile`
// override, which Firefox does not support: the explicit viewport and
// `hasTouch` give every project the tap conditions, and the two mobile
// projects keep the rest of their device settings.

// Everything that must fit: the document, the panel, and the list inside it.
async function widths(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.locale-panel').getBoundingClientRect();
    const list = document.querySelector('.locale-panel [role="listbox"]');
    return {
      viewport: window.innerWidth,
      documentScroll: document.documentElement.scrollWidth,
      panelLeft: panel.left,
      panelRight: panel.right,
      listScroll: list.scrollWidth,
      listClient: list.clientWidth,
      scrollX: window.scrollX,
    };
  });
}

function expectInsideViewport(w) {
  expect(w.documentScroll).toBeLessThanOrEqual(w.viewport);
  expect(w.panelLeft).toBeGreaterThanOrEqual(0);
  expect(w.panelRight).toBeLessThanOrEqual(w.viewport);
  expect(w.listScroll).toBeLessThanOrEqual(w.listClient);
  expect(w.scrollX).toBe(0);
}

// Below 16px, iOS Safari zooms the page into the focused field.
async function expectNoZoomFontSize(field) {
  const fontSize = await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);
}

test.describe('language selector on a phone', { tag: '@cross-browser' }, () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    contextOptions: { reducedMotion: 'reduce' },
  });

  for (const path of ['/', '/ar']) {
    test(`${path}: a tap opens the list without focusing the search field`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const trigger = page.locator('button.locale-trigger').first();
      await trigger.tap();

      const list = page.locator('.locale-panel [role="listbox"]');
      await expect(list).toBeVisible();
      await expect(list).toBeFocused();
      const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedTag).not.toBe('INPUT');
      expectInsideViewport(await widths(page));
    });

    test(`${path}: tapping the search field keeps the list inside the screen`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      await page.locator('button.locale-trigger').first().tap();
      const field = page.locator('.locale-panel [role="combobox"]');
      await field.tap();
      await expect(field).toBeFocused();

      await expectNoZoomFontSize(field);
      expectInsideViewport(await widths(page));

      // A swipe across the list moves nothing sideways.
      const list = page.locator('.locale-panel [role="listbox"]');
      await list.evaluate((el) => el.scrollBy({ left: 200 }));
      expect(await list.evaluate((el) => el.scrollLeft)).toBe(0);

      await field.fill('deu');
      await expect(page.locator('.locale-panel [role="option"]')).toHaveCount(1);
      expectInsideViewport(await widths(page));
    });

    // Touch together with a hardware keyboard (a tablet with a keyboard
    // case): after the tap the listbox has focus, and Shift+Tab must reach the
    // search field just before it with the panel still open, not close it.
    test(`${path}: Shift+Tab from the tapped list reaches search, panel open`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const trigger = page.locator('button.locale-trigger').first();
      await trigger.tap();
      const list = page.locator('.locale-panel [role="listbox"]');
      await expect(list).toBeFocused();

      await page.keyboard.press('Shift+Tab');
      const field = page.locator('.locale-panel [role="combobox"]');
      await expect(field).toBeFocused();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(list).toBeVisible();

      // And the field works as the search it is.
      await page.keyboard.type('deu');
      await expect(page.locator('.locale-panel [role="option"]')).toHaveCount(1);
    });

    // Same visitor, choosing from the list: ArrowDown then Space selects the
    // highlighted language, as Enter does, rather than scrolling the list.
    test(`${path}: ArrowDown then Space on the tapped list switches language`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const before = new URL(page.url()).pathname;
      await page.locator('button.locale-trigger').first().tap();
      const list = page.locator('.locale-panel [role="listbox"]');
      await expect(list).toBeFocused();

      await page.keyboard.press('ArrowDown');
      const highlighted = await list.getAttribute('aria-activedescendant');
      const code = highlighted.split('-opt-').pop();
      await page.keyboard.press(' ');

      await expect(page.locator('.locale-panel')).toHaveCount(0);
      await expect.poll(() => new URL(page.url()).pathname).not.toBe(before);
      expect(new URL(page.url()).pathname).toBe(code === 'en' ? '/' : `/${code}`);
    });
  }
});

// An iPhone turned sideways is 844px wide, past the `sm` line, so it gets the
// anchored panel rather than the bottom sheet. The field was 14px from `sm` up,
// and a tap on it zoomed the page there just as it once did in portrait.
test.describe('language selector on a phone in landscape', { tag: '@cross-browser' }, () => {
  test.use({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    contextOptions: { reducedMotion: 'reduce' },
  });

  for (const path of ['/', '/ar']) {
    test(`${path}: tapping the search field keeps it at 16px and the list inside the screen`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      await page.locator('button.locale-trigger').first().tap();
      const field = page.locator('.locale-panel [role="combobox"]');
      await field.tap();
      await expect(field).toBeFocused();

      await expectNoZoomFontSize(field);
      expectInsideViewport(await widths(page));
    });
  }
});
