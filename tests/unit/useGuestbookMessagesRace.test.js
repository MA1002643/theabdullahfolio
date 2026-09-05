// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuestbookMessages } from '@/hooks/useGuestbookMessages';
import { PAGE_SIZE } from '@/lib/guestbook/paging';

// The guestbook data layer's two write races. The server stores a message
// (or removes one) BEFORE it answers, so a read that runs while the request
// is in flight can already reflect the write — and which read it is matters:
//   · a reload / poll re-reads the NEWEST page, so it lists the new message
//     AND counts it;
//   · an older-page fetch (a rail jump, a deep link) can never list a message
//     newer than its cursor, but the `count` it carries is the server's total
//     at that moment, which already includes it.
// The hook must then settle the response against the wall as it actually is:
//   · POST 201 → ONE card (the polled copy, if any, is dropped before the
//     pending card takes the real id), and the total settled from the 201's
//     own `count` — the size the server read just after the store — never by
//     incrementing a total that a fetch in flight may already have moved
//     (code review: the list check said "not polled" for an older page and
//     added one to a count that already had it);
//   · DELETE 200 → the card a poll revived goes, and the total is likewise
//     the 200's `count`, whether or not the fetched page held the card.
// A 201 / 200 without a count (an older server) falls back to the list
// heuristic, pinned here too. fetch is stubbed at the boundary; sonner's
// toasts are inert under jsdom.

const USER = { name: 'Ann', username: 'ann', image: null, provider: 'github' };

const REAL = {
  id: 'msg_real',
  author: { name: 'Ann', username: 'ann', avatar: null, provider: 'github' },
  message: 'hello wall',
  createdAt: new Date().toISOString(),
  reactions: { fire: 0, rocket: 0, heart: 0 },
  viewerReaction: null,
};

// A wall two leaves deep: PAGE_SIZE newest marks and two older ones behind
// a cursor. Minute-spaced, oldest last.
const seed = (i) => ({
  id: `msg_${i}`,
  author: { name: `Visitor ${i}`, username: `visitor${i}`, avatar: null, provider: 'github' },
  message: `mark ${i}`,
  createdAt: new Date(Date.now() - (i + 1) * 60_000).toISOString(),
  reactions: { fire: 0, rocket: 0, heart: 0 },
  viewerReaction: null,
  isOwn: false,
});
const NEWEST = Array.from({ length: PAGE_SIZE }, (_, i) => seed(i + 1));
const OLDER = [seed(PAGE_SIZE + 1), seed(PAGE_SIZE + 2)];
const idsOf = (list) => list.map((m) => m.id);

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

// Routes GET /api/guestbook to what `wall` currently holds — the newest page
// to any cursorless GET whatever its limit, `wall.older` behind one cursor —
// with `count` the server's total: derived from the two pages unless the
// test sets `wall.count` itself, the way a real total moves the instant a
// write lands, ahead of any page that lists it. Every write (POST / DELETE)
// gets a deferred the test controls.
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
      const older = new URL(String(url), 'http://localhost').searchParams.has('cursor');
      return json({
        messages: older ? (wall.older ?? []) : wall.messages,
        count: wall.count ?? wall.messages.length + (wall.older?.length ?? 0),
        nextCursor: !older && wall.older?.length ? 'older' : null,
      });
    }),
  );
  return { write, calls };
}

const ids = (result) => idsOf(result.current.messages || []);
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useGuestbookMessages — a POST confirmed after a read already saw it', () => {
  it('a reload listed AND counted it: the polled copy goes, the pending card takes the real id, counted once', async () => {
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

    // The 201 arrives with the size the server read after the store.
    // Exactly one card, counted exactly once — and `count` is not a field
    // of the card.
    write.resolve(json({ ...REAL, count: 1 }, 201));
    await act(async () => {
      expect(await submitted).toBe(true);
    });
    expect(ids(result)).toEqual(['msg_real']);
    expect(result.current.count).toBe(1);
    expect(result.current.messages[0]).not.toHaveProperty('count');
    expect(result.current.newIds.has('msg_real')).toBe(true);
  });

  it('an OLDER page fetched in flight counted it but could not list it: the 201 settles the total, nothing increments it again', async () => {
    const wall = { messages: NEWEST, older: OLDER };
    const { write, calls } = stubFetch(wall);
    const { result } = renderHook(() => useGuestbookMessages());
    await flush();
    expect(ids(result)).toEqual(idsOf(NEWEST));
    expect(result.current.count).toBe(PAGE_SIZE + 2);
    expect(result.current.hasMore).toBe(true);

    let submitted;
    act(() => {
      submitted = result.current.submit('hello wall', USER);
    });
    await flush();
    expect(result.current.count).toBe(PAGE_SIZE + 3); // + the pending card

    // The server has stored it — its total now says so — and a rail jump
    // pulls the OLDER page, which cannot contain the newest message: the
    // count comes back one higher, the list gains only the two old marks.
    wall.count = PAGE_SIZE + 3;
    await act(() => result.current.ensureLoaded(PAGE_SIZE + 1));
    expect(calls.filter((c) => c.url.includes('cursor=')).length).toBe(1);
    expect(ids(result)).toEqual([
      expect.stringMatching(/^temp_/),
      ...idsOf(NEWEST),
      ...idsOf(OLDER),
    ]);
    expect(result.current.count).toBe(PAGE_SIZE + 4); // counted + pending, for now

    // The 201 carries the same size the server read after the store. The
    // pending card becomes the real one and the total is settled from the
    // write itself — an increment here was the double count.
    write.resolve(json({ ...REAL, count: PAGE_SIZE + 3 }, 201));
    await act(async () => {
      expect(await submitted).toBe(true);
    });
    expect(ids(result)).toEqual(['msg_real', ...idsOf(NEWEST), ...idsOf(OLDER)]);
    expect(result.current.count).toBe(PAGE_SIZE + 3);
  });

  it('with no read in between, the 201 count is the total', async () => {
    const wall = { messages: [] };
    const { write } = stubFetch(wall);
    const { result } = renderHook(() => useGuestbookMessages());
    await flush();

    let submitted;
    act(() => {
      submitted = result.current.submit('hello wall', USER);
    });
    await flush();
    write.resolve(json({ ...REAL, count: 1 }, 201));
    await act(async () => {
      expect(await submitted).toBe(true);
    });
    expect(ids(result)).toEqual(['msg_real']);
    expect(result.current.count).toBe(1);
  });

  it('a 201 without a count (an older server) still settles the card once and counts by the list', async () => {
    const wall = { messages: [] };
    const { write } = stubFetch(wall);
    const { result } = renderHook(() => useGuestbookMessages());
    await flush();

    let submitted;
    act(() => {
      submitted = result.current.submit('hello wall', USER);
    });
    await flush();
    wall.messages = [REAL];
    await act(() => result.current.reload());
    expect(result.current.count).toBe(2);

    write.resolve(json(REAL, 201));
    await act(async () => {
      expect(await submitted).toBe(true);
    });
    expect(ids(result)).toEqual(['msg_real']);
    expect(result.current.count).toBe(1);
  });
});

// The rollback race (code review). A DELETE that FAILS leaves the message on
// the server — and a read that ran while it was pending saw it there, so it
// may already have revived the card and settled the total. The old rollback
// spliced the saved copy back regardless and added one to the total: a
// duplicate card and a count one too high. Now the card returns only if it is
// not already back, and the total goes back up only if nothing wrote it since
// the optimistic decrement.
describe('useGuestbookMessages — a DELETE that fails after a read already revived the card', () => {
  const failed = () => json({ error: 'Forbidden' }, 403);

  it('a reload revived the card AND its count: the rollback adds neither a second card nor a second count', async () => {
    const wall = { messages: [REAL] };
    const { write } = stubFetch(wall);
    const { result } = renderHook(() => useGuestbookMessages());
    await flush();

    let removed;
    act(() => {
      removed = result.current.remove('msg_real');
    });
    await flush();
    expect(ids(result)).toEqual([]);
    expect(result.current.count).toBe(0);

    // The reload lists it and counts it — both already restored.
    await act(() => result.current.reload());
    expect(ids(result)).toEqual(['msg_real']);
    expect(result.current.count).toBe(1);

    write.resolve(failed());
    await act(async () => {
      expect(await removed).toBe(false);
    });
    expect(ids(result)).toEqual(['msg_real']); // one copy, not two
    expect(result.current.count).toBe(1); // not 2
  });

  it('an OLDER page fetched in flight restored the count but could not list the card: the card comes back once, the count is not bumped again', async () => {
    const wall = { messages: NEWEST, older: OLDER };
    const { write } = stubFetch(wall);
    const { result } = renderHook(() => useGuestbookMessages());
    await flush();
    expect(result.current.count).toBe(PAGE_SIZE + 2);

    let removed;
    act(() => {
      removed = result.current.remove('msg_1');
    });
    await flush();
    expect(ids(result)).not.toContain('msg_1');
    expect(result.current.count).toBe(PAGE_SIZE + 1);

    // The older page never held msg_1, but the count it carried still does.
    await act(() => result.current.ensureLoaded(PAGE_SIZE + 1));
    expect(ids(result)).not.toContain('msg_1');
    expect(result.current.count).toBe(PAGE_SIZE + 2);

    write.resolve(failed());
    await act(async () => {
      expect(await removed).toBe(false);
    });
    // Back at its place, exactly once; the read's count stands.
    expect(ids(result)).toEqual([...idsOf(NEWEST), ...idsOf(OLDER)]);
    expect(ids(result).filter((id) => id === 'msg_1')).toHaveLength(1);
    expect(result.current.count).toBe(PAGE_SIZE + 2);
  });

  it('with no read in between, the rollback restores both the card and the count (the original contract)', async () => {
    const wall = { messages: [REAL] };
    const { write } = stubFetch(wall);
    const { result } = renderHook(() => useGuestbookMessages());
    await flush();

    let removed;
    act(() => {
      removed = result.current.remove('msg_real');
    });
    await flush();
    expect(ids(result)).toEqual([]);
    expect(result.current.count).toBe(0);

    write.resolve(failed());
    await act(async () => {
      expect(await removed).toBe(false);
    });
    expect(ids(result)).toEqual(['msg_real']);
    expect(result.current.count).toBe(1);
  });
});

describe('useGuestbookMessages — a DELETE confirmed after a read already saw it', () => {
  it('a reload revived the card: it is taken back on the 200, the total settled from the 200', async () => {
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
    write.resolve(json({ ok: true, count: 0 }));
    await act(async () => {
      expect(await removed).toBe(true);
    });
    expect(ids(result)).toEqual([]);
    expect(result.current.count).toBe(0);
  });

  it('an OLDER page fetched in flight still counted the card without listing it: the 200 settles the total', async () => {
    const wall = { messages: NEWEST, older: OLDER };
    const { write } = stubFetch(wall);
    const { result } = renderHook(() => useGuestbookMessages());
    await flush();
    expect(result.current.count).toBe(PAGE_SIZE + 2);

    let removed;
    act(() => {
      removed = result.current.remove('msg_1');
    });
    await flush();
    expect(ids(result)).not.toContain('msg_1');
    expect(result.current.count).toBe(PAGE_SIZE + 1);

    // Served before the delete landed: the older page (which never held
    // msg_1) with the server's count still at the old total.
    await act(() => result.current.ensureLoaded(PAGE_SIZE + 1));
    expect(ids(result)).toEqual([...idsOf(NEWEST.slice(1)), ...idsOf(OLDER)]);
    expect(result.current.count).toBe(PAGE_SIZE + 2); // the stale count, for now

    write.resolve(json({ ok: true, count: PAGE_SIZE + 1 }));
    await act(async () => {
      expect(await removed).toBe(true);
    });
    expect(ids(result)).not.toContain('msg_1');
    expect(result.current.count).toBe(PAGE_SIZE + 1);
  });

  it('an OLDER page served AFTER the delete counted it out already: the 200 keeps that total, no second decrement', async () => {
    const wall = { messages: NEWEST, older: OLDER };
    const { write } = stubFetch(wall);
    const { result } = renderHook(() => useGuestbookMessages());
    await flush();

    let removed;
    act(() => {
      removed = result.current.remove('msg_1');
    });
    await flush();
    expect(result.current.count).toBe(PAGE_SIZE + 1);

    // The server removed msg_1 before it served this GET: the older page,
    // with the count already one down. The card is absent either way — the
    // list cannot tell this read from the stale one above; only the count
    // can, and the 200 carries the same size.
    wall.messages = NEWEST.slice(1);
    await act(() => result.current.ensureLoaded(PAGE_SIZE + 1));
    expect(ids(result)).toEqual([...idsOf(NEWEST.slice(1)), ...idsOf(OLDER)]);
    expect(result.current.count).toBe(PAGE_SIZE + 1);

    write.resolve(json({ ok: true, count: PAGE_SIZE + 1 }));
    await act(async () => {
      expect(await removed).toBe(true);
    });
    expect(ids(result)).toHaveLength(PAGE_SIZE + 1);
    expect(result.current.count).toBe(PAGE_SIZE + 1);
  });

  it('a 200 without a count (an older server) still takes back a revived card and its count', async () => {
    const wall = { messages: [REAL] };
    const { write } = stubFetch(wall);
    const { result } = renderHook(() => useGuestbookMessages());
    await flush();

    let removed;
    act(() => {
      removed = result.current.remove('msg_real');
    });
    await flush();
    await act(() => result.current.reload());
    expect(result.current.count).toBe(1);

    write.resolve(json({ ok: true }));
    await act(async () => {
      expect(await removed).toBe(true);
    });
    expect(ids(result)).toEqual([]);
    expect(result.current.count).toBe(0);
  });
});
