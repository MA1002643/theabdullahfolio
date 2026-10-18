#!/usr/bin/env node
/**
 * The browser-test count /uses publishes, taken from Playwright itself (#92).
 *
 *   node scripts/count-browser-cases.mjs           rewrite tests/browser-cases.json
 *   node scripts/count-browser-cases.mjs --check   fail if it is out of date (CI)
 *
 * `/uses` once counted browser tests by reading the spec files' text for
 * `test(...)` calls. Most browser tests are GENERATED (one per route, per
 * width, per project fixture), so a loop that registers 32 tests read as 2:
 * `axe.spec.js` counted 2 of its 32, `navigation.spec.js` 5 of its 33. This
 * asks the runner instead: `playwright test --list` collects every test the
 * way a run would, generators expanded, without starting a browser or the
 * server.
 *
 * Why a committed file rather than counting at build: the count is read by
 * `src/lib/uses/buildFacts.js` during `next build`, and loading the test runner
 * and every spec there would put Playwright in the site's build. So the figure
 * is written here, and `--check` in CI fails any PR that changes the browser
 * tests without regenerating it. The figure on the page cannot drift.
 *
 * A test is counted once however many projects run it (the same spec on
 * Chromium and a Pixel 7 is one test, run twice), quarantined tests included
 * (they are still tests), and the visual project included whether or not this
 * machine can render it. The image warm-up is setup, not a test, and is left
 * out.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = 'tests/browser-cases.json';
const check = process.argv.includes('--check');

const listed = JSON.parse(
  execFileSync('npx', ['playwright', 'test', '--list', '--reporter=json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, VISUAL: '1', PW_INCLUDE_QUARANTINE: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
);

const tests = new Set();
const files = new Set();
const byDir = {};
function collect(suite, trail) {
  for (const spec of suite.specs ?? []) {
    if (spec.file.startsWith('warmup/')) continue;
    const id = `${spec.file} › ${[...trail, spec.title].join(' › ')}`;
    if (tests.has(id)) continue;
    tests.add(id);
    files.add(spec.file);
    const dir = `tests/${spec.file.split('/')[0]}`;
    byDir[dir] = (byDir[dir] ?? 0) + 1;
  }
  for (const child of suite.suites ?? []) {
    // A file's own suite is titled with its path; only describe blocks name a level.
    const named = child.title && !child.title.endsWith('.js');
    collect(child, named ? [...trail, child.title] : trail);
  }
}
for (const suite of listed.suites ?? []) collect(suite, []);

const counts = {
  suites: files.size,
  cases: tests.size,
  byDir: Object.fromEntries(Object.entries(byDir).sort(([a], [b]) => a.localeCompare(b))),
};
const next = `${JSON.stringify(counts, null, 2)}\n`;

if (check) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    // Missing counts as stale.
  }
  if (current !== next) {
    console.error(
      `${OUT} is out of date: Playwright collects ${counts.cases} browser tests in ${counts.suites} files.\n` +
        'Run `npm run test:count` and commit the result; /uses publishes this figure.',
    );
    process.exit(1);
  }
  console.log(`${OUT} is current: ${counts.cases} browser tests in ${counts.suites} files.`);
} else {
  writeFileSync(OUT, next);
  console.log(`Wrote ${OUT}: ${counts.cases} browser tests in ${counts.suites} files.`);
}
