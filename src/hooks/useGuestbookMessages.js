'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// Data layer for the guestbook wall (issue #40): fetch-on-mount plus the
// optimistic submit flow — the card appears instantly with `pending: true`
// (shimmer), is swapped for the server's copy on 201, and is rolled back with
// an error toast on anything else. Messages live here rather than in the wall
// component so the input, the count badge and the list all read one source.
//
// One id set rides along for presentation:
//   newIds — ids confirmed AFTER first load (own posts now; polled-in
//            messages in the elite layer). The wall uses this for the brief
//            "new message" glow and the aria-live announcement, and retires
//            it on a page flip via clearNewIds — an arrival moment shouldn't
//            replay when its card remounts pages later. (The old initialIds
//            set is gone: since the wall went paginated, every mount cohort
//            — first load or page flip — staggers by in-page index, and a
//            fresh arrival lands at index 0, i.e. zero delay by construction.)
export function useGuestbookMessages({ pollMs = 0 } = {}) {
  const [messages, setMessages] = useState(null); // null = first load in flight
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [newIds, setNewIds] = useState(() => new Set());
  // Ref mirror so callbacks (react's toggle decision) can read the current
  // list without re-binding on every state change.
  const messagesRef = useRef(null);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/guestbook');
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      const list = Array.isArray(data.messages) ? data.messages : [];
      setMessages((prev) => {
        if (!prev) return list;
        // A refresh (poll) merges rather than stomps: ids we have not seen
        // are flagged new (glow + announcement + headline re-scramble), and
        // any optimistic pending card rides on top until its POST resolves.
        const known = new Set(prev.map((m) => m.id));
        const fresh = list.filter((m) => !known.has(m.id)).map((m) => m.id);
        if (fresh.length) {
          setNewIds((s) => {
            const next = new Set(s);
            for (const id of fresh) next.add(id);
            return next;
          });
        }
        const pending = prev.filter((m) => m.pending);
        return [...pending, ...list];
      });
      setLoadError(null);
    } catch (err) {
      // Keep whatever is already rendered; only surface the failure when there
      // is nothing on the wall at all.
      setLoadError(err);
      setMessages((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Gentle live refresh (issue #40 Phase 4, rides the presence flag): re-read
  // the wall on an interval, skipped entirely while the tab is hidden, with
  // an immediate catch-up read when the tab comes back.
  useEffect(() => {
    if (!pollMs) return undefined;
    const tick = () => {
      if (!document.hidden) load();
    };
    const timer = setInterval(tick, pollMs);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pollMs, load]);

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

      const optimistic = {
        id: `temp_${Date.now()}`,
        author: {
          name: user?.name || user?.username || 'You',
          username: user?.username || '',
          avatar: user?.image || null,
          // Mirror the server's presentation rules on the pending card — a
          // Google author must never flash their internal id.
          provider: user?.provider || 'github',
        },
        message: text,
        ...(signature ? { signature } : {}),
        createdAt: new Date().toISOString(),
        pending: true,
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
        setMessages((prev) =>
          (prev ?? []).map((m) => (m.id === optimistic.id ? data : m)),
        );
        setNewIds((prev) => new Set(prev).add(data.id));
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
    [submitting],
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
  }, []);

  // Optimistic delete (the bin button — your own card, or any card when the
  // viewer is the wall's admin). The card leaves the wall instantly; a failed
  // DELETE splices the exact previous object back at its original index and
  // says why. The route enforces own-or-admin server-side — this mirrors the
  // submit flow's trust model (client optimism, server authority). `own`
  // only picks the toast copy, so a moderation delete never claims the
  // message was "yours".
  const remove = useCallback(async (id, { own = true } = {}) => {
    const prevList = messagesRef.current || [];
    const idx = prevList.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    const target = prevList[idx];
    setMessages((list) => (list ?? []).filter((m) => m.id !== id));

    try {
      const res = await fetch(`/api/guestbook?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete message');
      toast.success(
        own
          ? 'Your message was removed from the guestbook'
          : 'Message removed from the guestbook',
      );
      return true;
    } catch (err) {
      setMessages((list) => {
        const next = [...(list ?? [])];
        next.splice(Math.min(idx, next.length), 0, target);
        return next;
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

  return {
    messages,
    loading: messages === null,
    loadError,
    submit,
    submitting,
    react,
    remove,
    reload: load,
    newIds,
    clearNewIds,
  };
}
