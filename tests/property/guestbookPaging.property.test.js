import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from '@/lib/guestbook/cursor';
import {
  PAGE_SIZE,
  appendOlder,
  compareNewest,
  isOlderThan,
  mergeNewestPage,
  pageReachesPrefix,
  positionOf,
} from '@/lib/guestbook/paging';

// Model-based testing of the guestbook wall's paging (issue #92, L2).
//
// The client keeps a PREFIX of the wall plus a cursor, and three things change
// it: the first load, a 30-second poll of the newest page, and "load older".
// Between any two of those, visitors post and the owner deletes. The hook's own
// comment states the promise this machinery exists to keep:
//
//     "cards re-fetched, never cards missing"
//
// i.e. after a poll, every message on the server is either already on screen or
// still reachable by paging down from the cursor. Example tests can check the
// handful of interleavings someone thought of. Here fast-check generates the
// interleavings — bursts of posts larger than a page, deletes inside and below
// the loaded window, same-millisecond ties — runs them against a model server
// with the REAL paging helpers and the REAL cursor codec, and checks the
// invariants after every step. When one breaks, it shrinks the history to the
// shortest sequence of operations that still breaks it.
//
// THE PRECONDITION this suite surfaced (2026-09-28). The first version posted
// messages at arbitrary times, and fast-check shrank a failure to five steps:
// load two cards, post eight that sort BELOW the top card, poll. The page
// shared the top card's id, so it "reached" the prefix, the old tail was kept,
// and one message fell into the gap between them with no cursor pointing at it.
// The algorithm is only correct when a new message sorts above everything
// already on the wall, i.e. createdAt is non-decreasing in posting order. The
// server assigns createdAt at write time and the per-user rate limit spaces
// posts out, so that holds in production; it was simply never written down. It
// is now, in paging.js, and the model below posts on a monotonic clock: equal
// milliseconds allowed, never backwards.

// Mirrors of the hook's constants (src/hooks/useGuestbookMessages.js), which it
// does not export. The poll algorithm below is a line-for-line port of the
// hook's `poll`, minus React state.
const INITIAL_LIMIT = PAGE_SIZE * 2;
const POLL_MAX_FETCHES = 5;

/** A server with the jsonDriver's listing contract, speaking encoded cursors. */
function makeServer() {
  let wall = [];
  let seq = 0;
  let clock = 1_000;
  return {
    /** Post at the server's clock, advanced by `dt` ms (0 = same millisecond). */
    post(dt = 0) {
      clock += dt;
      const t = clock;
      seq += 1;
      // Real id shape (msg_<ms>_<8 hex>). The counter makes ids unique and, on a
      // same-millisecond tie, sorts the later post above the earlier one, which
      // is the monotonic order the precondition above requires.
      const id = `msg_${t}_${seq.toString(16).padStart(8, '0')}`;
      wall.push({ id, createdAt: new Date(t).toISOString() });
    },
    deleteAt(index) {
      const sorted = [...wall].sort(compareNewest);
      if (sorted.length === 0) return;
      const doomed = sorted[index % sorted.length].id;
      wall = wall.filter((m) => m.id !== doomed);
    },
    fetchPage(limit, cursor) {
      const after = cursor ? decodeCursor(cursor) : null;
      if (cursor) expect(after, `the server minted an undecodable cursor: ${cursor}`).not.toBeNull();
      const sorted = [...wall].sort(compareNewest);
      const from = after ? sorted.filter((m) => isOlderThan(positionOf(m), after)) : sorted;
      const list = from.slice(0, limit);
      const next = from.length > limit ? positionOf(list[list.length - 1]) : null;
      return { list, nextCursor: next ? encodeCursor(next) : null };
    },
    all: () => [...wall].sort(compareNewest),
  };
}

const dedupeById = (list) => {
  const seen = new Set();
  return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
};

/** The hook's `poll`, ported. */
function poll(client, server) {
  const prev = client.messages;
  let { list: pages, nextCursor } = server.fetchPage(PAGE_SIZE);
  let requested = PAGE_SIZE;
  for (
    let fetches = 1;
    nextCursor && fetches < POLL_MAX_FETCHES && !pageReachesPrefix(pages, prev, requested);
    fetches += 1
  ) {
    const more = server.fetchPage(PAGE_SIZE, nextCursor);
    pages = dedupeById([...pages, ...more.list]);
    requested += PAGE_SIZE;
    ({ nextCursor } = more);
  }
  if (pageReachesPrefix(pages, prev, requested)) {
    client.messages = mergeNewestPage(prev, pages, requested);
    const tailKept =
      pages.length >= requested &&
      prev.some((m) => !m.pending && isOlderThan(positionOf(m), positionOf(pages[pages.length - 1])));
    if (!nextCursor || !tailKept) client.cursor = nextCursor;
  } else {
    client.messages = [...prev.filter((m) => m.pending), ...pages];
    client.cursor = nextCursor;
  }
}

function loadOlder(client, server) {
  if (!client.cursor) return;
  const { list, nextCursor } = server.fetchPage(PAGE_SIZE, client.cursor);
  client.messages = appendOlder(client.messages, list);
  client.cursor = nextCursor;
}

// Operations. Clock steps are TINY (0-2 ms) so equal timestamps are common:
// ties are where an ordering or cursor bug hides. Bursts reach 20, well past a
// page, which is the case the hook's hole-following exists for.
const opArb = fc.oneof(
  { weight: 4, arbitrary: fc.record({ op: fc.constant('post'), n: fc.integer({ min: 1, max: 20 }), dt: fc.integer({ min: 0, max: 2 }) }) },
  { weight: 2, arbitrary: fc.record({ op: fc.constant('delete'), index: fc.nat({ max: 60 }) }) },
  { weight: 3, arbitrary: fc.record({ op: fc.constant('poll') }) },
  { weight: 3, arbitrary: fc.record({ op: fc.constant('older') }) },
);

function assertWellFormed(client) {
  const ids = client.messages.map((m) => m.id);
  expect(new Set(ids).size, 'duplicate cards on the wall').toBe(ids.length);
  const sorted = [...client.messages].sort(compareNewest).map((m) => m.id);
  expect(ids, 'wall is not newest-first').toEqual(sorted);
}

function assertNothingMissing(client, server) {
  // After a poll: every server message is on screen, or strictly older than
  // the cursor (so "load older" will bring it). Anything else is a hole.
  const shown = new Set(client.messages.map((m) => m.id));
  const after = client.cursor ? decodeCursor(client.cursor) : null;
  const missing = server
    .all()
    .filter((m) => !shown.has(m.id) && !(after && isOlderThan(positionOf(m), after)));
  expect(missing.map((m) => m.id), 'messages neither shown nor reachable from the cursor').toEqual([]);
}

describe('guestbook paging — model-based', () => {
  it('never shows a duplicate, never breaks order, never loses a message', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 2 }), { maxLength: 40 }),
        fc.array(opArb, { minLength: 1, maxLength: 40 }),
        (seed, ops) => {
          const server = makeServer();
          seed.forEach((dt) => server.post(dt));
          const first = server.fetchPage(INITIAL_LIMIT);
          const client = { messages: first.list, cursor: first.nextCursor };
          assertWellFormed(client);

          for (const step of ops) {
            if (step.op === 'post') for (let i = 0; i < step.n; i += 1) server.post(i === 0 ? step.dt : 0);
            if (step.op === 'delete') server.deleteAt(step.index);
            if (step.op === 'poll') {
              poll(client, server);
              assertWellFormed(client);
              assertNothingMissing(client, server);
            }
            if (step.op === 'older') {
              loadOlder(client, server);
              assertWellFormed(client);
            }
          }

          // Drain: poll once, then page down to the end. Every message on the
          // server must now be on screen (deleted ones may linger below the
          // polled window until re-fetched; that is re-fetching, not loss).
          poll(client, server);
          while (client.cursor) loadOlder(client, server);
          const shown = new Set(client.messages.map((m) => m.id));
          expect(server.all().filter((m) => !shown.has(m.id))).toEqual([]);
        },
      ),
      // FC_RUNS=20000 for a deep local soak; CI's 400 keeps it under a second.
      { numRuns: Number(process.env.FC_RUNS) || 400 },
    );
  }, 300_000);

  it('round-trips every position through the cursor codec', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        fc.stringMatching(/^[\w-]{1,80}$/),
        (t, id) => {
          expect(decodeCursor(encodeCursor({ t, id }))).toEqual({ t, id });
        },
      ),
    );
  });

  it('rejects any string that is not a well-formed cursor, without throwing', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (raw) => {
        const decoded = decodeCursor(raw);
        if (decoded !== null) {
          // Anything accepted must re-encode to a cursor that decodes the same.
          expect(decodeCursor(encodeCursor(decoded))).toEqual(decoded);
          expect(Number.isSafeInteger(decoded.t)).toBe(true);
        }
      }),
    );
  });
});
