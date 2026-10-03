import { ALL_ROUTES, MISSING_ROUTE } from '../support/routes.js';
import { expect, settle, test } from '../support/test.js';

// Every route, on every engine and device (issue #92, L5). Tagged
// @cross-browser, so this file runs on Chromium, WebKit, Firefox, a Pixel 7 and
// an iPhone 14. The error sentinel in ../support/test.js is armed throughout:
// a route that renders but throws, or logs a hydration mismatch, fails here.

test.describe('every route renders', { tag: '@cross-browser' }, () => {
  for (const path of ALL_ROUTES) {
    test(`${path} — 200, one <h1>, a real title, and no errors`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response.status()).toBe(200);
      await settle(page);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page).toHaveTitle(/\S/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('main')).toHaveCount(1);
    });

    test(`${path} — never scrolls sideways`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      // A horizontal scrollbar on a phone is the most common responsive
      // regression, and invisible on the desktop where it is written.
      const overflow = await page.evaluate(() => {
        const root = document.scrollingElement;
        return root.scrollWidth - root.clientWidth;
      });
      expect(overflow, `${path} is ${overflow}px wider than the viewport`).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('unknown routes', { tag: '@cross-browser' }, () => {
  test.use({ allowedErrors: [[/status of 404/]] });

  test('answer a real 404 with the site’s own page and a way home', async ({ page }) => {
    const response = await page.goto(MISSING_ROUTE);
    expect(response.status()).toBe(404);
    await settle(page);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('a[href="/"]').first()).toBeAttached();
  });
});

test.describe('moving around', () => {
  test('the ⌘K palette navigates, and history goes back and forward', async ({ page, browserName }) => {
    await page.goto('/uses');
    await settle(page);
    await page.keyboard.press(browserName === 'webkit' ? 'Meta+k' : 'Control+k');
    const search = page.getByRole('combobox', { name: 'Search commands' });
    await expect(search).toBeFocused();
    await search.fill('About');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/about$/, { timeout: 15_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/uses$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/about$/);
  });

  test('every internal link in the served HTML resolves', async ({ page, request }) => {
    const seen = new Set();
    for (const path of ALL_ROUTES) {
      await page.goto(path);
      const hrefs = await page.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href')));
      hrefs
        .map((h) => h.split('#')[0].split('?')[0])
        .filter((h) => h && !h.startsWith('/_next') && !h.startsWith('/api/'))
        .forEach((h) => seen.add(h));
    }
    const broken = [];
    for (const href of seen) {
      const res = await request.get(href, { maxRedirects: 5 });
      if (res.status() >= 400) broken.push(`${href} → ${res.status()}`);
    }
    expect(broken).toEqual([]);
  });
});
