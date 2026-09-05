import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  appendOlder,
  compareNewest,
  isOlderThan,
  mergeNewestPage,
  pageReachesPrefix,
  parseLimit,
  positionOf,
} from '@/lib/guestbook/paging';
import { decodeCursor, encodeCursor } from '@/lib/guestbook/cursor';

// The guestbook's paging vocabulary: the shared order both drivers walk in,
// the cursor codec (shape-validated, deliberately unauthenticated — see the
// header of cursor.js), and the two pieces of list algebra the client hook
// uses to grow its prefix of the wall.

const at = (id, ms, extra = {}) => ({
  id,
  createdAt: new Date(ms).toISOString(),
  ...extra,
});

describe('parseLimit', () => {
  it('defaults, clamps to [1, MAX], and ignores garbage', () => {
    expect(parseLimit(null)).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseLimit(undefined)).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseLimit('')).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseLimit('abc')).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseLimit('0')).toBe(1);
    expect(parseLimit('-4')).toBe(1);
    expect(parseLimit('12')).toBe(12);
    expect(parseLimit('12.9')).toBe(12);
    expect(parseLimit('999999')).toBe(MAX_PAGE_LIMIT);
  });
});

describe('newest-first order', () => {
  it('sorts by createdAt desc, ties by id desc — the ZSET REV order', () => {
    const list = [at('b', 1000), at('a', 1000), at('c', 999), at('d', 1001)];
    expect([...list].sort(compareNewest).map((m) => m.id)).toEqual([
      'd',
      'b',
      'a',
      'c',
    ]);
  });

  it('isOlderThan is strict and honours the tie-break', () => {
    const p = positionOf(at('b', 1000));
    expect(isOlderThan(positionOf(at('a', 1000)), p)).toBe(true);
    expect(isOlderThan(positionOf(at('c', 999)), p)).toBe(true);
    expect(isOlderThan(positionOf(at('b', 1000)), p)).toBe(false);
    expect(isOlderThan(positionOf(at('c', 1000)), p)).toBe(false);
    expect(isOlderThan(positionOf(at('a', 1001)), p)).toBe(false);
  });

  it('treats an unparseable createdAt as the oldest possible, never NaN', () => {
    expect(positionOf({ id: 'x', createdAt: 'not a date' })).toEqual({
      t: 0,
      id: 'x',
    });
  });
});

describe('cursor codec', () => {
  it('round-trips a position as an opaque url-safe token', () => {
    const pos = { t: 1767225600000, id: 'msg_1767225600000_ab12cd34' };
    const token = encodeCursor(pos);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain(pos.id);
    expect(decodeCursor(token)).toEqual(pos);
  });

  it('accepts a hand-built, well-formed cursor: a position is public, not a capability', () => {
    // No secret goes into a cursor, so anyone can build one — and that is
    // the contract, not a gap: the wall is public and a position reaches
    // nothing that following nextCursor would not. Minting the same
    // position yields the very same bytes.
    const pos = { t: 1767225600000, id: 'msg_1767225600000_ab12cd34' };
    const handBuilt = Buffer.from(`${pos.t}:${pos.id}`, 'utf8').toString('base64url');
    expect(decodeCursor(handBuilt)).toEqual(pos);
    expect(encodeCursor(pos)).toBe(handBuilt);
    // A position no message occupies is still a position.
    const between = Buffer.from('1767225600500:nothing-here', 'utf8').toString('base64url');
    expect(decodeCursor(between)).toEqual({ t: 1767225600500, id: 'nothing-here' });
  });

  it('rejects anything that is not cursor-shaped', () => {
    const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
    const bad = [
      '',
      'not base64!',
      b64('nope'),
      b64(':msg_1'),
      b64('12:'),
      b64('1e3:msg_1'),
      b64('-5:msg_1'),
      b64('12:has space'),
      b64('12:msg_1:extra colon'),
      b64(`${'9'.repeat(17)}:msg_1`),
      'a'.repeat(201),
      42,
      null,
      undefined,
    ];
    for (const value of bad) expect(decodeCursor(value)).toBe(null);
  });
});

// Whether the poll's page can be joined to the prefix without a hole — the
// question the poll asks before it merges, and keeps asking, page by page,
// while the answer is no.
describe('pageReachesPrefix (does the poll need to keep reading?)', () => {
  const LIMIT = 3;
  const m = (n, extra = {}) => at(`m${n}`, n * 60_000, extra);

  it('a short page reaches: the server holds nothing older to miss', () => {
    expect(pageReachesPrefix([m(9), m(8)], [m(4), m(3)], LIMIT)).toBe(true);
    expect(pageReachesPrefix([], [m(4)], LIMIT)).toBe(true);
  });

  it('an empty or all-pending prefix reaches: there is nothing to join', () => {
    expect(pageReachesPrefix([m(9), m(8), m(7)], [], LIMIT)).toBe(true);
    expect(
      pageReachesPrefix([m(9), m(8), m(7)], [m(20, { pending: true })], LIMIT),
    ).toBe(true);
  });

  it('a shared id reaches, as does a page whose oldest is at or below the prefix top', () => {
    expect(pageReachesPrefix([m(9), m(8), m(4)], [m(4), m(3)], LIMIT)).toBe(true);
    // m4 deleted since — its position is still inside the page's range.
    expect(pageReachesPrefix([m(9), m(5), m(3)], [m(4), m(2)], LIMIT)).toBe(true);
    expect(pageReachesPrefix([m(9), m(8), m(4)], [m(5), m(4)], LIMIT)).toBe(true);
  });

  it('a FULL page entirely newer than the prefix top does NOT reach — that is the hole', () => {
    expect(pageReachesPrefix([m(9), m(8), m(7)], [m(4), m(3)], LIMIT)).toBe(false);
    // Adjacent by number is still a hole: nothing says m5 and m6 did not land.
    expect(pageReachesPrefix([m(9), m(8), m(7)], [m(6)], LIMIT)).toBe(false);
  });

  it('a local card ABOVE the page (our own post, confirmed after the request was cut) is no join point', () => {
    // m12 is newer than the page's top; the join the page must make is with
    // m4 below it — and it does not.
    expect(pageReachesPrefix([m(9), m(8), m(7)], [m(12), m(4), m(3)], LIMIT)).toBe(false);
    // …until the page runs down to m4's range.
    expect(
      pageReachesPrefix([m(9), m(8), m(7), m(6), m(5), m(4)], [m(12), m(4), m(3)], 6),
    ).toBe(true);
  });
});

describe('mergeNewestPage (the poll)', () => {
  const LIMIT = 3;
  // Message n was posted at minute n — larger n is newer.
  const m = (n, extra = {}) => at(`m${n}`, n * 60_000, extra);
  const ids = (list) => list.map((x) => x.id);

  it('replaces the window the page covers and keeps the older local tail', () => {
    const prev = [m(8), m(7), m(6), m(5), m(4)];
    const page = [m(9), m(8), m(7)];
    expect(ids(mergeNewestPage(prev, page, LIMIT))).toEqual([
      'm9',
      'm8',
      'm7',
      'm6',
      'm5',
      'm4',
    ]);
  });

  it("takes the page's copy of a card, not the local one", () => {
    const prev = [m(8, { reactions: { fire: 0 } }), m(5)];
    const page = [m(8, { reactions: { fire: 2 } }), m(7), m(6)];
    const merged = mergeNewestPage(prev, page, LIMIT);
    expect(merged[0].reactions).toEqual({ fire: 2 });
  });

  it('drops a card deleted inside the window the page covers', () => {
    const prev = [m(8), m(7), m(6), m(5), m(2)];
    const page = [m(8), m(6), m(5)]; // m7 was removed elsewhere
    expect(ids(mergeNewestPage(prev, page, LIMIT))).toEqual([
      'm8',
      'm6',
      'm5',
      'm2',
    ]);
  });

  it('a short page means the server holds nothing older: the local rest is gone', () => {
    const prev = [m(8), m(7), m(6), m(5)];
    const page = [m(8), m(6)]; // fewer than LIMIT
    expect(ids(mergeNewestPage(prev, page, LIMIT))).toEqual(['m8', 'm6']);
  });

  it('keeps pending cards on top, and a confirmed card newer than the page', () => {
    // m9 is our own post, confirmed after this poll's request was cut; the
    // temp card is one still in flight.
    const prev = [m(10, { id: 'temp_1', pending: true }), m(9), m(7), m(6), m(1)];
    const page = [m(8), m(7), m(6)];
    expect(ids(mergeNewestPage(prev, page, LIMIT))).toEqual([
      'temp_1',
      'm9',
      'm8',
      'm7',
      'm6',
      'm1',
    ]);
  });

  it('an empty page keeps only the pending cards', () => {
    const prev = [m(3, { id: 'temp_1', pending: true }), m(2), m(1)];
    expect(ids(mergeNewestPage(prev, [], LIMIT))).toEqual(['temp_1']);
  });
});

describe('appendOlder (a page from the cursor)', () => {
  it('appends in order and never duplicates an id already held', () => {
    const prev = [at('m5', 5), at('m4', 4)];
    const page = [at('m4', 4), at('m3', 3), at('m2', 2)];
    expect(appendOlder(prev, page).map((x) => x.id)).toEqual([
      'm5',
      'm4',
      'm3',
      'm2',
    ]);
  });
});
