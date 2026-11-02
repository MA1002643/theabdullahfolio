import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../support/msw/server.js';
import { freshSecret } from '../helpers/secrets.js';

// /api/work-status carries its sentences twice (issue #82): the English
// `message` / `secondaryMessage` exactly as before, AND a `{ key, values }`
// descriptor for each, which a non-English header words in the visitor's own
// locale. One cache entry then serves every language.
//
// Every payload path must carry the pair — the fresh MISS, the no-token
// FALLBACK — because a path that forgets it silently drops a Japanese visitor
// back into English. MSW plays GitHub; nothing reaches the real host.

const GRAPHQL = 'https://api.github.com/graphql';
const NOW = Date.now();
const minutesAgo = (m) => new Date(NOW - m * 60 * 1000).toISOString();

let savedToken;
beforeEach(() => {
  savedToken = process.env.GITHUB_TOKEN;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  if (savedToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = savedToken;
  vi.restoreAllMocks();
});

async function loadRoute(token) {
  if (token) process.env.GITHUB_TOKEN = token;
  else delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_PROJECT_TOKEN;
  vi.resetModules();
  return import('@/app/api/work-status/route');
}

const get = () => new Request('https://ma.codes/api/work-status');

/** One tracked repo with an open PR updated a few minutes ago (state LIVE). */
const portfolio = () => ({
  data: {
    rateLimit: { cost: 2, remaining: 4800, resetAt: new Date(NOW + 3600e3).toISOString() },
    r0: {
      nameWithOwner: 'MA1002643/theabdullahfolio',
      pullRequests: {
        totalCount: 1,
        nodes: [
          {
            number: 82,
            title: 'Multilingual support',
            createdAt: minutesAgo(90),
            updatedAt: minutesAgo(5),
            url: 'https://github.com/MA1002643/theabdullahfolio/pull/82',
          },
        ],
      },
      issues: { totalCount: 0, nodes: [] },
      defaultBranchRef: { target: { history: { totalCount: 0, nodes: [] } } },
      refs: { totalCount: 0, nodes: [] },
    },
  },
});

describe('work-status message descriptors', () => {
  it('ships the descriptor pair beside the unchanged English on a MISS', async () => {
    server.use(
      http.post(GRAPHQL, async ({ request }) => {
        const body = await request.json();
        if (body.query.includes('query Portfolio')) return HttpResponse.json(portfolio());
        // Project boards: an unresolved board is an empty board.
        return HttpResponse.json({ data: { user: { projectV2: null } } });
      }),
    );
    const { GET } = await loadRoute(freshSecret('gh'));
    const res = await GET(get());
    expect(res.headers.get('X-Cache-Status')).toBe('MISS');
    const json = await res.json();

    expect(json.state).toBe('live');
    expect(json.message).toBe(
      'Active work happening right now — currently focused on #82 Multilingual support.',
    );
    expect(json.messageDescriptor).toEqual({
      key: 'message.liveActive',
      values: { hasTop: 'yes', number: '82', title: 'Multilingual support' },
    });
    // No second story outside SHIPPING — both forms say so.
    expect(json.secondaryMessage).toBeNull();
    expect(json.secondaryMessageDescriptor).toBeNull();
  });

  it('ships a descriptor on the no-token FALLBACK path too', async () => {
    const { GET } = await loadRoute(null);
    const res = await GET(get());
    expect(res.headers.get('X-Cache-Status')).toBe('FALLBACK');
    const json = await res.json();
    expect(json.message).toBe(
      'New features are being released very soon. This website is actively under development.',
    );
    expect(json.messageDescriptor).toEqual({ key: 'message.idle', values: {} });
    expect(json.secondaryMessageDescriptor).toBeNull();
  });
});
