// How many runs each fast-check property makes (issue #92, L2).
//
// Every property suite takes its count from here, through `runs()`, and the
// rest inherit `fc.configureGlobal` from tests/support/setup-property.js, which
// reads the same function. So `FC_RUNS` reaches EVERY property in the suite.
// Before this, only the guestbook paging test read the variable; the redaction
// and diff suites stayed at fast-check's default of 100 and the rank suites at
// their own 5,000 and 2,000, so the nightly "20,000-run soak" soaked one file.
//
// `FC_RUNS` is a floor, never a cap: a property that already makes more runs
// every day keeps them, and an unset variable changes nothing.

/** The soak floor from `FC_RUNS`, or 0 when it is unset or not a number. */
export const SOAK_RUNS = Number(process.env.FC_RUNS) || 0;

/** A property's everyday run count, raised to the soak floor when one is set. */
export const runs = (everyday) => Math.max(everyday, SOAK_RUNS);
