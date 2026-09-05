// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The wall's write gate (GuestbookWall): the composer and the reaction bars
// are offered only to a session that can actually write — one carrying an
// identity key, the same viewerFromSession rule the routes apply. An Auth.js
// session minted before keys existed is still `authenticated` but keyless,
// and every write it makes answers 401; gating on `status` alone handed it a
// fully enabled composer that could never submit (code review). It must see
// the sign-in prompt in its re-auth voice instead.
//
// The wall is rendered for real; its data hooks and heavy children are
// replaced by probes that report what they were handed.

let sessionState = { data: null, status: 'loading' };
vi.mock('next-auth/react', () => ({
  useSession: () => sessionState,
  signIn: vi.fn(),
}));

const CARD = {
  id: 'msg_1',
  author: { name: 'Someone', provider: 'github', username: 'someone' },
  message: 'a mark',
  createdAt: '2026-03-01T00:00:00.000Z',
  reactions: { fire: 0, rocket: 0, heart: 0 },
  viewerReaction: null,
  isOwn: false,
};
vi.mock('@/hooks/useGuestbookMessages', () => ({
  useGuestbookMessages: () => ({
    messages: [CARD],
    count: 1,
    hasMore: false,
    loading: false,
    loadingMore: false,
    loadError: null,
    submit: vi.fn(),
    submitting: false,
    react: vi.fn(),
    remove: vi.fn(),
    reload: vi.fn(),
    ensureLoaded: vi.fn(),
    loadUntil: vi.fn(),
    newIds: new Set(),
    clearNewIds: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePresence', () => ({ usePresence: () => 0 }));
vi.mock('@/hooks/useHardwareKeyboard', () => ({ useHardwareKeyboard: () => false }));
vi.mock('@/hooks/useUiSound', () => ({ useUiSound: () => () => {} }));
vi.mock('@/hooks/useCountUp', () => ({ useCountUp: (n) => n }));

vi.mock('@/components/guestbook/MessageInput', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ user }) =>
      h('div', { 'data-testid': 'composer', 'data-key': user?.key ?? '' }),
  };
});
vi.mock('@/components/guestbook/SignInPrompt', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ reauth = false }) =>
      h('div', { 'data-testid': 'sign-in', 'data-reauth': String(reauth) }),
  };
});
vi.mock('@/components/guestbook/MessageCard', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ canReact }) =>
      h('div', { 'data-testid': 'card', 'data-can-react': String(canReact) }),
  };
});
vi.mock('@/components/guestbook/PresencePill', () => ({ default: () => null }));
vi.mock('@/components/guestbook/WallPagination', () => ({ default: () => null }));

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
  window.scrollTo = () => {};
  window.IntersectionObserver = ObserverStub;
  window.ResizeObserver = ObserverStub;
});

afterEach(() => {
  cleanup();
});

async function renderWall(state) {
  sessionState = state;
  const { default: GuestbookWall } = await import('@/components/guestbook/GuestbookWall');
  return render(createElement(GuestbookWall));
}

const cardsCanReact = (utils) =>
  utils.queryAllByTestId('card').map((el) => el.dataset.canReact);

describe('GuestbookWall — the composer is offered only to a session that can write', () => {
  it('while the session resolves: neither composer nor prompt, and no reacting', async () => {
    const utils = await renderWall({ data: null, status: 'loading' });
    expect(utils.queryByTestId('composer')).toBeNull();
    expect(utils.queryByTestId('sign-in')).toBeNull();
    expect(cardsCanReact(utils)).not.toContain('true');
  });

  it('signed out: the sign-in prompt in its plain voice, no reacting', async () => {
    const utils = await renderWall({ data: null, status: 'unauthenticated' });
    expect(utils.queryByTestId('composer')).toBeNull();
    expect(utils.getByTestId('sign-in').dataset.reauth).toBe('false');
    expect(cardsCanReact(utils).length).toBeGreaterThan(0);
    expect(cardsCanReact(utils)).not.toContain('true');
  });

  it('a signed-in but KEYLESS legacy session: the prompt in its re-auth voice, never a composer', async () => {
    const utils = await renderWall({
      status: 'authenticated',
      // A JWT minted before keys existed: name, image, username — no key.
      data: {
        user: { name: 'Old Timer', username: 'octocat', image: null, provider: 'github' },
      },
    });
    expect(utils.queryByTestId('composer')).toBeNull();
    expect(utils.getByTestId('sign-in').dataset.reauth).toBe('true');
    // Reactions would 401 just as posts would — the bars stay inert too.
    expect(cardsCanReact(utils).length).toBeGreaterThan(0);
    expect(cardsCanReact(utils)).not.toContain('true');
  });

  it('a keyed session: the composer for that identity, reacting on, no prompt', async () => {
    const utils = await renderWall({
      status: 'authenticated',
      data: {
        user: { key: 'github:583231', provider: 'github', username: 'octocat', name: 'Octo' },
      },
    });
    expect(utils.getByTestId('composer').dataset.key).toBe('github:583231');
    expect(utils.queryByTestId('sign-in')).toBeNull();
    expect(cardsCanReact(utils).length).toBeGreaterThan(0);
    expect(cardsCanReact(utils)).not.toContain('false');
  });
});
