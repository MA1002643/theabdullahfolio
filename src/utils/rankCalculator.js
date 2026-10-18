// --- src/lib/calculateRank.js ---

// Error function approximation (Abramowitz and Stegun, formula 7.1.26)
function erf(x) {
    // Save the sign of x
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    // Constants
    const a1 = 0.254829592,
        a2 = -0.284496736,
        a3 = 1.421413741,
        a4 = -1.453152027,
        a5 = 1.061405429,
        p = 0.3275911;

    // A&S formula 7.1.26
    const t = 1 / (1 + p * x);
    const y =
        1 -
        (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) *
        t *
        Math.exp(-x * x);

    return sign * y; // erf(-x) = -erf(x)
}

// Exponential CDF
function exponential_cdf(x) {
    return 1 - Math.exp(-x);
}

// Log-normal CDF using erf approximation
function log_normal_cdf(x) {
    return x > 0 ? 0.5 + 0.5 * erf(Math.log(x) / Math.SQRT2) : 0;
}

export function calculateRank({
    all_commits,
    commits,
    prs,
    issues,
    reviews,
    repos,
    stars,
    followers,
}) {
    const COMMITS_MEDIAN = all_commits ? 1000 : 250,
        COMMITS_WEIGHT = 2;
    const PRS_MEDIAN = 50,
        PRS_WEIGHT = 3;
    const ISSUES_MEDIAN = 25,
        ISSUES_WEIGHT = 1;
    const REVIEWS_MEDIAN = 2,
        REVIEWS_WEIGHT = 1;
    const STARS_MEDIAN = 50,
        STARS_WEIGHT = 4;
    const FOLLOWERS_MEDIAN = 10,
        FOLLOWERS_WEIGHT = 1;

    const TOTAL_WEIGHT =
        COMMITS_WEIGHT +
        PRS_WEIGHT +
        ISSUES_WEIGHT +
        REVIEWS_WEIGHT +
        STARS_WEIGHT +
        FOLLOWERS_WEIGHT;

    const THRESHOLDS = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
    const LEVELS = ["S", "A+", "A", "A-", "B+", "B", "B-", "C+", "C"];

    const rank =
        1 -
        (COMMITS_WEIGHT * exponential_cdf(commits / COMMITS_MEDIAN) +
            PRS_WEIGHT * exponential_cdf(prs / PRS_MEDIAN) +
            ISSUES_WEIGHT * exponential_cdf(issues / ISSUES_MEDIAN) +
            REVIEWS_WEIGHT * exponential_cdf(reviews / REVIEWS_MEDIAN) +
            STARS_WEIGHT * log_normal_cdf(stars / STARS_MEDIAN) +
            FOLLOWERS_WEIGHT * log_normal_cdf(followers / FOLLOWERS_MEDIAN)) /
        TOTAL_WEIGHT;

    // The level is read off the percentile AS DISPLAYED (two decimals), not the
    // raw value (issue #92). The property suite found an account showing
    // "62.50%" with level B-: the raw 62.5000…1 sat just past the B threshold
    // (62.5) while the card printed a number on it, so the badge and the figure
    // beside it disagreed. Rounding first makes them agree by construction.
    const percentile = (rank * 100).toFixed(2);
    const level = LEVELS[THRESHOLDS.findIndex((t) => Number(percentile) <= t)] || "C";

    return {
        level,
        percentile,
    };
}
