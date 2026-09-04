// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuestbookMessages } from '@/hooks/useGuestbookMessages';
import { PAGE_SIZE } from '@/lib/guestbook/paging';

// The poll against a burst of arrivals. The poll reads the NEWEST page and
// merges it above the prefix's older tail — and when more than PAGE_SIZE
// messages land between two polls, that page shows only the newest
// PAGE_SIZE of them: the rest would fall into a hole between the page and
// the tail, and because the prefix's continuation cursor still pointed below
// the tail, no later fetch could recover them (code review). The poll now
// follows a page that does not reach the prefix down its own cursor until
// one does, bounded; past the bound it restarts the prefix from the top with
// the contiguous run it fetched. These tests drive the real hook through a
// cursor-paged stand-in wall, triggering the poll the way the page does when
// a tab comes back to the foreground.

const seed = (n) => ({
  id: `m${String(n).padStart(3, '0')}`,
  author: { name: `Visitor ${n}`, username: `visitor${n}`, avatar: null, provider: 'github' },
  message: `mark ${n}`,
  // Larger n is newer; minute-spaced, all in the past.
  createdAt: new Date(Date.UTC(2026, 7, 1) + n * 60_000).toISOString(),
  reactions: { fire: 0, rocket: 0, heart: 0 },
  viewerReaction: null,
  isOwn: false,
});
// Newest first, as the server serves.
const wallOf = (ns) => [...ns].sort((a, b) => b - a).map(seed);
const idsOf = (list) => list.map((m) => m.id);

const json = (body) => ({ ok: true, status: 200, json: async () => body });

// A cursor-paged stand-in for GET /api/guestbook: honours ?limit and
// ?cursor, serving whatever `getWall()` returns at the time of the call. The
// cursor is a POSITION — "strictly after this id" — as the server's is, so
// it stays exact when arrivals shift the wall between calls (an offset would
// not, and the hook is entitled to keep a cursor across a poll).
function stubWall(getWall) {
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const u = new URL(String(url), 'http://localhost');
      calls.push(u.search);
      const wall = getWall();
      const limit = Number(u.searchParams.get('limit'));
      const cursor = u.searchParams.get('cursor');
      const start = cursor
        ? wall.findIndex((m) => m.id === cursor.slice('after:'.length)) + 1
        : 0;
      const end = Math.min(wall.length, start + limit);
      return json({
        messages: wall.slice(start, end),
        count: wall.length,
        nextCursor: end < wall.length ? `after:${wall[end - 1].id}` : null,
      });
    }),
  );
  return calls;
}

const ids = (result) => idsOf(result.current.messages || []);
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
// The page polls on an interval and whenever the tab comes back; the latter
// is the trigger a test can pull.
const pollNow = async () => {
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 0));
  });
};

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  // Unmount every hook: a mounted one keeps its visibility listener, and
  // would answer the next test's trigger against the next test's stub.
  cleanup();
  vi.unstubAllGlobals();
});

describe('useGuestbookMessages — the poll never leaves a hole', () => {
  it('fewer than a page since the last poll: one read, merged above the kept tail', async () => {
    let wall = wallOf([1, 2, 3, 4, 5, 6, 7, 8]);
    const calls = stubWall(() => wall);
    const { result } = renderHook(() => useGuestbookMessages({ pollMs: 60_000 }));
    await flush();
    expect(ids(result)).toEqual(idsOf(wall));
    expect(result.current.hasMore).toBe(false);

    // Three arrive.
    wall = wallOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const before = calls.length;
    await pollNow();
    expect(calls.length - before).toBe(1);
    expect(ids(result)).toEqual(idsOf(wall));
    expect(result.current.count).toBe(11);
    expect(result.current.hasMore).toBe(false);
    expect([...result.current.newIds].sort()).toEqual(['m009', 'm010', 'm011']);
  });

  it('nine since the last poll: the poll reads on until it reaches the prefix — the ninth is not lost', async () => {
    let wall = wallOf([1, 2, 3, 4, 5, 6, 7, 8]);
    const calls = stubWall(() => wall);
    const { result } = renderHook(() => useGuestbookMessages({ pollMs: 60_000 }));
    await flush();
    expect(ids(result)).toEqual(idsOf(wall));

    // Nine arrive: the newest page is m017…m010, and m009 — the ninth —
    // sits between that page and the prefix's top (m008).
    wall = wallOf(Array.from({ length: 17 }, (_, i) => i + 1));
    const before = calls.length;
    await pollNow();
    // Two reads: the newest page (m017…m010), then the page below it, which
    // reaches m008.
    expect(calls.slice(before)).toEqual([
      `?limit=${PAGE_SIZE}`,
      `?limit=${PAGE_SIZE}&cursor=after%3Am010`,
    ]);
    expect(ids(result)).toEqual(idsOf(wall));
    expect(ids(result)).toContain('m009');
    expect(result.current.count).toBe(17);
    // The prefix still ends at the wall's oldest, so there is no more.
    expect(result.current.hasMore).toBe(false);
    expect(result.current.newIds.size).toBe(9);
  });

  it('a prefix deeper than the walk: the tail and its own cursor are kept', async () => {
    // Twenty on the wall; the first load takes sixteen and holds a cursor.
    let wall = wallOf(Array.from({ length: 20 }, (_, i) => i + 1));
    const calls = stubWall(() => wall);
    const { result } = renderHook(() => useGuestbookMessages({ pollMs: 60_000 }));
    await flush();
    expect(ids(result)).toHaveLength(16);
    expect(result.current.hasMore).toBe(true);

    // Nine arrive; the walk reaches m020 on its second page.
    wall = wallOf(Array.from({ length: 29 }, (_, i) => i + 1));
    const before = calls.length;
    await pollNow();
    expect(calls.slice(before)).toEqual([
      `?limit=${PAGE_SIZE}`,
      `?limit=${PAGE_SIZE}&cursor=after%3Am022`,
    ]);
    expect(ids(result)).toEqual(idsOf(wall).slice(0, 25));
    // The old tail (m008…m005) is kept, and so is the cursor below it: a
    // page flip continues from m005, not from the poll's own page.
    expect(result.current.hasMore).toBe(true);
    await act(() => result.current.ensureLoaded(28));
    expect(ids(result)).toEqual(idsOf(wall));
  });

  it('a burst past the walk bound: the prefix restarts from the top, contiguous, and refills below', async () => {
    let wall = wallOf([1, 2, 3, 4, 5, 6, 7, 8]);
    const calls = stubWall(() => wall);
    const { result } = renderHook(() => useGuestbookMessages({ pollMs: 60_000 }));
    await flush();

    // Fifty arrive: five pages read, none reaching m008.
    wall = wallOf(Array.from({ length: 58 }, (_, i) => i + 1));
    const before = calls.length;
    await pollNow();
    expect(calls.length - before).toBe(5);
    // What is held is exactly the wall's top forty — no hole, and the old
    // tail is NOT kept beneath it (that is where the hole would have been).
    expect(ids(result)).toEqual(idsOf(wall).slice(0, 40));
    expect(result.current.count).toBe(58);
    expect(result.current.hasMore).toBe(true);

    // The older leaves refill from the run's own cursor, contiguously.
    await act(() => result.current.ensureLoaded(47));
    expect(ids(result)).toEqual(idsOf(wall).slice(0, 48));
    await act(() => result.current.loadUntil('m001'));
    expect(ids(result)).toEqual(idsOf(wall));
    expect(result.current.hasMore).toBe(false);
  });

  it('a pending card rides on top through a walk and through a restart', async () => {
    let wall = wallOf([1, 2, 3, 4, 5, 6, 7, 8]);
    stubWall(() => wall);
    const { result } = renderHook(() => useGuestbookMessages({ pollMs: 60_000 }));
    await flush();

    // A POST that never resolves: the pending card stays pending throughout.
    const realFetch = fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn((url, init = {}) =>
        init.method === 'POST' ? new Promise(() => {}) : realFetch(url, init),
      ),
    );
    act(() => {
      result.current.submit('mine', { name: 'Ann', username: 'ann', provider: 'github' });
    });
    await flush();
    expect(ids(result)[0]).toMatch(/^temp_/);

    wall = wallOf(Array.from({ length: 17 }, (_, i) => i + 1));
    await pollNow();
    expect(ids(result)[0]).toMatch(/^temp_/);
    expect(ids(result).slice(1)).toEqual(idsOf(wall));

    wall = wallOf(Array.from({ length: 70 }, (_, i) => i + 1));
    await pollNow();
    expect(ids(result)[0]).toMatch(/^temp_/);
    expect(ids(result).slice(1)).toEqual(idsOf(wall).slice(0, 40));
    expect(result.current.count).toBe(71); // 70 confirmed + the pending card
  });
});
