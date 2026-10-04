import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { runs, SOAK_RUNS } from '../support/fastCheckRuns.js';

// The soak reaches every property suite (issue #92, L2). The nightly job sets
// FC_RUNS=20000 and calls it a soak of the whole property layer; this pins that
// the global default really comes from the setup file, so a suite with no
// count of its own is soaked too. A count written into a suite is policed by
// tests/fitness/testHygiene.test.js.

describe('fast-check run settings', () => {
  it('applies the shared default to every property that names no count', () => {
    expect(fc.readConfigureGlobal().numRuns).toBe(runs(100));
  });

  it('treats FC_RUNS as a floor, never a cap', () => {
    expect(runs(5000)).toBe(Math.max(5000, SOAK_RUNS));
    expect(runs(1)).toBeGreaterThanOrEqual(SOAK_RUNS);
  });
});
