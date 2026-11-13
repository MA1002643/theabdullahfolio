// Mutation testing (issue #92, L10): tests that test the tests.
//
// Stryker makes small deliberate bugs in the modules below (flips `<` to
// `<=`, deletes a branch, swaps `&&` for `||`, empties a string) and re-runs
// the Vitest suites against each one. A mutant the suites still pass on is a
// bug they would not have caught. Line coverage cannot tell you that: a line
// can run under a test that asserts nothing about it.
//
// The modules are the ones where a silent bug is most expensive: the log
// redaction and constant-time compare that guard credentials, the guestbook
// paging and cursor codec, the About page's change detection and rank, and
// the contact client's retry classification. Run it with `npm run
// test:mutation`; it takes minutes, so CI runs it nightly, not per PR.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.mjs' },
  mutate: [
    'src/app/api/_utils/redact.js',
    'src/app/api/_utils/cronAuth.js',
    'src/lib/guestbook/paging.js',
    'src/lib/guestbook/cursor.js',
    'src/utils/diffChanges.js',
    'src/utils/rankCalculator.js',
    'src/lib/contact.js',
    'src/lib/optionalChunk.js',
    // Issue #41: the palette's ranked matcher and the Ask wire format — both
    // pure, both pinned by fast-check properties as well as examples.
    'src/lib/palette/match.js',
    'src/lib/ask/protocol.js',
  ],
  // perTest: each mutant re-runs only the tests that executed its line, so a
  // mutant costs seconds, not the whole 1,200-test estate.
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  // The ratchet, in the same spirit as the coverage thresholds: `break` sits
  // under the score measured when this was introduced, so the nightly fails if
  // the suites get WEAKER. Measured 2026-09-29 over these eight modules: 87.2%
  // (it was 79.6% before the rank oracle and the contact-client suite; the
  // first run found both gaps). Most remaining survivors are equivalent
  // mutants, e.g. `x > 0` → `x >= 0` where both sides give the same value.
  thresholds: { high: 90, low: 80, break: 85 },
  incremental: true,
  incrementalFile: 'reports/mutation/stryker-incremental.json',
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
