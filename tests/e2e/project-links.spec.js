import { projectsLinksFixture } from '../support/fixtures/projects.js';
import { expect, settle, test } from '../support/test.js';

// The project pages' outbound links (issue #92, formerly tracked as K3).
//
// "Live Demo" and "GitHub" were rendered on every project page by a component
// that took `href` and ignored it: two buttons that did nothing. They are now
// real links, in two places on purpose: pointer-only copies on the 3D laptop
// screen, and an accessible pair in normal flow (the intro), because a link
// projected with CSS 3D transforms is not where its layout box says it is.

for (const { id, name, demo, source } of projectsLinksFixture()) {
  test(`/projects/${id} links to its real ${demo ? 'demo and ' : ''}source`, { tag: '@cross-browser' }, async ({ page }) => {
    await page.goto(`/projects/${id}`);
    await settle(page);
    const nav = page.getByRole('navigation', { name: `${name} links` });
    const sourceLink = nav.getByRole('link', { name: /Source on GitHub/ });
    await expect(sourceLink).toHaveAttribute('href', source);
    await expect(sourceLink).toHaveAttribute('target', '_blank');
    await expect(sourceLink).toHaveAttribute('rel', /noopener/);
    if (demo) {
      await expect(nav.getByRole('link', { name: /Live demo/ })).toHaveAttribute('href', demo);
    } else {
      // No live site: no second link pretending the repo is a demo.
      await expect(nav.getByRole('link', { name: /Live demo/ })).toHaveCount(0);
    }
    // The pair is reachable by keyboard.
    await sourceLink.focus();
    await expect(sourceLink).toBeFocused();
  });
}

test('no link on a project page points nowhere', async ({ page }) => {
  await page.goto('/projects/1');
  await settle(page);
  await page.waitForTimeout(3000); // the laptop boot sequence, then its buttons
  await expect(page.locator('a[href="#"]')).toHaveCount(0);
});
