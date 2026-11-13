import { MISSING_ROUTE } from '../support/routes.js';
import { expect, settle, test } from '../support/test.js';

// The sitewide ⌘K palette (issue #41) on the production build: one palette on
// the homepage, a sub-page and the 404; keyboard navigation through it; the
// floating trigger for visitors with no keyboard; and Ask, end to end in the
// browser, against a routed NDJSON answer (the test server has no gateway
// credential, and must never reach one).
//
// Reduced motion, as in navigation.spec.js: the static Ember Passage keeps a
// software-rendered CI runner from starving the main thread mid-navigation.

const hotkey = (browserName) => (browserName === 'webkit' ? 'Meta+k' : 'Control+k');
const palette = (page) => page.getByRole('dialog', { name: 'Command palette' });
const search = (page) => page.getByRole('combobox', { name: 'Search commands' });

// An agent run, as /api/ask streams it: a live check, a cited answer whose
// sources include one the palette must refuse (off-site), and follow-ups.
const ndjson = (events) => events.map((e) => `${JSON.stringify(e)}\n`).join('');
const ANSWER = ndjson([
  { type: 'meta', facts: 42, model: 'anthropic/claude-haiku-5.5' },
  { type: 'step', id: 't1', tool: 'get_github_activity', status: 'running' },
  { type: 'step', id: 't1', tool: 'get_github_activity', status: 'done', data: { live: true, commits: 1502, contributionsLastYear: 1809, longestStreakDays: 253 } },
  { type: 'text', text: 'He built AfaaqX, a multi-tenant business system ' },
  { type: 'source', id: 'P2', kind: 'project', href: '/projects/2', label: 'AfaaqX' },
  { type: 'cite', id: 'P2' },
  { type: 'text', text: ', with Stripe payments.' },
  { type: 'source', id: 'X', kind: 'page', href: 'https://evil.example/' },
  { type: 'cite', id: 'X' },
  { type: 'followups', questions: ['What did he test?'] },
  { type: 'done', ms: 3900, steps: 1 },
]);
const FIT = ndjson([
  { type: 'meta', facts: 42, model: 'anthropic/claude-haiku-5.5' },
  { type: 'source', id: 'P1', kind: 'project', href: '/projects/1', label: 'theabdullahfolio' },
  { type: 'fit-row', row: { requirement: 'React and Next.js', verdict: 'strong', evidence: 'A Next.js 16 portfolio.', sources: ['P1'] } },
  { type: 'fit-row', row: { requirement: 'AWS', verdict: 'gap', evidence: '', sources: [] } },
  { type: 'done', ms: 3000, steps: 2 },
]);
const JOB = `Senior Frontend Engineer. React, TypeScript, Next.js, accessibility and AWS. ${'You will own features end to end. '.repeat(8)}`;

test.describe('the sitewide ⌘K palette', { tag: '@cross-browser' }, () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  const opensOn = async (page, browserName, path) => {
    await page.goto(path);
    await settle(page);
    await page.keyboard.press(hotkey(browserName));
    await expect(palette(page)).toBeVisible();
    await expect(search(page)).toBeFocused();
    // The site's own groups arrive with the deferred copy.
    await expect(page.getByRole('option', { name: /AfaaqX/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toHaveCount(0);
  };

  for (const path of ['/', '/projects']) {
    test(`opens on ${path}`, ({ page, browserName }) => opensOn(page, browserName, path));
  }

  test.describe('on the 404', () => {
    // The document's own 404 status is logged by the browser as a failed
    // resource; that is the point of the page (navigation.spec.js allows it
    // the same way).
    test.use({ allowedErrors: [[/status of 404/]] });
    test('opens on a missing route', ({ page, browserName }) => opensOn(page, browserName, MISSING_ROUTE));
  });

  test('jumps to a project by keyboard alone', async ({ page, browserName }) => {
    await page.goto('/about');
    await settle(page);
    await page.keyboard.press(hotkey(browserName));
    await search(page).fill('afaaq');
    await expect(page.getByRole('option', { name: /AfaaqX/ })).toHaveAttribute('aria-selected', 'true');
    await search(page).press('Enter');
    await expect(page).toHaveURL(/\/projects\/2$/, { timeout: 15_000 });
  });

  test('a page’s own commands appear only on that page', async ({ page, browserName }) => {
    await page.goto('/uses');
    await settle(page);
    await page.keyboard.press(hotkey(browserName));
    await search(page).fill('bill of materials');
    await expect(page.getByRole('option', { name: /Bill of materials/ })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/about');
    await settle(page);
    await page.keyboard.press(hotkey(browserName));
    await search(page).fill('bill of materials');
    await expect(page.getByRole('option', { name: /Bill of materials/ })).toHaveCount(0);
  });

  test('Ask shows its live check, a cited answer, and links only to real pages', async ({ page, browserName }) => {
    await page.route('**/api/ask', (route) =>
      route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ANSWER }),
    );
    await page.goto('/about');
    await settle(page);
    await page.keyboard.press(hotkey(browserName));
    await search(page).fill('Has he used Stripe?');
    await expect(page.getByRole('option', { name: /^Ask Claude/ })).toBeVisible();
    await search(page).press('ArrowUp');
    await search(page).press('Enter');

    const field = page.getByRole('combobox', { name: 'Your question' });
    await expect(field).toBeFocused();
    await expect(page.getByRole('region', { name: 'Steps taken' })).toContainText('1,502 commits');
    await expect(page.getByRole('region', { name: 'Answer' })).toContainText('with Stripe payments.');
    const options = page.getByRole('listbox', { name: 'Sources and follow-up questions' }).getByRole('option');
    // One source (the off-site one is refused) and one follow-up.
    await expect(options).toHaveCount(2);
    await expect(options.first()).toContainText('AfaaqX');
    await expect(page.getByText(/42 facts · 1 live check/)).toBeVisible();

    await field.press('ArrowDown');
    await field.press('Enter');
    await expect(page).toHaveURL(/\/projects\/2$/, { timeout: 15_000 });
  });

  test('the fit check assesses a pasted job description', async ({ page, browserName }) => {
    await page.route('**/api/ask', (route) =>
      route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: FIT }),
    );
    await page.goto('/about');
    await settle(page);
    await page.keyboard.press(hotkey(browserName));
    await page.getByRole('option', { name: 'Check a job description against his experience' }).click();
    const field = page.getByRole('textbox', { name: 'Job description' });
    await expect(field).toBeFocused();
    await field.fill(JOB);
    await page.getByRole('button', { name: 'Check fit' }).click();
    const results = page.getByRole('region', { name: 'Requirements' });
    await expect(results).toContainText('1 strong · 0 partial · 1 not shown');
    await expect(results.getByRole('listitem')).toHaveCount(2);
    await results.getByRole('button', { name: 'theabdullahfolio' }).click();
    await expect(page).toHaveURL(/\/projects\/1$/, { timeout: 15_000 });
  });
});

test.describe('the palette trigger on a phone', { tag: '@cross-browser' }, () => {
  // No `isMobile`: Firefox does not support it, and nothing here needs it.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('opens the palette without a keyboard', async ({ page }) => {
    await page.goto('/projects');
    await settle(page);
    const trigger = page.getByRole('button', { name: /^Search & Ask/ });
    await expect(trigger).toBeVisible();
    const box = await trigger.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await trigger.tap();
    await expect(palette(page)).toBeVisible();
    // No horizontal overflow from the dialog at phone width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
