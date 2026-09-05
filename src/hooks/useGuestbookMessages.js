'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  MAX_PAGE_LIMIT,
  PAGE_SIZE,
  appendOlder,
  isOlderThan,
  mergeNewestPage,
  pageReachesPrefix,
  positionOf,
} from '@/lib/guestbook/paging';

// Data layer for the guestbook wall (issue #40): a cursor-paged read model
// plus the optimistic submit / react / delete flows. Messages live here rather
// than in the wall component so the input, the count badge and the list all
// read one source.
//
// THE READ MODEL IS A PREFIX. `messages` is the newest-first list from the top
// of the wall down to wherever the visitor has read — never the whole wall.
// GET /api/guestbook serves at most MAX_PAGE_LIMIT messages per call plus a
// separately-counted total, so payload, Redis commands and polling cost stay
// flat however long the wall grows:
//   · first load  → INITIAL_LIMIT (the current leaf and the one after it)
//   · a page flip → ensureLoaded() appends from the cursor until the target
//                   leaf — plus one ahead, so "next" is always instant — is in
//                   hand; a rail jump far down the wall takes a few bounded
//                   requests, not one unbounded one
//   · the poll    → the newest page, merged, never stomped — following it
//                   down, page by page, when more than a page has landed
//                   since the last poll, until it reaches the prefix (see
//                   poll: bounded at POLL_MAX_FETCHES, then a restart)
//   · a deep link → loadUntil(id) walks older pages until the mark appears,
//                   capped at DEEP_LINK_MAX_FETCHES requests
// `count` is the server's total plus any optimistic card still pending, so
// the "N marks left" pill and the page rail know the wall's size even when
// only its top is loaded. `hasMore` says whether the prefix has reached the
// oldest message.
//
// One id set rides along for presentation:
//   newIds — ids confirmed AFTER first load (own posts now; polled-in
//            messages in the elite layer). The wall uses this for the brief
//            "new message" glow and the aria-live announcement, and retires
//            it on a page flip via clearNewIds — an arrival moment shouldn't
//            replay when its card remounts pages later. Older pages appended
//            by ensureLoaded are never "new": they were there all along.

const INITIAL_LIMIT = PAGE_SIZE * 2;
// A deep link to a mark far down the wall walks at most this many pages
// (MAX_PAGE_LIMIT each); beyond that — or for a deleted/mangled id — the hash
// is simply a no-op, exactly as it is for an id that matches nothing.
const DEEP_LINK_MAX_FETCHES = 10;
// ensureLoaded's own loop guard: a rail jump can need several requests, but
// never an unbounded number.
const ENSURE_MAX_FETCHES = 10;
// How far a poll follows the newest page down before it must reach the local
// prefix (see poll): five pages is forty arrivals in one poll interval, which
// the one-post-per-user-per-five-minutes limit makes a forty-author burst.
const POLL_MAX_FETCHES = 5;

async function fetchPage(limit, cursor) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set('cursor', cursor);
  const res = await fetch(`/api/guestbook?${qs}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const data = await res.json();
  return {
    list: Array.isArray(data.messages) ? data.messages : [],
    count: Number.isFinite(data.count) ? data.count : 0,
    nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
  };
}

function dedupeById(list) {
  const seen = new Set();
  return list.filter((m) => (seen.has(m.id) ? false : seen.add(m.id)));
}

// The wall state with a new total, its change counter bumped (see setTotal).
const withTotal = (w, total) => ({ ...w, total, seq: (w.seq ?? 0) + 1 });

export function useGuestbookMessages({ pollMs = 0 } = {}) {
  // The list and the server's total live in ONE state object so the
  // race-prone moments below — a POST's 201, a DELETE's 200 or a DELETE's
  // FAILURE landing after a poll has already seen the server's side of it —
  // can settle both from a single functional updater, against the list as it
  // actually is. `seq` counts writes to the total (withTotal), so a rollback
  // can tell whether a read moved it in the meantime. Every other site goes
  // through the two thin setters, unchanged in shape.
  const [wall, setWall] = useState({ list: null, total: 0, seq: 0 });
  const messages = wall.list; // null = first load in flight
  const total = wall.total; // the server's count of confirmed marks
  const setMessages = useCallback((next) => {
    setWall((w) => ({
      ...w,
      list: typeof next === 'function' ? next(w.list) : next,
    }));
  }, []);
  // Every write to the total also bumps `seq` — a change counter the failed-
  // delete rollback compares against, to tell "the total is still my
  // optimistic decrement" from "a read settled it since" without guessing
  // from the value (two totals can coincide; a counter cannot).
  const setTotal = useCallback((next) => {
    setWall((w) =>
      withTotal(w, typeof next === 'function' ? next(w.total) : next),
    );
  }, []);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newIds, setNewIds] = useState(() => new Set());
  // Ref mirror so callbacks (react's toggle decision, the loaders' dedupe)
  // can read the current list without re-binding on every state change.
  const messagesRef = useRef(null);
  // Paging bookkeeping the async loaders read WITHOUT waiting for a render:
  // the cursor to continue from (undefined = nothing loaded yet, null = the
  // oldest message is in hand) and the prefix length as the loaders last
  // knew it (re-synced from state on every render, bumped in place as pages
  // land, so a multi-request rail jump can count without a render between).
  const pagingRef = useRef({ cursor: undefined, length: 0 });
  useEffect(() => {
    messagesRef.current = messages;
    pagingRef.current.length = messages?.length ?? 0;
  }, [messages]);

  const setCursor = useCallback((cursor) => {
    pagingRef.current.cursor = cursor;
    setHasMore(Boolean(cursor));
  }, []);

  // Every loader runs through one queue, strictly one at a time, so a poll
  // can never interleave with a page fetch and read a half-updated cursor.
  // A rejected task must not wedge the chain — each caller still sees its
  // own outcome.
  const queueRef = useRef(Promise.resolve());
  const enqueue = useCallback((task) => {
    const run = queueRef.current.then(task, task);
    queueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  // First load / "Try again": start the prefix over from the top. Pending
  // optimistic cards ride on top of whatever comes back.
  const load = useCallback(
    () =>
      enqueue(async () => {
        try {
          const { list, count, nextCursor } = await fetchPage(INITIAL_LIMIT);
          setMessages((prev) =>
            dedupeById([...(prev ?? []).filter((m) => m.pending), ...list]),
          );
          setCursor(nextCursor);
          setTotal(count);
          setLoadError(null);
        } catch (err) {
          // Keep whatever is already rendered; only surface the failure when
          // there is nothing on the wall at all.
          setLoadError(err);
          setMessages((prev) => prev ?? []);
        }
      }),
    [enqueue, setCursor, setMessages, setTotal],
  );

  // Live refresh: the NEWEST page, merged into the prefix (paging.js
  // mergeNewestPage): arrivals are flagged new, the window the page covers is
  // replaced by the server's copy (a card deleted elsewhere leaves, reaction
  // counts refresh), and the older local tail is kept as it was.
  //
  // THE HOLE (code review). When more than a page lands between two polls,
  // one page shows only the newest PAGE_SIZE of them. Merged above the old
  // tail, the rest would sit in a hole between the two — and because the
  // prefix's continuation cursor still points below that tail, no later
  // fetch could ever recover them: a silent loss. So a full page that does
  // not reach the prefix (paging.js pageReachesPrefix) is followed down,
  // page by page from its own cursor, until one does — at most
  // POLL_MAX_FETCHES requests. Past that bound the prefix restarts from the
  // top with what was fetched, contiguous by construction, and the older
  // leaves refill from that cursor as the visitor pages to them: cards
  // re-fetched, never cards missing.
  const poll = useCallback(
    () =>
      enqueue(async () => {
        try {
          const loaded = messagesRef.current;
          const prev = loaded ?? [];
          let { list: pages, count, nextCursor } = await fetchPage(PAGE_SIZE);
          let requested = PAGE_SIZE;
          for (
            let fetches = 1;
            nextCursor &&
            fetches < POLL_MAX_FETCHES &&
            !pageReachesPrefix(pages, prev, requested);
            fetches += 1
          ) {
            const more = await fetchPage(PAGE_SIZE, nextCursor);
            pages = dedupeById([...pages, ...more.list]);
            requested += PAGE_SIZE;
            ({ count, nextCursor } = more);
          }

          // Arrivals glow — but only once there IS a wall to arrive on.
          if (loaded) {
            const known = new Set(loaded.map((m) => m.id));
            const fresh = pages.filter((m) => !known.has(m.id)).map((m) => m.id);
            if (fresh.length) {
              setNewIds((s) => {
                const next = new Set(s);
                for (const id of fresh) next.add(id);
                return next;
              });
            }
          }

          if (pageReachesPrefix(pages, prev, requested)) {
            setMessages((cur) => mergeNewestPage(cur ?? [], pages, requested));
            // The fetched cursor only continues from the fetched pages: while
            // the merge keeps the prefix's older tail, the prefix's own cursor
            // is the one to keep — unless the server says there is nothing
            // older at all, which is true regardless of what we hold.
            const tailKept =
              pages.length >= requested &&
              prev.some(
                (m) =>
                  !m.pending &&
                  isOlderThan(positionOf(m), positionOf(pages[pages.length - 1])),
              );
            if (!nextCursor || !tailKept) setCursor(nextCursor);
          } else {
            // The walk hit its bound without reaching the prefix. A prefix
            // with a hole in it is the one thing never to keep: restart it
            // from the top with the contiguous run just fetched, pending
            // cards riding on top, and continue from that run's own cursor.
            setMessages((cur) => [
              ...(cur ?? []).filter((m) => m.pending),
              ...pages,
            ]);
            setCursor(nextCursor);
          }
          setTotal(count);
          setLoadError(null);
        } catch (err) {
          setLoadError(err);
          setMessages((prev) => prev ?? []);
        }
      }),
    [enqueue, setCursor, setMessages, setTotal],
  );

  // One older page from the cursor, appended. NOT queued itself — the callers
  // below are, and may issue several in one queued task. Resolves with what
  // landed, or null on failure (the error is surfaced through loadError).
  const fetchMore = useCallback(
    async (limit) => {
      const cursor = pagingRef.current.cursor;
      if (!cursor) return { list: [], added: 0, done: true };
      setLoadingMore(true);
      try {
        const { list, count, nextCursor } = await fetchPage(limit, cursor);
        const known = new Set((messagesRef.current || []).map((m) => m.id));
        const added = list.filter((m) => !known.has(m.id)).length;
        setMessages((prev) => appendOlder(prev ?? [], list));
        pagingRef.current.length += added;
        setCursor(nextCursor);
        setTotal(count);
        setLoadError(null);
        return { list, added, done: !nextCursor };
      } catch (err) {
        setLoadError(err);
        return null;
      } finally {
        setLoadingMore(false);
      }
    },
    [setCursor, setMessages, setTotal],
  );

  // Make sure the prefix extends through `throughIndex` (a card index in the
  // wall's slicing), fetching as few bounded pages as that takes. Resolves
  // true when the index is covered or the wall simply ends before it, false
  // when a fetch failed.
  const ensureLoaded = useCallback(
    (throughIndex) =>
      enqueue(async () => {
        for (let i = 0; i < ENSURE_MAX_FETCHES; i++) {
          const { cursor, length } = pagingRef.current;
          if (!cursor || length > throughIndex) return true;
          const need = throughIndex + 1 - length;
          const got = await fetchMore(
            Math.min(MAX_PAGE_LIMIT, Math.max(PAGE_SIZE, need)),
          );
          if (!got) return false;
          // The wall ended, or the server handed back nothing we lacked —
          // either way there is nothing further to wait for.
          if (got.done || got.added === 0) return true;
        }
        return true;
      }),
    [enqueue, fetchMore],
  );

  // Walk older pages until the message with `id` is in the prefix. Resolves
  // true once it is (the caller finds its index on the next render), false
  // when the wall ended, the walk hit its cap, or a fetch failed.
  const loadUntil = useCallback(
    (id) =>
      enqueue(async () => {
        if ((messagesRef.current || []).some((m) => m.id === id)) return true;
        for (let i = 0; i < DEEP_LINK_MAX_FETCHES; i++) {
          if (!pagingRef.current.cursor) return false;
          const got = await fetchMore(MAX_PAGE_LIMIT);
          if (!got) return false;
          if (got.list.some((m) => m.id === id)) return true;
          if (got.done) return false;
        }
        return false;
      }),
    [enqueue, fetchMore],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Gentle live refresh (issue #40 Phase 4, rides the presence flag): re-read
  // the newest page on an interval, skipped entirely while the tab is hidden,
  // with an immediate catch-up read when the tab comes back.
  useEffect(() => {
    if (!pollMs) return undefined;
    const tick = () => {
      if (!document.hidden) poll();
    };
    const timer = setInterval(tick, pollMs);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pollMs, poll]);

  // Optimistic submit. `user` is the session user (name/username/image) — the
  // server ignores any author the client sends, this copy exists purely so the
  // pending card can render the right identity instantly. `signature` is an
  // optional path string (already client-validated by construction; the server
  // re-validates regardless). Returns true when the server confirmed, so the
  // input knows whether to clear or restore.
  const submit = useCallback(
    async (text, user, signature = null) => {
      if (submitting) return false;
      setSubmitting(true);

      const provider = user?.provider || 'github';
      const optimistic = {
        id: `temp_${Date.now()}`,
        // Mirror the server's PUBLIC author shape on the pending card: a
        // GitHub login is public (the card links it); a Google author has no
        // handle — their identity key is internal and no message the server
        // serves carries it — so the pending card carries none either and
        // shows the name.
        author: {
          name: user?.name || user?.username || 'You',
          ...(provider === 'github' && user?.username
            ? { username: user.username }
            : {}),
          avatar: user?.image || null,
          provider,
        },
        message: text,
        ...(signature ? { signature } : {}),
        createdAt: new Date().toISOString(),
        pending: true,
        // Ownership is the server's call per viewer (`isOwn`); for the card
        // the viewer is posting right now, it is true by construction.
        isOwn: true,
      };
      setMessages((prev) => [optimistic, ...(prev ?? [])]);

      try {
        const res = await fetch('/api/guestbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            signature ? { message: text, signature } : { message: text },
          ),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Failed to post message');
        }
        // The server stores the message before it answers, so a read that ran
        // while the POST was in flight can already reflect it. Settle INSIDE
        // the updater, against the list as it actually is — the ref mirror
        // can be a render behind. THE CARD: a poll or reload re-reads the
        // newest page, so it may have brought the real id in beside the
        // pending card — drop that copy first, then let the pending card
        // become the server's copy in its slot (otherwise the swap would mint
        // a second card with the same id). THE TOTAL: settled from the 201's
        // own `count`, the size the server read just after the store — never
        // by incrementing. Whether the list holds the id says nothing about
        // the total: an older-page fetch in flight (a rail jump, a deep link)
        // cannot list a message newer than its cursor, yet the count it
        // carried already included it, and adding one to that was a double
        // count. The list heuristic survives only as the fallback for a 201
        // without a count (an older server mid-deploy).
        const { count, ...confirmed } = data;
        setWall((w) => {
          const list = w.list ?? [];
          const polled = list.some((m) => m.id === confirmed.id);
          const base = polled ? list.filter((m) => m.id !== confirmed.id) : list;
          const next = {
            ...w,
            list: base.map((m) => (m.id === optimistic.id ? confirmed : m)),
          };
          return Number.isFinite(count)
            ? withTotal(next, count)
            : polled
              ? next
              : withTotal(next, w.total + 1);
        });
        setNewIds((prev) => new Set(prev).add(confirmed.id));
        toast.success('Message posted!');
        return true;
      } catch (err) {
        setMessages((prev) =>
          (prev ?? []).filter((m) => m.id !== optimistic.id),
        );
        toast.error(err.message || 'Failed to post message');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, setMessages],
  );

  // Optimistic reaction toggle (issue #40 Phase 4). `clearing` is decided by
  // the CALLER's click semantics (clicking your active reaction clears it);
  // counts are patched immediately, the POST carries the desired end state,
  // and a failed request restores the exact previous message object.
  const react = useCallback(async (id, key, clearing) => {
    const prev = (messagesRef.current || []).find((m) => m.id === id);
    if (!prev) return false;

    setMessages((list) =>
      (list ?? []).map((m) => {
        if (m.id !== id) return m;
        const counts = { ...(m.reactions || {}) };
        if (m.viewerReaction) {
          counts[m.viewerReaction] = Math.max(
            0,
            (counts[m.viewerReaction] || 0) - 1,
          );
        }
        if (!clearing) counts[key] = (counts[key] || 0) + 1;
        return {
          ...m,
          reactions: counts,
          viewerReaction: clearing ? null : key,
        };
      }),
    );

    try {
      const res = await fetch('/api/guestbook/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clearing ? { id, key, clear: true } : { id, key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to react');
      // Server truth wins — someone else may have reacted since our snapshot.
      setMessages((list) =>
        (list ?? []).map((m) =>
          m.id === id
            ? {
                ...m,
                reactions: data.reactions,
                viewerReaction: data.viewerReaction,
              }
            : m,
        ),
      );
      return true;
    } catch (err) {
      setMessages((list) =>
        (list ?? []).map((m) => (m.id === id ? prev : m)),
      );
      toast.error(err.message || 'Failed to react');
      return false;
    }
  }, [setMessages]);

  // Optimistic delete (the bin button — your own card, or any card when the
  // viewer is the wall's admin). The card leaves the wall instantly and the
  // total drops with it; a failed DELETE splices the exact previous object
  // back at its original index, restores the total, and says why. The route
  // enforces own-or-admin server-side — this mirrors the submit flow's trust
  // model (client optimism, server authority). `own` only picks the toast
  // copy, so a moderation delete never claims the message was "yours".
  const remove = useCallback(async (id, { own = true } = {}) => {
    const prevList = messagesRef.current || [];
    const idx = prevList.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    const target = prevList[idx];
    // One updater for the optimistic step, which also notes the change
    // counter its decrement lands under — the rollback below restores the
    // total only if that counter is still current, i.e. no read has settled
    // the total in the meantime.
    let decrementSeq = null;
    setWall((w) => {
      const next = withTotal(
        { ...w, list: (w.list ?? []).filter((m) => m.id !== id) },
        Math.max(0, w.total - 1),
      );
      decrementSeq = next.seq;
      return next;
    });

    try {
      const res = await fetch(`/api/guestbook?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete message');
      // The mirror of the submit race: a poll that ran while the DELETE was
      // in flight still saw the message on the server and revived the card;
      // any read in flight — an older page included — may have carried a
      // count that still had it. Now that the server has confirmed, the
      // revived card goes, and the total is the 200's own `count`, the size
      // after the removal — whether or not the fetched page held the card.
      // Without a count (an older server) the revival decides, as before.
      setWall((w) => {
        const list = w.list ?? [];
        const revived = list.some((m) => m.id === id);
        const settled = Number.isFinite(data.count);
        if (!revived && !settled) return w;
        const next = { ...w, list: revived ? list.filter((m) => m.id !== id) : list };
        return settled
          ? withTotal(next, data.count)
          : revived
            ? withTotal(next, Math.max(0, w.total - 1))
            : next;
      });
      toast.success(
        own
          ? 'Your message was removed from the guestbook'
          : 'Message removed from the guestbook',
      );
      return true;
    } catch (err) {
      // The rollback, reconciled in ONE updater against the wall as it
      // actually is (code review). The server still has the message, and a
      // poll or reload that ran while the DELETE was pending saw it there —
      // so it may already have revived the card and settled the total. The
      // old two-step rollback spliced the saved copy back regardless and
      // added one on top, leaving a duplicate card and a count one too high.
      // Now the card returns only if it is not already back, and the total
      // goes back up only if nothing has written it since the optimistic
      // decrement (the change counter is still the decrement's); a total a
      // read has settled is the server's, and stays.
      setWall((w) => {
        const list = w.list ?? [];
        const present = list.some((m) => m.id === id);
        let nextList = list;
        if (!present) {
          nextList = [...list];
          nextList.splice(Math.min(idx, nextList.length), 0, target);
        }
        const untouched = w.seq === decrementSeq;
        const next = { ...w, list: nextList };
        return untouched ? withTotal(next, w.total + 1) : next;
      });
      toast.error(err.message || 'Failed to delete message');
      return false;
    }
  }, []);

  // Retire the "new arrival" markers (glow + solo entrance). The wall calls
  // this on a page flip: the ignite is an arrival moment, and remounting a
  // card three navigations later shouldn't replay it. Same-set no-op when
  // already empty so an idle flip doesn't schedule a render.
  const clearNewIds = useCallback(() => {
    setNewIds((prev) => (prev.size ? new Set() : prev));
  }, []);

  // The wall's size as the visitor should read it: every confirmed mark the
  // server knows of, plus the ones they have just posted that are still on
  // their way (so the pill ticks up the instant they press send).
  const pendingCount = useMemo(
    () => (messages ?? []).filter((m) => m.pending).length,
    [messages],
  );

  return {
    messages,
    count: total + pendingCount,
    hasMore,
    loading: messages === null,
    loadingMore,
    loadError,
    submit,
    submitting,
    react,
    remove,
    reload: load,
    ensureLoaded,
    loadUntil,
    newIds,
    clearNewIds,
  };
}
