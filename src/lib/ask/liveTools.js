// The live tools behind the palette's Ask (issue #41). Server-only.
//
// The fact registry (corpus.js) is what the site SAYS; these are what it
// KNOWS RIGHT NOW: GitHub activity, project completion from the issue boards,
// and what is being worked on this fortnight. Each tool calls the existing
// route handler IN PROCESS — /api/github-stats, /api/project-progress,
// /api/work-status — so it shares that route's `unstable_cache` entry, its
// rate-limit guards, its request budget and its fallback. Ask adds no GitHub
// code and no GitHub traffic a page view would not already cause.
//
// A tool never throws. A slow or failed handler becomes
// `{ live: false, unavailable: true }`, and a handler serving its bundled
// snapshot (`_fallback`) becomes `live: false`; the instructions tell the
// model to say a non-live figure may be out of date. Results are small and
// flat: they are both what the model reads and (through `displayData`) what
// the visitor's reasoning trace shows.

import { jsonSchema, tool } from 'ai';
import { projectsData } from '@/app/data';
import { githubUsername } from '@/components/footer/footer-data';

export const TOOL_TIMEOUT_MS = 6000;
const ORIGIN = 'http://internal.ask';

async function callRoute(load, request) {
  let handle;
  const timer = new Promise((resolve) => {
    handle = setTimeout(() => resolve(null), TOOL_TIMEOUT_MS);
  });
  try {
    const run = (async () => {
      const { GET } = await load();
      const res = await GET(request);
      if (!res?.ok) return null;
      return res.json();
    })();
    return await Promise.race([run, timer]);
  } catch {
    return null;
  } finally {
    clearTimeout(handle);
  }
}

const NO_INPUT = jsonSchema({ type: 'object', properties: {}, additionalProperties: false });
const unavailable = (id) => ({ id, live: false, unavailable: true });
const pct = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : undefined);

export function summariseGithub(d) {
  if (!d) return unavailable('L:github');
  const s = d.stats?.stats ?? {};
  const streaks = d.stats?.streaks ?? {};
  const repo = d.stats?.repo ?? d.repo ?? {};
  return {
    id: 'L:github',
    live: !d._fallback,
    commits: s.commits,
    pullRequests: s.prs,
    issues: s.issues,
    contributionsLastYear: s.totalContributions,
    reposContributedTo: s.contributedTo,
    currentStreakDays: streaks.currentStreak?.value,
    longestStreakDays: streaks.longestStreak?.value,
    topLanguages: (d.languages ?? [])
      .slice(0, 4)
      .map((l) => `${l.language} ${pct(l.percentage)}%`),
    mostActiveRepo: repo.nameWithOwner,
  };
}

export function summariseProgress(d, projectId) {
  if (!d) return unavailable('L:progress');
  const all = (d.projects ?? []).filter((p) => p.tracked);
  const pick = projectId == null ? all : all.filter((p) => p.id === projectId);
  return {
    id: 'L:progress',
    live: !d._fallback,
    trackedProjects: all.length,
    overallCompletionPercent: pct(d.overallCompletion),
    projects: pick
      .slice(0, 6)
      .map((p) => `${p.name}: ${pct(p.completionPercent)}% (${p.doneItems}/${p.totalItems} items done)`),
    lastSynced: d.lastSynced ?? undefined,
  };
}

export function summariseWork(d) {
  if (!d) return unavailable('L:work');
  const meta = d.meta ?? {};
  return {
    id: 'L:work',
    live: !meta.note,
    state: d.state,
    activePullRequests: meta.activePrs,
    activeIssues: meta.activeIssues,
    recentPushes: meta.recentPushes,
    activityLast14Days: meta.activityTrace?.total,
    focus: (meta.topItems ?? [])
      .slice(0, 4)
      .map((i) => [i.repo ?? i.displayName, i.title].filter(Boolean).join(': '))
      .filter(Boolean),
    lastActivityAt: meta.lastActivityAt ?? undefined,
  };
}

/** The subset of a result the reasoning trace shows (numbers and short lists). */
export function displayData(result) {
  const out = {};
  for (const [k, v] of Object.entries(result ?? {})) {
    if (k === 'id') continue;
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 120) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 3);
  }
  return out;
}

export const LIVE_TOOL_NAMES = ['get_github_activity', 'get_project_progress', 'get_current_work'];

/** The live tools, bound to the loaders (injectable for tests). */
export function createLiveTools(loaders = {}) {
  const load = {
    github: loaders.github ?? (() => import('@/app/api/github-stats/route')),
    progress: loaders.progress ?? (() => import('@/app/api/project-progress/route')),
    work: loaders.work ?? (() => import('@/app/api/work-status/route')),
  };
  return {
    get_github_activity: tool({
      description:
        'Live GitHub activity for him: commits, pull requests, issues, contributions in the last year, current and longest streaks, top languages by share, and his most active repository. Cite as [[L:github]].',
      inputSchema: NO_INPUT,
      execute: async () =>
        summariseGithub(
          await callRoute(
            load.github,
            new Request(`${ORIGIN}/api/github-stats?username=${encodeURIComponent(githubUsername)}`),
          ),
        ),
    }),
    get_project_progress: tool({
      description:
        'Live completion of his projects, from their GitHub issue boards: percent done and items done/total, for one project or all tracked ones. Cite as [[L:progress]].',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          projectId: {
            type: 'integer',
            enum: projectsData.map((p) => p.id),
            description: 'The project number from its fact id (P2 → 2). Omit for every project.',
          },
        },
        additionalProperties: false,
      }),
      execute: async ({ projectId } = {}) =>
        summariseProgress(
          await callRoute(load.progress, new Request(`${ORIGIN}/api/project-progress`)),
          Number.isInteger(projectId) ? projectId : null,
        ),
    }),
    get_current_work: tool({
      description:
        'What he is working on right now: open pull requests and issues, recent pushes, the last fourteen days of activity and the items in focus. Cite as [[L:work]].',
      inputSchema: NO_INPUT,
      execute: async () =>
        summariseWork(await callRoute(load.work, new Request(`${ORIGIN}/api/work-status`))),
    }),
  };
}

/** Offered last: up to three follow-up questions, rendered as chips. */
export const suggestFollowups = tool({
  description:
    'Offer the visitor up to three short follow-up questions, in the answer language. Call exactly once, after the answer is written.',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: { type: 'string', maxLength: 90 },
        minItems: 1,
        maxItems: 3,
      },
    },
    required: ['questions'],
    additionalProperties: false,
  }),
  // A no-op result keeps the loop well-formed; `hasToolCall` ends it here.
  execute: async () => ({ shown: true }),
});
