import { describe, expect, it } from 'vitest';

import GitHubStatsCard from '@/components/about/StatsCard';
import StreakStatsCard from '@/components/about/StreakStatsCard';
import ReadmeStatsCard from '@/components/about/RepoStatsCard';
import { renderWithIntl } from '../support/intl';

// The /about data cards read their copy from About.json and paint numbers and
// API dates in the reader's locale (issue #82). English assertions pin the
// text the cards rendered before the move; the Persian ones pin STRUCTURE —
// the catalogue has no Persian yet, so the words fall back to English, but the
// digits and dates must already be Persian (extended Arabic-Indic digits are
// fa's CLDR default, so they are a reliable signal on every ICU build).

const STATS = { stars: 1234, commits: 50, prs: 2, issues: 1, contributedTo: 3, level: 'A', percentile: '20.00' };
const STREAKS = {
  totalContributions: { value: 420, dateRange: 'Oct 26, 2025 - Present' },
  currentStreak: { value: 0, dateRange: 'No current streak' },
  longestStreak: { value: 12, dateRange: 'Mar 1, 2025 - Mar 12, 2025' },
};
const REPO = {
  name: 'theabdullahfolio',
  description: 'No description',
  language: 'Unknown',
  languageColor: '#f1e05a',
  stars: 1500,
  forks: 2,
  mergedPRs: 3,
  commitCount: 4,
  pushedAt: 'Oct 12, 2024',
  activityScore: 42,
};

const srTexts = (container) => [...container.querySelectorAll('.sr-only')].map((n) => n.textContent);

describe('GitHub Stats card', () => {
  it('renders the English labels and possessive title unchanged', () => {
    const { container, getByText } = renderWithIntl(<GitHubStatsCard data={STATS} userName="MA" />);
    expect(container.querySelector('h2').getAttribute('aria-label') ?? container.querySelector('h2').textContent).toBe(
      "MA's GitHub Stats",
    );
    for (const label of ['Total Stars Earned', 'Total Commits (last year)', 'Total PRs', 'Total Issues', 'Contributed to (last year)']) {
      expect(getByText(label)).toBeTruthy();
    }
    expect(getByText('Rank')).toBeTruthy();
    expect(srTexts(container)).toContain('1,234');
  });

  it('falls back to "GitHub User" when the account has no display name', () => {
    const { container } = renderWithIntl(<GitHubStatsCard data={STATS} />);
    const h2 = container.querySelector('h2');
    expect(h2.getAttribute('aria-label') ?? h2.textContent).toBe("GitHub User's GitHub Stats");
  });

  it('paints the figures in Persian digits under fa', () => {
    const { container } = renderWithIntl(<GitHubStatsCard data={STATS} userName="MA" />, { locale: 'fa' });
    expect(srTexts(container)).toContain(new Intl.NumberFormat('fa').format(1234));
  });
});

describe('Contribution Streaks card', () => {
  it('shows the API ranges verbatim in English', () => {
    const { getByText } = renderWithIntl(<StreakStatsCard data={STREAKS} />);
    expect(getByText('Oct 26, 2025 - Present')).toBeTruthy();
    expect(getByText('No current streak')).toBeTruthy();
    expect(getByText('Total Contributions')).toBeTruthy();
    expect(getByText('Current Streak')).toBeTruthy();
    expect(getByText('Longest Streak')).toBeTruthy();
  });

  it('speaks the ring with an ICU plural', () => {
    const { container } = renderWithIntl(<StreakStatsCard data={STREAKS} />);
    // Current 0 of a 12-day best.
    expect(srTexts(container)).toContain('0 days, 0 percent of your longest streak');
  });

  it('re-renders the English wire dates for a Persian reader', () => {
    const { container } = renderWithIntl(<StreakStatsCard data={STREAKS} />, { locale: 'fa' });
    expect(container.textContent).not.toContain('Mar 1, 2025');
    const start = new Intl.DateTimeFormat('fa', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
      .format(new Date(Date.UTC(2025, 2, 1)));
    expect(container.textContent).toContain(start);
  });
});

describe('Most Active Repository card', () => {
  it('keeps the English labels and wire placeholders unchanged', () => {
    const { container, getByText } = renderWithIntl(<ReadmeStatsCard data={REPO} />);
    for (const label of ['Most Active Repository', 'Stars', 'Forks', 'Merged PRs', 'Total Commits', 'Last Pushed', 'Activity Score', 'score']) {
      expect(getByText(label)).toBeTruthy();
    }
    expect(getByText('No description')).toBeTruthy();
    expect(getByText('Unknown')).toBeTruthy();
    expect(srTexts(container)).toContain('1,500');
    expect(srTexts(container)).toContain('Oct 12, 2024');
  });

  it('re-renders the pushed-at date for a Persian reader but never the repo name', () => {
    const { container } = renderWithIntl(<ReadmeStatsCard data={REPO} />, { locale: 'fa' });
    expect(container.textContent).not.toContain('Oct 12, 2024');
    expect(container.querySelector('h3').getAttribute('aria-label') ?? container.querySelector('h3').textContent).toBe(
      'theabdullahfolio',
    );
  });
});
