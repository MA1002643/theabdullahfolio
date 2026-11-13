import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TOOL_TIMEOUT_MS,
  createLiveTools,
  displayData,
  summariseGithub,
  summariseProgress,
  summariseWork,
} from '@/lib/ask/liveTools';

// The Ask agent's live tools (issue #41). They call the existing route
// handlers in process; here the handlers are injected doubles, so nothing
// reaches GitHub. What is pinned: a tool never throws, a snapshot is marked
// not-live, a slow handler times out into "unavailable", and results stay
// small and flat.

afterEach(() => vi.useRealTimers());

const ok = (body) => async () => ({ GET: async () => Response.json(body) });

describe('summaries', () => {
  it('summarises GitHub stats, flagging a bundled snapshot as not live', () => {
    const s = summariseGithub({
      _fallback: true,
      languages: [
        { language: 'JavaScript', percentage: '57.21' },
        { language: 'TypeScript', percentage: '20.4' },
      ],
      stats: {
        stats: { commits: 1502, prs: 31, issues: 232, totalContributions: 1809, contributedTo: 10 },
        streaks: { currentStreak: { value: 0 }, longestStreak: { value: 253 } },
        repo: { nameWithOwner: 'MA1002643/theabdullahfolio' },
      },
    });
    expect(s).toMatchObject({
      id: 'L:github',
      live: false,
      commits: 1502,
      longestStreakDays: 253,
      topLanguages: ['JavaScript 57%', 'TypeScript 20%'],
    });
  });

  it('summarises project progress for one project or all tracked ones', () => {
    const d = {
      overallCompletion: 61.4,
      projects: [
        { id: 1, name: 'A', tracked: true, completionPercent: 50, doneItems: 5, totalItems: 10 },
        { id: 2, name: 'B', tracked: false },
      ],
    };
    expect(summariseProgress(d, null)).toMatchObject({ live: true, trackedProjects: 1, overallCompletionPercent: 61 });
    expect(summariseProgress(d, 1).projects).toEqual(['A: 50% (5/10 items done)']);
    expect(summariseProgress(d, 2).projects).toEqual([]);
  });

  it('summarises current work, treating a token note as not live', () => {
    const s = summariseWork({
      state: 'active',
      meta: { activePrs: 2, recentPushes: 11, activityTrace: { total: 37 }, topItems: [{ repo: 'site', title: 'Palette' }], note: 'no token' },
    });
    expect(s).toMatchObject({ live: false, activePullRequests: 2, activityLast14Days: 37, focus: ['site: Palette'] });
  });

  it('reports a missing payload as unavailable rather than throwing', () => {
    expect(summariseGithub(null)).toEqual({ id: 'L:github', live: false, unavailable: true });
  });

  it('keeps display data flat and short', () => {
    expect(displayData({ id: 'x', n: 1, b: true, list: [1, 2, 3, 4], obj: { a: 1 }, long: 'x'.repeat(200) })).toEqual({
      n: 1,
      b: true,
      list: [1, 2, 3],
    });
  });
});

describe('createLiveTools', () => {
  it('calls the route handlers in process with the allowed username', async () => {
    const seen = [];
    const tools = createLiveTools({
      github: async () => ({
        GET: async (req) => {
          seen.push(new URL(req.url).searchParams.get('username'));
          return Response.json({ stats: { stats: { commits: 3 } } });
        },
      }),
      progress: ok({ projects: [], overallCompletion: null }),
      work: ok({ state: 'idle', meta: {} }),
    });
    expect((await tools.get_github_activity.execute({})).commits).toBe(3);
    expect(seen).toEqual(['MA1002643']);
    expect((await tools.get_project_progress.execute({ projectId: 2 })).id).toBe('L:progress');
    expect((await tools.get_current_work.execute({})).state).toBe('idle');
  });

  it('turns a failing or non-OK handler into "unavailable", never a throw', async () => {
    const tools = createLiveTools({
      github: async () => ({ GET: async () => { throw new Error('boom'); } }),
      progress: async () => ({ GET: async () => new Response('no', { status: 500 }) }),
      work: async () => { throw new Error('chunk failed'); },
    });
    expect(await tools.get_github_activity.execute({})).toMatchObject({ unavailable: true });
    expect(await tools.get_project_progress.execute({})).toMatchObject({ unavailable: true });
    expect(await tools.get_current_work.execute({})).toMatchObject({ unavailable: true });
  });

  it('gives up on a handler slower than the timeout', async () => {
    vi.useFakeTimers();
    const tools = createLiveTools({ work: async () => ({ GET: () => new Promise(() => {}) }) });
    const pending = tools.get_current_work.execute({});
    await vi.advanceTimersByTimeAsync(TOOL_TIMEOUT_MS + 10);
    expect(await pending).toMatchObject({ id: 'L:work', unavailable: true });
  });
});
