import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { calculateRank } from '@/utils/rankCalculator';

import { runs } from '../support/fastCheckRuns.js';

// Differential testing of the GitHub rank (issue #92, L2 × L10).
//
// Why this file exists: the first Stryker run scored rankCalculator.js at
// 73.8%. Twenty-one mutants survived, every one inside the maths (the erf
// coefficients, the medians, `x / median` flipped to `x * median`), because the
// property suite checks the rank's SHAPE (bounded, monotonic, ordered ladder)
// and a corrupted formula keeps that shape perfectly well. Nothing checked the
// VALUE.
//
// An oracle does. This is an independent implementation of the same published
// model (github-readme-stats' rank: weighted exponential and log-normal CDFs)
// with erf computed a DIFFERENT way, by its Maclaurin series to machine
// precision rather than the production code's Abramowitz-Stegun 7.1.26
// approximation. Two implementations sharing a bug would have to share it by
// coincidence. A&S 7.1.26 is accurate to 1.5e-7, so the two may differ only in
// the far decimals; the percentile is rounded to 0.01, so any real mutation
// shows up as a difference well above that.

/** erf by its Maclaurin series: 2/√π Σ (-1)^n x^(2n+1) / (n! (2n+1)). */
function erfSeries(x) {
  if (Math.abs(x) > 5) return Math.sign(x); // erf(5) = 1 - 1.5e-12
  let sum = 0;
  let term = x; // x^(2n+1) / n!, with sign
  for (let n = 0; n < 200; n += 1) {
    const add = term / (2 * n + 1);
    sum += add;
    if (Math.abs(add) < 1e-17) break;
    term *= (-x * x) / (n + 1);
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
}

const expCdf = (x) => 1 - Math.exp(-x);
const logNormalCdf = (x) => (x > 0 ? 0.5 + 0.5 * erfSeries(Math.log(x) / Math.SQRT2) : 0);

/** The reference model, written from the published weights and medians. */
function referencePercentile({ all_commits, commits, prs, issues, reviews, stars, followers }) {
  const parts = [
    [2, expCdf(commits / (all_commits ? 1000 : 250))],
    [3, expCdf(prs / 50)],
    [1, expCdf(issues / 25)],
    [1, expCdf(reviews / 2)],
    [4, logNormalCdf(stars / 50)],
    [1, logNormalCdf(followers / 10)],
  ];
  const total = parts.reduce((s, [w]) => s + w, 0);
  const rank = 1 - parts.reduce((s, [w, v]) => s + w * v, 0) / total;
  return rank * 100;
}

// Realistic-to-large accounts, including zero, where the CDFs change fastest.
const count = fc.oneof(fc.nat({ max: 60 }), fc.nat({ max: 5000 }), fc.nat({ max: 200_000 }));
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

describe('calculateRank — differential against an independent oracle', () => {
  it('agrees with the reference model to the displayed precision, everywhere', () => {
    fc.assert(
      fc.property(statsArb, (input) => {
        const got = Number(calculateRank(input).percentile);
        // A&S 7.1.26's error (≤1.5e-7 on erf) moves the percentile by far less
        // than 0.005, so the only tolerance needed is the rounding itself.
        expect(Math.abs(got - referencePercentile(input))).toBeLessThanOrEqual(0.006);
      }),
      { numRuns: runs(2000) },
    );
  });

  it('pins a few hand-checked accounts exactly (a readable failure, if the oracle ever drifts too)', () => {
    const zero = { commits: 0, prs: 0, issues: 0, reviews: 0, repos: 0, stars: 0, followers: 0 };
    // Every stat at its median: each exponential CDF is 1 - 1/e, each
    // log-normal CDF is 0.5. rank = 1 - (7(1 - 1/e) + 5(0.5)) / 12.
    const atMedian = { all_commits: true, commits: 1000, prs: 50, issues: 25, reviews: 2, repos: 0, stars: 50, followers: 10 };
    const expected = (1 - (7 * (1 - Math.exp(-1)) + 5 * 0.5) / 12) * 100;
    expect(calculateRank(atMedian).percentile).toBe(expected.toFixed(2));
    expect(calculateRank({ ...zero, all_commits: true }).percentile).toBe('100.00');
    // all_commits switches the commit median from 250 to 1000.
    const c = { ...zero, commits: 250 };
    expect(Number(calculateRank({ ...c, all_commits: false }).percentile)).toBeLessThan(
      Number(calculateRank({ ...c, all_commits: true }).percentile),
    );
  });

  it('maps the pinned percentiles onto the right rungs', () => {
    const zero = { all_commits: true, commits: 0, prs: 0, issues: 0, reviews: 0, repos: 0, stars: 0, followers: 0 };
    expect(calculateRank(zero).level).toBe('C');
    const atMedian = { all_commits: true, commits: 1000, prs: 50, issues: 25, reviews: 2, repos: 0, stars: 50, followers: 10 };
    // ≈ 42.28%, inside (37.5, 50] → B+.
    expect(calculateRank(atMedian).level).toBe('B+');
  });
});
