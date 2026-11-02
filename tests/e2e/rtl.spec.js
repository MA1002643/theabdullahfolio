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

  // The contact name field is dir="auto", and FireInput paints its value in a
  // flex overlay. The overlay's `dir` once sat on the text child only, which
  // reorders the glyphs but leaves the container's flex-start on the PAGE's
  // side: an Arabic name on /contact painted at the left while the caret sat
  // right, and a Latin name on /ar/contact the reverse. Measured, not read
  // from attributes: which edge of the field the painted copy hugs.
  for (const [path, value, edge] of [
    ['/contact', 'محمد عبدالله', 'right'],
    ['/ar/contact', 'Muhammad', 'left'],
  ]) {
    test(`${path}: a ${edge === 'right' ? 'right-to-left' : 'left-to-right'} name paints at the caret's edge`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const input = page.locator('input#name');
      await input.scrollIntoViewIfNeeded();
      await input.fill(value);
      const gap = await input.evaluate((el) => {
        const field = el.getBoundingClientRect();
        const text = el.parentElement.querySelector('.fire-input-overlay-text').getBoundingClientRect();
        return { left: text.left - field.left, right: field.right - text.right };
      });
      // The near edge is just the field's padding; the far one is most of its width.
      expect(gap[edge]).toBeLessThan(gap[edge === 'right' ? 'left' : 'right']);
    });
  }

  // A value longer than the field has to keep its END in view as it is typed
  // (the input's own scroll-to-caret is off, because its text is transparent,
  // so FireInput pins the scroll itself). The pin once assumed left-to-right:
  // `scrollLeft = scrollWidth`, which a right-to-left field clamps to 0, its
  // START, so a long Arabic name scrolled off the left past the caret.
  for (const [path, word, end] of [
    ['/contact', 'عبدالله ', 'left'],
    ['/ar/contact', 'Abdullah ', 'right'],
  ]) {
    test(`${path}: a long ${end === 'left' ? 'right-to-left' : 'left-to-right'} name keeps its end in view`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const input = page.locator('input#name');
      await input.scrollIntoViewIfNeeded();
      await input.fill(word.repeat(12).trim());
      const gap = await input.evaluate((el) => {
        const field = el.getBoundingClientRect();
        const text = el.parentElement.querySelector('.fire-input-overlay-text').getBoundingClientRect();
        return { left: text.left - field.left, right: field.right - text.right };
      });
      const start = end === 'left' ? 'right' : 'left';
      // The start overflows the field; the end sits inside it, within the padding.
      expect(gap[start]).toBeLessThan(0);
      expect(gap[end]).toBeGreaterThanOrEqual(-1);
      expect(gap[end]).toBeLessThan(40);
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
