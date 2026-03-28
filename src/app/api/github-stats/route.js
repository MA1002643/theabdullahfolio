import { parseGitHubText } from "@/utils/emoji";
import { calculateRank } from "@/utils/rankCalculator";
import { NextResponse } from "next/server";

const GITHUB_API = "https://api.github.com/graphql";
const TOKEN = process.env.GITHUB_TOKEN; // store this securely in your .env.local

// ===== IN-MEMORY CACHE =====
const cache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds

function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`Cache HIT for key: ${key}`);
    return cached.data;
  }
  console.log(`Cache MISS for key: ${key}`);
  return null;
}

function setCachedData(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
  console.log(`Cache SET for key: ${key}`);
}

// Cleanup old cache entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      cache.delete(key);
      console.log(`Cache EXPIRED and removed: ${key}`);
    }
  }
}, 15 * 60 * 1000);

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

  // Create unique cache key
  const cacheKey = `${username}-${repoName || 'default'}`;
  
  // Check cache first
  const cachedData = getCachedData(cacheKey);
  if (cachedData) {
    return NextResponse.json(cachedData, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300',
        'X-Cache-Status': 'HIT',
      },
    });
  }

  try {
    const languages = await getAllLanguages(username);
    const stats = await fetchGitHubStats(username, repoName);
    const iconsLanguages = await getUserLanguages(username);
    
    const responseData = { 
      languages: languages.slice(0, 6), 
      stats, 
      icons: iconsLanguages 
    };
    
    // Store in cache
    setCachedData(cacheKey, responseData);
    
    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300',
        'X-Cache-Status': 'MISS',
      },
    });
  } catch (error) {
    console.error("GitHub API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch GitHub language stats" },
      { status: 500 }
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

async function getUserLanguages(username) {
  if (!username) throw new Error("Username is required");

  const allLanguages = new Set();
  let page = 1;

  try {
    while (true) {
      // Fetch up to 100 repos per page
      const repoRes = await fetch(
        `https://api.github.com/users/${username}/repos?per_page=100&page=${page}`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            // Optionally add a GitHub token if hitting rate limits:
            // Authorization: `token YOUR_GITHUB_TOKEN`,
          },
        }
      );

      if (!repoRes.ok) throw new Error(`GitHub API error: ${repoRes.statusText}`);
      const repos = await repoRes.json();
      if (repos.length === 0) break; // no more repos

      // Get language data for each repo
      const langRequests = repos.map(async (repo) => {
        const langRes = await fetch(repo.languages_url);
        if (langRes.ok) {
          const langs = await langRes.json();
          Object.keys(langs).forEach((lang) => allLanguages.add(lang));
        }
      });

      await Promise.all(langRequests);
      page++;
    }

    return Array.from(allLanguages).sort();
  } catch (err) {
    console.error("Error fetching languages:", err);
    return [];
  }
}
