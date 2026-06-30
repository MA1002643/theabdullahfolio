'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// useMessageRefine — drives the "polish my missive" feature on the contact form.
// POSTs the visitor's rough message to /api/refine-message and reads the
// streamed text response chunk by chunk, exposing the rewrite as it materialises
// so the UI can show it building token by token (the part that feels premium).
//
// States:
//   idle      — nothing in flight, no suggestion shown
//   loading   — request sent, waiting for the first byte
//   streaming — tokens are arriving and `suggestion` is growing
//   done      — stream finished; `suggestion` holds the full rewrite
//   error     — request failed; `error` holds a friendly message
//
// The hook owns one in-flight request at a time: starting a new refine (or
// unmounting) aborts the previous stream so we never leak a reader or race two
// responses into the same state.
export function useMessageRefine() {
  const [status, setStatus] = useState('idle');
  const [suggestion, setSuggestion] = useState('');
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  // Abort any in-flight stream when the form unmounts (e.g. the post-send
  // remount, or navigating away mid-stream).
  useEffect(() => abort, [abort]);

  const reset = useCallback(() => {
    abort();
    setStatus('idle');
    setSuggestion('');
    setError(null);
  }, [abort]);

  const refine = useCallback(
    async (message) => {
      abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      // True only while THIS call still owns the in-flight slot. After every
      // await we re-check it: reset() or a newer refine() swaps controllerRef
      // out, and a stale stream must exit silently rather than commit suggestion
      // or status over the state the newer owner has already set. (Abort handles
      // most of this, but a response whose body was already buffered can resolve
      // post-abort without throwing — this guard closes that window.)
      const isCurrent = () => controllerRef.current === controller;

      setStatus('loading');
      setSuggestion('');
      setError(null);

      try {
        const res = await fetch('/api/refine-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });
        if (!isCurrent()) return;

        if (!res.ok || !res.body) {
          // The route returns JSON { message } on every error path; surface it
          // verbatim so the copy stays on-voice ("Write a little more first…").
          const data = await res.json().catch(() => null);
          if (!isCurrent()) return;
          setError(data?.message || 'Could not polish the message. Please try again.');
          setStatus('error');
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        setStatus('streaming');

        let acc = '';
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (!isCurrent()) return;
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setSuggestion(acc);
        }
        acc += decoder.decode(); // flush any multi-byte tail
        acc = acc.trim();

        if (!isCurrent()) return;
        if (!acc) {
          setError('Could not polish the message. Please try again.');
          setStatus('error');
          return;
        }
        setSuggestion(acc);
        setStatus('done');
      } catch (err) {
        // An intentional abort (new refine / unmount) is not a user-facing error.
        if (err?.name === 'AbortError') return;
        if (!isCurrent()) return;
        setError('Could not polish the message. Please try again.');
        setStatus('error');
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [abort],
  );

  return { status, suggestion, error, refine, reset };
}
