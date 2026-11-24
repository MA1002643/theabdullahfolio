import { projectsLinksFixture } from '../support/fixtures/projects.js';
import { expect, settle, test } from '../support/test.js';

// The project pages' outbound links (issue #92, formerly tracked as K3).
//
// "Live Demo" and "GitHub" were rendered on every project page by a component
// that took `href` and ignored it: two buttons that did nothing. They are now
// real links in the case study's hero (issue #31), inside a navigation
// landmark named for the project. (Until #31 there was also a pointer-only
// copy on the 3D laptop screen; the scene is gone.)

for (const { path, name, demo, source, privateRepo } of projectsLinksFixture()) {
  if (!source) {
    // A private project: its repository answers 404 to visitors, so no link
    // to it may render, and with nothing to link to there is no links landmark.
    test(`${path} publishes no link to its private repository`, { tag: '@cross-browser' }, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      await expect(page.getByRole('navigation', { name: `${name} links` })).toHaveCount(0);
      await expect(page.locator(`a[href^="${privateRepo}"]`)).toHaveCount(0);
    });
    continue;
  }

  test(`${path} links to its real ${demo ? 'demo and ' : ''}source`, { tag: '@cross-browser' }, async ({ page }) => {
    await page.goto(path);
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
  await page.goto('/projects/theabdullahfolio');
  await settle(page);
  await expect(page.locator('a[href="#"]')).toHaveCount(0);
});
