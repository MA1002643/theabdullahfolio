import { createRequire } from 'node:module';
import AxeBuilder from '@axe-core/playwright';

import { ALL_ROUTES, LOCALIZED_ROUTES, MISSING_ROUTE } from '../support/routes.js';
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

// axe's label-in-name check (WCAG 2.5.3) first drops any text it takes for an
// icon-font ligature: it draws the text's first character alone and calls the
// text an icon if its pixels differ by more than `pixelThreshold` (15%). In a
// script that SHAPES — Arabic, where a letter's isolated form is not its
// joined initial form — that is true of nearly every word, so axe threw away
// the visible words and reported /ar/about's projects card as a mismatch when
// its name contains them verbatim (measured 2026-11-01: with the heuristic off,
// the visible text is a contiguous prefix of the name). This site draws every
// icon as SVG and loads no icon font, so for shaped-script locales the
// heuristic is switched off rather than the rule: 2.5.3 is still checked on
// every word.
const SHAPED_SCRIPT_LOCALES = new Set(['ar', 'fa', 'ur']);
const shapedScript = (path) => SHAPED_SCRIPT_LOCALES.has(path.split('/')[1]);
// This builder version has no `configure()`, so the check option rides in on
// the axe source it injects — resolved from the builder's own location, so it
// is exactly the copy (and version) the builder would inject itself.
const fromRoot = createRequire(`${process.cwd()}/package.json`);
const axeCore = createRequire(fromRoot.resolve('@axe-core/playwright'))('axe-core');
const SHAPED_AXE_SOURCE = `${axeCore.source};axe.configure({ checks: [{ id: 'label-content-name-mismatch', options: { pixelThreshold: 1 } }] });`;

async function scan(page, path, label, testInfo, { offered = false } = {}) {
  await page.goto(path);
  await settle(page);
  // On a localized page this English-speaking browser is offered English
  // (LocaleSuggestion), after a chunk import that can land mid-scan; axe then
  // measured the card part-way through its fade-in and reported contrast it
  // never has at rest (intermittent, /ja/journey and /ar/about, 2026-11-01).
  // The offer is certain here — fresh context, no stored choice — so wait for
  // it to finish arriving, which also makes the card part of every localized
  // scan rather than of some.
  if (offered) {
    const offer = page.locator('aside[role="region"][lang="en"]');
    await offer.waitFor({ state: 'visible', timeout: 15_000 });
    await expect.poll(() => offer.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  }
  const builder = new AxeBuilder(
    shapedScript(path) ? { page, axeSource: SHAPED_AXE_SOURCE } : { page },
  ).withTags(TAGS);
  const results = await builder.analyze();
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

    // The same scan in Arabic and Japanese (tests/support/routes.js says why
    // those two). Right to left and CJK change what axe measures — contrast on
    // a different font stack, a mirrored layout's focus order, `lang` on the
    // document and on every English island — so an English pass says nothing
    // about them.
    for (const { path } of LOCALIZED_ROUTES) {
      test(`${path} has no WCAG 2.2 AA violations`, async ({ page }, testInfo) => {
        await scan(page, path, label, testInfo, { offered: true });
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
