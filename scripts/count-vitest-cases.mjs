#!/usr/bin/env node
/**
 * The Vitest count /uses publishes, taken from Vitest itself (#92).
 *
 *   node scripts/count-vitest-cases.mjs           rewrite tests/vitest-cases.json
 *   node scripts/count-vitest-cases.mjs --check   fail if it is out of date (CI)
 *
 * The browser count's sibling (scripts/count-browser-cases.mjs), for the same
 * reason. `/uses` used to count the Vitest layers by reading the test files'
 * text, and a static read cannot expand what the runner expands: an
 * `it.each(files)` over a list built at collection time (routeSegmentConfig
 * runs one case per app source file) or a table held in a variable
 * (contactContract) each read as ONE case. So the plate published a figure no
 * run ever reported. `vitest list` collects every test the way a run would,
 * tables expanded, without running a single one.
 *
 * That holds only with `--staticParse=false`. Vitest 5 made static parsing the
 * default for `list`, and that is the text read this script exists to avoid:
 * under it the count fell from 1,391 to 1,114 (fitness 120 → 34), every
 * `it.each` over a list built at collection time read as one case again.
 *
 * Committed rather than counted at build for the reason the browser count is:
 * `src/lib/uses/buildFacts.js` runs inside `next build`, and collecting every
 * suite there would put the test runner, jsdom and MSW in the site's build.
 * `--check` in CI fails any PR that changes the Vitest suites without
 * regenerating the file, so the figure on the page cannot drift.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const OUT = 'tests/vitest-cases.json';
const check = process.argv.includes('--check');

const scratch = mkdtempSync(path.join(tmpdir(), 'vitest-list-'));
const listFile = path.join(scratch, 'list.json');
let listed;
try {
  execFileSync('npx', ['vitest', 'list', '--staticParse=false', `--json=${listFile}`], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, CI: '1' },
  });
  listed = JSON.parse(readFileSync(listFile, 'utf8'));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// Every entry is one collected test in one project. No file belongs to two
// projects here, so nothing is counted twice.
const files = new Set();
const byProject = {};
for (const test of listed) {
  files.add(path.relative(process.cwd(), test.file));
  byProject[test.projectName] = (byProject[test.projectName] ?? 0) + 1;
}

const counts = {
  suites: files.size,
  cases: listed.length,
  byProject: Object.fromEntries(Object.entries(byProject).sort(([a], [b]) => a.localeCompare(b))),
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
      `${OUT} is out of date: Vitest collects ${counts.cases} tests in ${counts.suites} files.\n` +
        'Run `npm run test:count` and commit the result; /uses publishes this figure.',
    );
    process.exit(1);
  }
  console.log(`${OUT} is current: ${counts.cases} Vitest tests in ${counts.suites} files.`);
} else {
  writeFileSync(OUT, next);
  console.log(`Wrote ${OUT}: ${counts.cases} Vitest tests in ${counts.suites} files.`);
}
