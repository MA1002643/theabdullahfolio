import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { calculateRank } from '@/utils/rankCalculator';

import { runs } from '../support/fastCheckRuns.js';

// The GitHub rank on the About page's stats card, as invariants (issue #92, L2).
//
// `calculateRank` is a weighted blend of exponential and log-normal CDFs, the
// latter through an Abramowitz-Stegun approximation of erf. Hand-picked
// examples pin a few points on that surface; properties pin its SHAPE, over
// inputs from zero to far beyond any real account.
//
// Lower percentile = better (it is "top X%").

const LEVELS = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'];
const THRESHOLDS = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
const STATS = ['commits', 'prs', 'issues', 'reviews', 'stars', 'followers'];

const count = fc.nat({ max: 5_000_000 });
const statsArb = fc.record({
  all_commits: fc.boolean(),
  commits: count,
  prs: count,
  issues: count,
  reviews: count,
  repos: count,
  stars: count,
  followers: count,
});

const pct = (input) => Number(calculateRank(input).percentile);

describe('calculateRank — properties', () => {
  it('returns a percentile in [0, 100] with exactly two decimals', () => {
    fc.assert(
      fc.property(statsArb, (input) => {
        const { percentile } = calculateRank(input);
        expect(percentile).toMatch(/^\d{1,3}\.\d{2}$/);
        expect(Number(percentile)).toBeGreaterThanOrEqual(0);
        expect(Number(percentile)).toBeLessThanOrEqual(100);
      }),
    );
  });

  it('is monotonic: improving any single stat never worsens the rank', () => {
    fc.assert(
      fc.property(statsArb, fc.constantFrom(...STATS), fc.integer({ min: 1, max: 1_000_000 }), (input, stat, delta) => {
        const better = { ...input, [stat]: input[stat] + delta };
        expect(pct(better)).toBeLessThanOrEqual(pct(input));
      }),
    );
  });

  it('maps the DISPLAYED percentile onto the level ladder exactly', () => {
    // The badge must agree with the number printed beside it. This was a
    // tolerance check (±one rung) until a seed found "62.50%" ranked B-, one
    // rung off; the level is now derived from the rounded percentile, so the
    // check is exact.
    fc.assert(
      fc.property(statsArb, (input) => {
        const { level, percentile } = calculateRank(input);
        const expected = LEVELS[THRESHOLDS.findIndex((t) => Number(percentile) <= t)] ?? 'C';
        expect(level).toBe(expected);
      }),
      { numRuns: runs(5000) },
    );
  });

  it('keeps the regression account self-consistent', () => {
    const r = calculateRank({ all_commits: false, commits: 2205, prs: 1, issues: 20, reviews: 30, repos: 0, stars: 8, followers: 20 });
    expect(r.percentile).toBe('62.50');
    expect(r.level).toBe('B'); // 62.50 is the top of B's rung (50, 62.5]
  });

  it('orders levels with percentiles: a better percentile never earns a worse level', () => {
    fc.assert(
      fc.property(statsArb, statsArb, (a, b) => {
        const ra = calculateRank(a);
        const rb = calculateRank(b);
        if (Number(ra.percentile) < Number(rb.percentile)) {
          expect(LEVELS.indexOf(ra.level)).toBeLessThanOrEqual(LEVELS.indexOf(rb.level));
        }
      }),
    );
  });

  it('is deterministic and ignores `repos` (accepted for API compatibility, unweighted)', () => {
    fc.assert(
      fc.property(statsArb, count, (input, repos) => {
        expect(calculateRank(input)).toEqual(calculateRank({ ...input }));
        expect(calculateRank({ ...input, repos })).toEqual(calculateRank(input));
      }),
    );
  });

  it('anchors the extremes: nothing is the bottom rung, everything is S', () => {
    const zero = Object.fromEntries(STATS.map((s) => [s, 0]));
    expect(calculateRank({ ...zero, all_commits: true })).toEqual({ level: 'C', percentile: '100.00' });
    const huge = Object.fromEntries(STATS.map((s) => [s, 1e9]));
    expect(calculateRank({ ...huge, all_commits: true }).level).toBe('S');
  });
});
