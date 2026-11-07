import { describe, expect, it } from 'vitest';

import { codeOnly, read, walk } from '../support/source.js';

// "No skipped tests on main" (issue #92, principle 6), enforced instead of hoped.
//
// A committed `.only` silently turns a 1,000-test suite into a one-test suite
// that still reports green. A committed `.skip` is a test everyone stops seeing.
// Both are the kind of mistake review misses precisely because the diff is one
// word long. So this suite reads every test file and fails on either.
//
// The one sanctioned way to park a genuinely flaky browser test is Playwright's
// `@quarantine` tag with a linked issue: it still RUNS nightly, it is just not a
// merge gate. That is visible and has an owner; a `.skip` is neither.

const TEST_FILES = walk('tests', /\.(test|spec)\.jsx?$/);

// Comments AND literal contents blanked, line structure kept. Several suites
// carry test source as fixture text inside strings (the /uses case counter is
// tested on exactly the modifiers banned here), and that text is data, not a
// test this runner will execute.
const codeOf = (file) => codeOnly(read(file));

describe('test hygiene', () => {
  it('finds the suites it is policing', () => {
    expect(TEST_FILES.length).toBeGreaterThan(90);
  });

  it('commits no focused, skipped or placeholder tests', () => {
    const banned =
      /\b(?:it|test|describe|suite|bench)\s*\.\s*(only|skip|todo|fixme)\b|\bx(?:it|describe|test)\s*\(|\bf(?:it|describe)\s*\(/g;
    const offenders = TEST_FILES.flatMap((file) => {
      const code = codeOf(file);
      return [...code.matchAll(banned)].map(
        (m) => `${file}:${code.slice(0, m.index).split('\n').length}  ${m[0]}`,
      );
    });
    expect(offenders).toEqual([]);
  });

  it('lets FC_RUNS reach every property: no hard-coded numRuns', () => {
    // A literal count opts a property out of the nightly soak without anyone
    // noticing; `runs(n)` keeps n as the everyday count and still soaks it.
    const offenders = TEST_FILES.filter((file) => file.startsWith('tests/property/')).flatMap((file) =>
      codeOf(file)
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /numRuns\s*:(?!\s*runs\()/.test(line))
        .map(({ n }) => `${file}:${n}`),
    );
    expect(offenders).toEqual([]);
  });

  it('links every quarantined test to an issue', () => {
    // This file names the tag in its own matcher, so it is the one exemption.
    const policed = TEST_FILES.filter((file) => file !== 'tests/fitness/testHygiene.test.js');
    const offenders = policed.flatMap((file) =>
      // Literal contents kept this time: the tag lives in a test's title.
      codeOnly(read(file), { blankStrings: false })
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /@(webkit-)?quarantine/.test(line) && !/#\d+|issues\/\d+/.test(line))
        .map(({ n }) => `${file}:${n}`),
    );
    expect(offenders).toEqual([]);
  });
});
