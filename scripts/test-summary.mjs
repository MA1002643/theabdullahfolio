#!/usr/bin/env node
/**
 * Test results → the GitHub Actions run summary (issue #92, L11).
 *
 *   node scripts/test-summary.mjs vitest                 JUnit + coverage table
 *   node scripts/test-summary.mjs playwright "<title>"   JUnit table, flaky tests named
 *
 * A third argument names a different JUnit file. A job that runs Playwright
 * twice gives the second run its own (PLAYWRIGHT_JUNIT_FILE, read by
 * playwright.config.mjs) and summarises each, so neither report replaces the
 * other.
 *
 * A green tick on a job says the suite passed; it does not say what ran. This
 * writes the numbers where a reviewer looks first: how many tests per suite,
 * how long they took, which were retried into passing (flaky: reported, never
 * hidden), and the coverage against its ratcheted floor. Reads only the files
 * the runners already wrote; outside CI it prints the same Markdown to stdout.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { flakyTestNames } from './junit-flaky.mjs';

const [kind = 'vitest', title, junitArg] = process.argv.slice(2);
const junitFile =
  junitArg ?? (kind === 'vitest' ? 'test-results/vitest-junit.xml' : 'test-results/playwright-junit.xml');

/** Minimal JUnit reader: per-suite counts and time, plus retried test names. */
function readJunit(file) {
  if (!existsSync(file)) return null;
  const xml = readFileSync(file, 'utf8');
  const attr = (tag, name) => Number(tag.match(new RegExp(`${name}="([\\d.]+)"`))?.[1] ?? 0);
  const suites = [...xml.matchAll(/<testsuite\b[^>]*>/g)].map(([tag]) => ({
    name: tag.match(/name="([^"]*)"/)?.[1] ?? '?',
    tests: attr(tag, 'tests'),
    failures: attr(tag, 'failures') + attr(tag, 'errors'),
    skipped: attr(tag, 'skipped'),
    time: attr(tag, 'time'),
  }));
  // Tests that failed and then passed on retry, named so they get fixed.
  return { suites, flaky: flakyTestNames(xml) };
}

const lines = [`### ${title ?? (kind === 'vitest' ? 'Vitest' : 'Playwright')}`, ''];
const junit = readJunit(junitFile);
if (!junit) {
  lines.push(`_No JUnit report at \`${junitFile}\`; the run did not get far enough to write one._`);
} else {
  const total = junit.suites.reduce(
    (acc, s) => ({ tests: acc.tests + s.tests, failures: acc.failures + s.failures, skipped: acc.skipped + s.skipped, time: acc.time + s.time }),
    { tests: 0, failures: 0, skipped: 0, time: 0 },
  );
  lines.push(
    `**${total.tests - total.failures - total.skipped} passed**, ${total.failures} failed, ${total.skipped} skipped, in ${total.time.toFixed(1)} s across ${junit.suites.length} files.`,
    '',
  );
  if (kind === 'vitest') {
    // Group files by Vitest project (the directory under tests/).
    const byProject = {};
    for (const s of junit.suites) {
      const project = s.name.match(/tests\/([^/]+)\//)?.[1] ?? 'other';
      byProject[project] ??= { files: 0, tests: 0, failures: 0 };
      byProject[project].files += 1;
      byProject[project].tests += s.tests;
      byProject[project].failures += s.failures;
    }
    lines.push('| Project | Files | Tests | Failed |', '|---|---:|---:|---:|');
    for (const [project, r] of Object.entries(byProject).sort()) {
      lines.push(`| ${project} | ${r.files} | ${r.tests} | ${r.failures ? `❌ ${r.failures}` : '0'} |`);
    }
    lines.push('');
  }
  if (junit.flaky.length) {
    lines.push(`⚠️ **${junit.flaky.length} flaky** (failed, then passed on retry). Fix these; do not ignore them:`, '');
    junit.flaky.forEach((name) => lines.push(`- ${name}`));
    lines.push('');
  }
}

if (kind === 'vitest' && existsSync('coverage/coverage-summary.json')) {
  const { total } = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
  lines.push('| Coverage | % | Covered / total |', '|---|---:|---:|');
  for (const metric of ['lines', 'statements', 'functions', 'branches']) {
    const m = total[metric];
    lines.push(`| ${metric} | ${m.pct.toFixed(2)} | ${m.covered} / ${m.total} |`);
  }
  lines.push('');
}

const markdown = `${lines.join('\n')}\n`;
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
