// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuestbookMessages } from '@/hooks/useGuestbookMessages';

// The guestbook data layer's two write races. The server stores a message
// (or removes one) BEFORE it answers, so a poll — or a reload, which keeps
// pending cards and merges the server's list the same way — that runs while
// the request is in flight can already reflect the write. The hook must then
// settle the response against that list, not against the list as it was:
//   · POST 201 after a poll saw the real message → ONE card, counted once
//     (it used to map the pending card onto the real id beside the polled
//     copy — two cards, one id).
//   · DELETE 200 after a poll revived the card → the card goes, the total
//     drops, rather than lingering until the next poll.
// fetch is stubbed at the boundary; sonner's toasts are inert under jsdom.

const USER = { name: 'Ann', username: 'ann', image: null, provider: 'github' };

const REAL = {
  id: 'msg_real',
  author: { name: 'Ann', username: 'ann', avatar: null, provider: 'github' },
  message: 'hello wall',
  createdAt: new Date().toISOString(),
  reactions: { fire: 0, rocket: 0, heart: 0 },
  viewerReaction: null,
};

const json = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

// A promise the test resolves by hand — the in-flight write.
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// Routes GET /api/guestbook to whatever `wall` currently holds, and hands
// every write (POST / DELETE) to a deferred the test controls.
function stubFetch(wall) {
  const write = deferred();
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method || 'GET' });
      if (init.method === 'POST' || init.method === 'DELETE') {
        return write.promise;
      }
      return json({
        messages: wall.messages,
        count: wall.messages.length,
        nextCursor: null,
      });
    }),
  );
  return { write, calls };
}

const ids = (result) => (result.current.messages || []).map((m) => m.id);
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useGuestbookMessages — a write confirmed after a poll already saw it', () => {
  it('POST: the polled copy is removed before the pending card takes the real id', async () => {
    const wall = { messages: [] };
    const { write } = stubFetch(wall);
    const { result } = renderHook(() => useGuestbookMessages());
    await flush();
    expect(ids(result)).toEqual([]);
    expect(result.current.count).toBe(0);

    // Send. The pending card lands on top and is counted at once.
    let submitted;
    act(() => {
      submitted = result.current.submit('hello wall', USER);
    });
    await flush();
    expect(ids(result)).toHaveLength(1);
    expect(ids(result)[0]).toMatch(/^temp_/);
    expect(result.current.count).toBe(1);

    // Meanwhile the server has stored it and a reload brings the real copy
    // in beside the pending card — pending on top, server's list under it.
    wall.messages = [REAL];
    await act(() => result.current.reload());
    expect(ids(result)).toEqual([expect.stringMatching(/^temp_/), 'msg_real']);
    expect(result.current.count).toBe(2); // 1 confirmed + 1 pending, for now

    // The 201 arrives. Exactly one card, counted exactly once.
    write.resolve(json(REAL, 201));
    await act(async () => {
      expect(await submitted).toBe(true);
    });
    expect(ids(result)).toEqual(['msg_real']);
    expect(result.current.count).toBe(1);
    expect(result.current.newIds.has('msg_real')).toBe(true);
  });

  it('POST with no poll in between still counts the confirmed card once', async () => {
    const wall = { messages: [] };
    const { write } = stubFetch(wall);
    const { result } = renderHook(() => useGuestbookMessages());
    await flush();

    let submitted;
    act(() => {
      submitted = result.current.submit('hello wall', USER);
    });
    await flush();
    write.resolve(json(REAL, 201));
    await act(async () => {
      expect(await submitted).toBe(true);
    });
    expect(ids(result)).toEqual(['msg_real']);
    expect(result.current.count).toBe(1);
  });

  it('DELETE: a card a poll revived in flight is taken back on the 200, total with it', async () => {
    const wall = { messages: [REAL] };
    const { write } = stubFetch(wall);
    const { result } = renderHook(() => useGuestbookMessages());
    await flush();
    expect(ids(result)).toEqual(['msg_real']);
    expect(result.current.count).toBe(1);

    // Bin it: gone optimistically, total down.
    let removed;
    act(() => {
      removed = result.current.remove('msg_real');
    });
    await flush();
    expect(ids(result)).toEqual([]);
    expect(result.current.count).toBe(0);

    // A reload before the server answers still lists it — back it comes.
    await act(() => result.current.reload());
    expect(ids(result)).toEqual(['msg_real']);
    expect(result.current.count).toBe(1);

    // The 200 lands: the revived card and its count go for good.
    write.resolve(json({ ok: true }));
    await act(async () => {
      expect(await removed).toBe(true);
    });
    expect(ids(result)).toEqual([]);
    expect(result.current.count).toBe(0);
  });
});
