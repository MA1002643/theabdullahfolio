import AxeBuilder from '@axe-core/playwright';

import { ALL_ROUTES, MISSING_ROUTE } from '../support/routes.js';
import { expect, settle, test } from '../support/test.js';

// axe-core over every route, at a desktop and a phone width (issue #92, L6).
//
// Lighthouse CI already holds accessibility at 100 on six routes, but
// Lighthouse runs a SUBSET of axe's rules, on six pages, at one width. This is
// the whole WCAG 2.0/2.1/2.2 A+AA rule set on every page, at both widths.
//
// Reduced motion is on for the scan, and that is not a way of dodging a
// finding: several headings reveal by fading in from opacity 0, and axe
// measuring contrast mid-fade reports a colour the reader never sees at rest.
// Motion is audited separately (motion.spec.js), and the colour-contrast rule
// still runs, against the settled page.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const WIDTHS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

// Inside contextOptions: this Playwright has no top-level `reducedMotion`
// test option, and a top-level key is silently ignored (the first run of
// this suite scanned with motion ON because of exactly that).
test.use({
  contextOptions: { reducedMotion: 'reduce' },
});

async function scan(page, path, label, testInfo) {
  await page.goto(path);
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  await testInfo.attach('axe-results.json', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
  const summary = results.violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.help}\n    ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 5)
        .join('\n    ')}`,
  );
  expect(summary, `axe found violations on ${path} (${label})`).toEqual([]);
}

for (const [label, viewport] of Object.entries(WIDTHS)) {
  test.describe(`axe · ${label}`, () => {
    test.use({ viewport });

    for (const path of ALL_ROUTES) {
      test(`${path} has no WCAG 2.2 AA violations`, async ({ page }, testInfo) => {
        await scan(page, path, label, testInfo);
      });
    }

    test.describe('the 404 page', () => {
      // Its own document answers 404, which the browser logs; nothing else may.
      test.use({ allowedErrors: [[/status of 404/]] });
      test(`${MISSING_ROUTE} has no WCAG 2.2 AA violations`, async ({ page }, testInfo) => {
        await scan(page, MISSING_ROUTE, label, testInfo);
      });
    });
  });
}
