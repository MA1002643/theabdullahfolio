import { describe, expect, it } from 'vitest';

import { computeRepoDiff } from '@/utils/repoDiff';
import { computeStatsDiff } from '@/utils/statsDiff';
import { computeStreakDiff } from '@/utils/streakDiff';
import { diffLanguages } from '@/utils/languageDiff';

// The /about "what changed since your last visit" banners (issue #82).
//
// Their sentences moved from template literals into `About.changes.*` ICU
// messages so every language can phrase them. These cases pin the ENGLISH they
// render to the literal strings the template literals produced before the
// move — the plural "commit"/"commits", the signed "+5"/"-20", the " | " and
// " · " joins, and the absence of a thousands separator — so the refactor is
// provably invisible in English.

describe('computeRepoDiff — English is unchanged', () => {
  const base = {
    name: 'theabdullahfolio',
    nameWithOwner: 'MA1002643/theabdullahfolio',
    stars: 3,
    forks: 1,
    commitCount: 1200,
    mergedPRs: 10,
    activityScore: 50,
    language: 'JavaScript',
  };

  it('announces a switch of most-active repository', () => {
    const next = { ...base, nameWithOwner: 'MA1002643/culina', name: 'culina' };
    expect(computeRepoDiff(base, next)).toMatch(/^Most active repository changed to "MA1002643\/culina"$|^Most active repository changed to "culina"$/);
  });

  it('joins every moved field with " · ", pluralising and signing as before', () => {
    const next = { ...base, stars: 5, forks: 0, commitCount: 1201, mergedPRs: 12, activityScore: 47, language: 'TypeScript' };
    expect(computeRepoDiff(base, next)).toBe(
      'Stars increased by 2 (now 5) · Forks decreased by 1 (now 0) · 1 new commit pushed · ' +
        '2 PRs merged · Activity score decreased by 3 (now 47) · Primary language changed to "TypeScript"',
    );
  });

  it('prints large counts without a thousands separator, as the template did', () => {
    expect(computeRepoDiff(base, { ...base, commitCount: 2400 })).toBe('1200 new commits pushed');
  });

  it('reports nothing when nothing moved', () => {
    expect(computeRepoDiff(base, { ...base })).toBeNull();
  });
});

describe('computeStatsDiff — English is unchanged', () => {
  it('signs each delta and joins with " | "', () => {
    const prev = { stars: 10, commits: 500, prs: 3, issues: 4, contributedTo: 2 };
    const next = { stars: 15, commits: 480, prs: 3, issues: 5, contributedTo: 2 };
    const diff = computeStatsDiff(prev, next);
    expect(diff.hasChanged).toBe(true);
    expect(diff.summaryMessage).toBe('Total Stars +5 | Total Commits -20 | Total Issues +1');
  });
});

describe('computeStreakDiff — English is unchanged', () => {
  it('notes a moved range when its count held', () => {
    const prev = { longestStreak: { value: 10, dateRange: 'Jan 1 - Jan 10' } };
    const next = { longestStreak: { value: 10, dateRange: 'Feb 1 - Feb 10' } };
    expect(computeStreakDiff(prev, next).summaryMessage).toBe('Longest Streak dates changed');
  });

  it('reports counts first and suppresses a dates note its count already covers', () => {
    const prev = {
      totalContributions: { value: 900, dateRange: 'Oct 12, 2024 - Present' },
      currentStreak: { value: 3, dateRange: 'Oct 20 - Oct 22' },
      longestStreak: { value: 10, dateRange: 'Jan 1 - Jan 10' },
    };
    const next = {
      ...prev,
      totalContributions: { value: 905, dateRange: 'Oct 12, 2024 - Present' },
      currentStreak: { value: 4, dateRange: 'Oct 20 - Oct 23' },
    };
    expect(computeStreakDiff(prev, next).summaryMessage).toBe('Total Contributions +5 | Current Streak +1');
  });
});

describe('diffLanguages — the rank summary still renders', () => {
  it('describes a reorder without throwing', () => {
    const prev = [
      { language: 'JavaScript', percentage: '50.00' },
      { language: 'TypeScript', percentage: '40.00' },
    ];
    const next = [
      { language: 'TypeScript', percentage: '50.00' },
      { language: 'JavaScript', percentage: '40.00' },
    ];
    expect(() => diffLanguages(prev, next)).not.toThrow();
  });
});
