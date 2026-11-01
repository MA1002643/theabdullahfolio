import { expect, settle, test } from '../support/test.js';

// Left-to-right islands in a right-to-left page (issue #82 follow-up).
//
// On /ar the footer's email address once printed backwards — `moc.liamg@…` —
// because each glyph of its hover effect is an inline-block, and inline-blocks
// are bidi-neutral: in an RTL paragraph they are laid out right to left. It was
// fixed with `dir="ltr"` on DecipherEmail, but found by the owner, not by CI,
// because no browser test visited a right-to-left page. This reads the address
// the way a sighted visitor does — glyph by glyph, in the order they sit on
// screen — and compares it with the address itself.
//
// Tagged @cross-browser: bidi resolution is the engine's, and WebKit and
// Firefox are exactly where an RTL layout differs from Chromium's.

// The glyphs of a per-character effect, joined in VISUAL order (left to right).
async function visualText(locator) {
  return locator.evaluate((root) =>
    [...root.querySelectorAll('.hover-text__char')]
      .map((el) => ({ x: el.getBoundingClientRect().left, ch: el.dataset.char }))
      .sort((a, b) => a.x - b.x)
      .map((g) => (g.ch === ' ' ? ' ' : g.ch))
      .join(''),
  );
}

test.describe('left-to-right content in a right-to-left page', { tag: '@cross-browser' }, () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  for (const path of ['/ar/about', '/about']) {
    test(`${path}: the footer email reads left to right, in order`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const email = page.locator('.hover-text--decipher').first();
      await email.scrollIntoViewIfNeeded();
      // The address as text — the screen-reader twin beside the effect.
      const address = (await email.locator('xpath=following-sibling::span[1]').textContent()).trim();
      expect(address).toMatch(/^\S+@\S+\.\S+$/);
      expect(await visualText(email)).toBe(address);
    });
  }

  test('/ar/about: the footer terminal keeps its handles left to right', async ({ page }) => {
    await page.goto('/ar/about');
    await settle(page);
    const terminal = page.locator('.footer-term');
    await terminal.scrollIntoViewIfNeeded();
    await expect(terminal).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });
});
