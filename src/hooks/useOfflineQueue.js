'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { QUEUE_KEY, postContactMessage, readJSON, writeJSON } from '@/lib/contact';

// Auto-drain cadence for items queued while already online — where there's no
// offline→online transition to ride. First retry after RETRY_BASE_MS, doubling
// up to RETRY_MAX_MS for as long as items keep failing, so a persistently-down
// mail server is retried gently rather than in a hot loop.
const RETRY_BASE_MS = 3000;
const RETRY_MAX_MS = 60000;

// useOfflineQueue — makes the contact form resilient to a dead connection.
// When a send can't reach the server (the visitor is offline, or the request
// fails at the transport layer), the message is parked in localStorage and
// retried automatically the moment the browser reports it's back online. The
// visitor can close the tab in between — the queue is durable.
//
// Lives at the Form WRAPPER level (above the FormContent remount-on-success), so
// the queue and its online/offline listeners survive each successful send.
//
// Returns:
//   online     — live navigator.onLine, kept current via online/offline events
//   pending    — number of messages waiting to be delivered
//   enqueue()  — park a message for later delivery
//   flush()    — attempt to deliver everything queued (also runs automatically
//                on reconnect, on mount, and — with backoff — whenever we're
//                online with a backlog, so items queued while already online
//                still drain)
export function useOfflineQueue() {
  // Default true so the SSR markup matches the common case; corrected on mount.
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const flushingRef = useRef(false);

  const enqueue = useCallback((params) => {
    const q = readJSON(QUEUE_KEY) || [];
    q.push({ ...params, queuedAt: Date.now() });
    writeJSON(QUEUE_KEY, q);
    setPending(q.length);
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const q = readJSON(QUEUE_KEY) || [];
    if (!q.length) return;

    flushingRef.current = true;
    try {
      const remaining = [];
      let sent = 0;
      for (const item of q) {
        const { queuedAt, ...params } = item;
        // eslint-disable-next-line no-await-in-loop
        const result = await postContactMessage(params);
        if (result.ok) sent += 1;
        else if (result.network) remaining.push(item); // dropped again → keep it
        // else: the server rejected it (e.g. validation) — it will never
        // succeed on retry, so drop it rather than loop forever.
      }
      // Re-read before writing: `enqueue()` may have appended new messages while
      // we were awaiting sends. Those live past `q.length` in the stored queue
      // (enqueue only ever appends, and flushingRef makes flushes mutually
      // exclusive), so carry them forward instead of clobbering them with our
      // stale snapshot.
      const newlyQueued = (readJSON(QUEUE_KEY) || []).slice(q.length);
      const nextQueue = [...remaining, ...newlyQueued];
      writeJSON(QUEUE_KEY, nextQueue);
      setPending(nextQueue.length);
      if (sent > 0) {
        toast.success(
          sent === 1
            ? 'Your held message was sent ✦'
            : `${sent} held messages were sent ✦`,
        );
      }
    } finally {
      flushingRef.current = false;
    }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    setPending((readJSON(QUEUE_KEY) || []).length);

    const onOnline = () => {
      setOnline(true);
      flush();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // If we loaded already-online with a leftover queue (e.g. the tab was closed
    // before reconnecting), try to drain it now.
    if (navigator.onLine) flush();

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flush]);

  // Auto-drain while online with a backlog. `flush()` above only fires on mount
  // and the `online` event, so a message queued *while already online* — a
  // transient send failure, the 500-retry path, or a `retryable` 409 — would be
  // held but never retried until an offline→online transition that may never
  // come. Keying on `pending` kicks the drain the moment something is queued.
  useEffect(() => {
    if (!online || pending === 0) return;

    let cancelled = false;
    let timer = null;
    let delay = RETRY_BASE_MS;

    const drain = async () => {
      if (cancelled) return;
      await flush();
      if (cancelled) return;
      // Re-arm from the live queue length, not `pending`: a failed flush leaves
      // the count unchanged, which wouldn't re-run this effect, so the loop must
      // reschedule itself (backing off) until the queue is actually empty.
      const remaining = (readJSON(QUEUE_KEY) || []).length;
      if (remaining === 0) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      delay = Math.min(delay * 2, RETRY_MAX_MS);
      timer = setTimeout(drain, delay);
    };

    timer = setTimeout(drain, delay);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [online, pending, flush]);

  return { online, pending, enqueue, flush };
}
