import { parseGitHubText } from "@/utils/emoji";
import { calculateRank } from "@/utils/rankCalculator";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import fallbackStats from "@/data/github-stats-fallback.json";

const GITHUB_API = "https://api.github.com/graphql";
const TOKEN = process.env.GITHUB_TOKEN;
const REVALIDATE_SECONDS = 10 * 60;
const MOST_ACTIVE_REPO_REVALIDATE_SECONDS = 24 * 60 * 60;

// Derive the set of `owner/name` keys (lowercased) to skip when picking the
// "most active" feature repo. The GitHub profile-README repo — the one whose
// owner AND name both match the username — is always excluded, because every
// push there is a meta-edit of the about page itself and would otherwise
// artificially dominate the activity score. Keying by `owner/name` (not just
// `name`) means an unrelated repo with a coincidentally matching name owned
// by someone else is still scored normally.
const mostActiveRepoExclude = (username) => {
  const u = username.toLowerCase();
  return new Set([`${u}/${u}`]);
};

// The "most active repository" selection is far more expensive than the rest
// of the stats (it pages contribution breakdowns + per-repo commit history) and
// changes slowly, so it gets its own cache layer with a 24-hour TTL. The
// display-data cache continues to refresh every 10 minutes.
const getCachedMostActiveRepo = unstable_cache(
  async (username) => findMostActiveRepo(username),
  ["most-active-repo"],
  {
    revalidate: MOST_ACTIVE_REPO_REVALIDATE_SECONDS,
    tags: ["github-stats", "most-active-repo"],
  }
);

// Aggregated GitHub fetcher wrapped in Next's persistent data cache. The
// repo name is resolved by the scoring algorithm before each fresh fetch and
// cached separately at a 24-hour TTL — the display data still refreshes every
// 10 minutes against whatever repo the algorithm last picked.
const getCachedGithubStats = unstable_cache(
  async (username) => {
    const mostActiveRepo = await getCachedMostActiveRepo(username);
    const [languages, stats] = await Promise.all([
      getAllLanguages(username),
      fetchGitHubStats(
        username,
        mostActiveRepo?.owner ?? null,
        mostActiveRepo?.name ?? null,
        mostActiveRepo?.activityScore ?? 0
      ),
    ]);
    return {
      languages: languages.slice(0, 6),
      stats,
    };
  },
  ["github-stats"],
  { revalidate: REVALIDATE_SECONDS, tags: ["github-stats"] }
);

const CACHE_HEADERS = {
  "Cache-Control": `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=300, stale-if-error=86400`,
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "Missing 'username' query parameter." },
      { status: 400 }
    );
  }

  try {
    const data = await getCachedGithubStats(username);
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (error) {
    // Total upstream failure (rate limit, network, GraphQL error). Serve the
    // bundled snapshot so the about page never renders empty stat cards.
    console.error("GitHub stats fetch failed, serving fallback:", error);
    return NextResponse.json(
      { ...fallbackStats, _fallback: true },
      {
        headers: {
          ...CACHE_HEADERS,
          "X-Cache-Status": "FALLBACK",
        },
      }
    );
  }
}

async function getAllLanguages(username) {
  const query = `
    query($username: String!, $after: String) {
      user(login: $username) {
        repositories(
          first: 100,
          after: $after,
          ownerAffiliations: OWNER,
          isFork: false
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges {
                size
                node {
                  name
                  color
                }
              }
            }
          }
        }
      }
    }
  `;

  let hasNextPage = true;
  let endCursor = null;
  const languageStats = {};

  while (hasNextPage) {
    const response = await fetch(GITHUB_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ query, variables: { username, after: endCursor } }),
    });

    const json = await response.json();

    if (json.errors) {
      console.error("GraphQL errors:", json.errors);
      throw new Error("GitHub GraphQL query failed");
    }

    const repoData = json.data.user.repositories;
    const repos = repoData.nodes;

    // Aggregate sizes
    for (const repo of repos) {
      for (const { size, node } of repo.languages.edges) {
        if (!languageStats[node.name]) {
          languageStats[node.name] = { size: 0, color: node.color };
        }
        languageStats[node.name].size += size;
      }
    }

    hasNextPage = repoData.pageInfo.hasNextPage;
    endCursor = repoData.pageInfo.endCursor;
  }

  const totalSize = Object.values(languageStats).reduce(
    (sum, lang) => sum + lang.size,
    0
  );

  // Sort and convert to percentage
  return Object.entries(languageStats)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([language, info]) => ({
      language,
      color: info.color,
      size: info.size,
      percentage: ((info.size / totalSize) * 100).toFixed(2), // 2 decimal places
    }));
}

async function fetchGitHubStats(username, repoOwner, repoName, activityScore = 0) {
  // `hasRepo` gates the `repository` field via @include. When false, the
  // placeholder owner/name strings are never resolved against GitHub —
  // GraphQL still needs non-null values to satisfy the `String!` variable
  // contract, but @include(if: false) short-circuits before evaluation.
  const hasRepo = Boolean(repoOwner && repoName);
  const query = `
    query ($username: String!, $repoOwner: String!, $repoName: String!, $hasRepo: Boolean!) {
      user(login: $username) {
        name
        login
        createdAt
        followers { totalCount }
        repositories(first: 100, ownerAffiliations: OWNER) {
          nodes { name stargazerCount }
        }
        contributionsCollection {
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          totalRepositoriesWithContributedCommits
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount } }
          }
        }
      }
      repository(owner: $repoOwner, name: $repoName) @include(if: $hasRepo) {
        name
        description
        stargazerCount
        forkCount
        pushedAt
        watchers { totalCount }
        primaryLanguage { name color }
        issues(states: OPEN) { totalCount }
        closedIssues: issues(states: CLOSED) { totalCount }
        pullRequests(states: OPEN) { totalCount }
        mergedPRs: pullRequests(states: MERGED) { totalCount }
        defaultBranchRef {
          target {
            ... on Commit {
              history { totalCount }
            }
          }
        }
      }
    }
  `;

  const res = await fetch(GITHUB_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        username,
        // When hasRepo is false these are inert placeholders that satisfy
        // GraphQL's String! contract but never get resolved.
        repoOwner: repoOwner || username,
        repoName: repoName || username,
        hasRepo,
      },
    }),
  });

  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message);
  const user = json.data.user;
  if (!user) throw new Error("User not found");

  // today
  const today = new Date().toISOString().split("T")[0];
  const currentYear = new Date().getFullYear();

  // Helper to format dates
  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    const showYear = date.getFullYear() !== currentYear;
    const options = { month: "short", day: "numeric", ...(showYear && { year: "numeric" }) };
    return date.toLocaleDateString("en-US", options);
  };

  // Total stars
  const totalStars = user.repositories.nodes.reduce(
    (sum, repo) => sum + repo.stargazerCount,
    0
  );

  const {
    totalCommitContributions: commits,
    totalPullRequestContributions: prs,
    totalIssueContributions: issues,
    totalRepositoriesWithContributedCommits: contributedTo,
    contributionCalendar,
  } = user.contributionsCollection;

  const followers = user.followers.totalCount;
  const totalContributions = contributionCalendar.totalContributions;

  // Compute streaks
  const { currentStreak, longestStreak } = computeStreaks(contributionCalendar);

  // Replace today's date with "Present" & format
  const formatStreakRange = (start, end) => {
    if (!start || !end) return "No data";
    const displayEnd = end === today ? "Present" : formatDate(end);
    return `${formatDate(start)} - ${displayEnd}`;
  };

  // Rank calculation
  const { level, percentile } = calculateRank({
    all_commits: true,
    commits,
    prs,
    issues,
    reviews: 0,
    repos: contributedTo,
    stars: totalStars,
    followers,
  });

  const repo = json.data.repository;

  return {
    user: {
      username: user.login,
      name: user.name,
      createdAt: formatDate(user.createdAt),
    },
    stats: {
      commits,
      prs,
      issues,
      contributedTo,
      followers,
      stars: totalStars,
      totalContributions,
      level,
      percentile,
    },
    streaks: {
      totalContributions: {
        value: 250,
        dateRange: `${formatDate(
          contributionCalendar.weeks[0].contributionDays[0].date
        )} - Present`,
      },
      currentStreak: {
        value: currentStreak.days,
        dateRange:
          currentStreak.days > 0
            ? formatStreakRange(currentStreak.start, currentStreak.end)
            : "No current streak",
      },
      longestStreak: {
        value: longestStreak.days,
        dateRange:
          longestStreak.days > 0
            ? formatStreakRange(longestStreak.start, longestStreak.end)
            : "No streak found",
      },
    },
    repo: repo
      ? {
        name: repo.name,
        description: parseGitHubText(repo.description || "No description"),
        language: repo.primaryLanguage?.name || "Unknown",
        languageColor: repo.primaryLanguage?.color || "#999999",
        stars: repo.stargazerCount,
        forks: repo.forkCount,
        watchers: repo.watchers?.totalCount || 0,
        openIssues: repo.issues?.totalCount || 0,
        closedIssues: repo.closedIssues?.totalCount || 0,
        openPRs: repo.pullRequests?.totalCount || 0,
        mergedPRs: repo.mergedPRs?.totalCount || 0,
        commitCount: repo.defaultBranchRef?.target?.history?.totalCount || 0,
        pushedAt: formatDate(repo.pushedAt),
        activityScore,
      }
      : null,
  };
}

// Scores every repository the user has contributed to in the last year by
// weighting commits, issues, PRs, reviews, and overall history depth — picks
// the highest-scoring repo as the one to feature on the about page. Wrapped in
// its own 24-hour cache layer since this query is expensive (paged contribution
// breakdowns + per-repo commit history) and changes slowly.
async function findMostActiveRepo(username) {
  const query = `
    query FindMostActiveRepo($username: String!) {
      user(login: $username) {
        contributionsCollection {
          commitContributionsByRepository(maxRepositories: 100) {
            repository { name owner { login } }
            contributions { totalCount }
          }
          issueContributionsByRepository(maxRepositories: 100) {
            repository { name owner { login } }
            contributions { totalCount }
          }
          pullRequestContributionsByRepository(maxRepositories: 100) {
            repository { name owner { login } }
            contributions { totalCount }
          }
          pullRequestReviewContributionsByRepository(maxRepositories: 100) {
            repository { name owner { login } }
            contributions { totalCount }
          }
        }
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
          nodes {
            name
            owner { login }
            defaultBranchRef {
              target {
                ... on Commit {
                  history { totalCount }
                }
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch(GITHUB_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { username } }),
  });

  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message);
  const user = json.data.user;
  if (!user) throw new Error("User not found");

  const excludeSet = mostActiveRepoExclude(username);
  // Key entries by `owner/name` (lowercased) so the same repo accumulates
  // score across contribution categories, and so two repos that happen to
  // share a name under different owners stay distinct.
  const scoreByRepo = new Map();
  const addScore = (repo, weight, count) => {
    const name = repo?.name;
    const owner = repo?.owner?.login;
    if (!name || !owner || !count) return;
    const key = `${owner.toLowerCase()}/${name.toLowerCase()}`;
    if (excludeSet.has(key)) return;
    const prev = scoreByRepo.get(key);
    if (prev) {
      prev.score += weight * count;
    } else {
      scoreByRepo.set(key, { name, owner, score: weight * count });
    }
  };

  // Weights chosen so PRs and reviews — the highest-effort engineering acts —
  // outrank raw commits, which in turn outrank issues and ambient history.
  for (const c of user.contributionsCollection.commitContributionsByRepository) {
    addScore(c.repository, 4, c.contributions.totalCount);
  }
  for (const c of user.contributionsCollection.issueContributionsByRepository) {
    addScore(c.repository, 3, c.contributions.totalCount);
  }
  for (const c of user.contributionsCollection.pullRequestContributionsByRepository) {
    addScore(c.repository, 5, c.contributions.totalCount);
  }
  for (const c of user.contributionsCollection.pullRequestReviewContributionsByRepository) {
    addScore(c.repository, 4, c.contributions.totalCount);
  }
  // Soft boost from total commit history on owned repos — helps a deep-history
  // repo break ties when contribution counts converge.
  for (const repo of user.repositories.nodes) {
    const commits = repo.defaultBranchRef?.target?.history?.totalCount || 0;
    addScore(repo, 1, commits);
  }

  // No qualifying activity is a valid state (fresh fork-user with no recent
  // contributions). Return null instead of throwing so the endpoint can still
  // serve user/stats/streaks payloads and the repo card renders empty,
  // instead of forcing the whole response into the unrelated bundled fallback.
  if (scoreByRepo.size === 0) {
    return null;
  }

  let best = null;
  for (const entry of scoreByRepo.values()) {
    if (!best || entry.score > best.score) {
      best = entry;
    }
  }

  return { name: best.name, owner: best.owner, activityScore: best.score };
}

function computeStreaks(contributionCalendar) {
  const days = contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  const today = new Date().toISOString().slice(0, 10);

  let currentStreak = { days: 0, start: null, end: null };
  let longestStreak = { days: 0, start: null, end: null };

  let streak = 0;
  let streakStart = null;

  for (let i = 0; i < days.length; i++) {
    const { date, contributionCount } = days[i];
    if (contributionCount > 0) {
      if (streak === 0) streakStart = date;
      streak++;
    } else {
      if (streak > 0) {
        const streakEnd = days[i - 1].date;
        if (streak > longestStreak.days)
          longestStreak = { days: streak, start: streakStart, end: streakEnd };
        streak = 0;
      }
    }
  }

  // Handle ongoing streak
  if (streak > 0) {
    const lastDay = days[days.length - 1].date;
    if (streak > longestStreak.days)
      longestStreak = { days: streak, start: streakStart, end: lastDay };

    if (lastDay === today)
      currentStreak = { days: streak, start: streakStart, end: lastDay };
  }
  console.log("Streaks", { currentStreak, longestStreak })

  return { currentStreak, longestStreak };
}

