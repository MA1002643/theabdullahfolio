import { parseGitHubText } from "@/utils/emoji";
import { calculateRank } from "@/utils/rankCalculator";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import fallbackStats from "@/data/github-stats-fallback.json";

const GITHUB_API = "https://api.github.com/graphql";
const TOKEN = process.env.GITHUB_TOKEN;
const REVALIDATE_SECONDS = 10 * 60;

// Aggregated GitHub fetcher wrapped in Next's persistent data cache. The
// per-(username, repoName) cache key is derived from the runtime args; cached
// payloads survive serverless cold starts within a deployment, so each cold
// start no longer costs a fresh round of GraphQL calls.
const getCachedGithubStats = unstable_cache(
  async (username, repoName) => {
    const [languages, stats] = await Promise.all([
      getAllLanguages(username),
      fetchGitHubStats(username, repoName),
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
  const repoName = searchParams.get("repo");

  if (!username) {
    return NextResponse.json(
      { error: "Missing 'username' query parameter." },
      { status: 400 }
    );
  }

  try {
    const data = await getCachedGithubStats(username, repoName);
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

async function fetchGitHubStats(username, repoName) {
  const query = `
    query ($username: String!, $repoName: String!) {
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
      repository(owner: $username, name: $repoName) {
        name
        description
        stargazerCount
        primaryLanguage { name color }
      }
    }
  `;

  const res = await fetch(GITHUB_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { username, repoName } }),
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
        title: parseGitHubText(repo.name),
        description: parseGitHubText(repo.description || "No description"),
        language: repo.primaryLanguage?.name || "Unknown",
        color: repo.primaryLanguage?.color || "#999",
        stars: repo.stargazerCount,
      }
      : null,
  };
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

