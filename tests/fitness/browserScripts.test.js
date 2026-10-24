import { describe, expect, it } from 'vitest';

import { read, stripComments } from '../support/source.js';

// Two promises the browser suites make that no browser test can check, because
// both break before (or after) a single test runs.
//
// 1. Every documented `npm run test:*` that drives Playwright serves the site
//    with `next start`, which needs a production build. A script that skips the
//    build works on a machine that happened to build earlier and fails on a
//    fresh checkout before collecting a test. CI calls `npx playwright test`
//    after its own build step, so it never sees this.
// 2. CI retries a failing browser test and promises to NAME every test that
//    only passed on retry (scripts/test-summary.mjs). The JUnit reporter leaves
//    retried attempts out unless `includeRetries` is on, and then the summary
//    silently names nothing.

const scripts = JSON.parse(read('package.json')).scripts;

describe('browser test scripts', () => {
  it('build before every npm script that runs Playwright', () => {
    const runners = Object.entries(scripts).filter(([, cmd]) =>
      /\bplaywright test\b/.test(cmd),
    );
    expect(runners.length).toBeGreaterThan(5);
    const unbuilt = runners
      .filter(([, cmd]) => {
        const build = cmd.indexOf('npm run build');
        return build === -1 || build > cmd.indexOf('playwright test');
      })
      .map(([name]) => name);
    expect(unbuilt).toEqual([]);
  });
});

describe('CI JUnit reporter', () => {
  // Read, not imported: loading the config pulls in all of @playwright/test,
  // which is seconds of import for one option. Comments are blanked so the
  // explanation beside the option cannot satisfy the check.
  it('records retried attempts, so the run summary can name flaky tests', () => {
    const config = stripComments(read('playwright.config.mjs'));
    const junit = config.match(/\[\s*'junit',\s*\{[^}]*\}/)?.[0];
    expect(junit).toMatch(/\bincludeRetries:\s*true\b/);
  });
});

describe('published Vitest count', () => {
  // Vitest 5 made `vitest list` parse files statically by default, which
  // cannot expand an `it.each` over a list built at collection time: the
  // count /uses publishes fell from 1,391 to 1,114. Comments are blanked so
  // the explanation in the script cannot satisfy the check.
  it('collects tests by running the files, not by parsing their text', () => {
    const script = stripComments(read('scripts/count-vitest-cases.mjs'));
    expect(script).toMatch(/'--staticParse=false'/);
  });
});
