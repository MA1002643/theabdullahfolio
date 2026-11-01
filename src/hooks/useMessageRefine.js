'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

// useMessageRefine — drives the "polish my missive" feature on the contact form
// and the guestbook composer. POSTs the visitor's rough message to
// /api/refine-message and reads the streamed text response chunk by chunk,
// exposing the rewrite as it materialises so the UI can show it building token
// by token (the part that feels premium).
//
// `mode` picks the server's editorial contract ('guestbook' → a short casual
// one-liner; omitted → the contact form's professional-note default). It is
// only sent when set, so the request the deployed contact form makes is
// byte-identical to before the field existed.
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
export function useMessageRefine({ mode } = {}) {
  const [status, setStatus] = useState('idle');
  const [suggestion, setSuggestion] = useState('');
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);
  // Copy through a ref (issue #82) so `refine` keeps its identity across a
  // locale's renders. The route answers every error with a stable `error`
  // code beside its English `message`; the code picks the visitor's
  // language, the English is the fallback for a code this catalogue lacks.
  const t = useTranslations('Composer');
  const tRef = useRef(t);
  // Synced after render, never during it (react-hooks/refs).
  useEffect(() => {
    tRef.current = t;
  });
  const failed = () => tRef.current('refine.errors.failed');

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
          body: JSON.stringify(mode ? { message, mode } : { message }),
          signal: controller.signal,
        });
        if (!isCurrent()) return;

        if (!res.ok || !res.body) {
          // The route returns JSON { error, message } on every error path;
          // surface it in the visitor's language, on-voice ("Write a little
          // more first…").
          const data = await res.json().catch(() => null);
          if (!isCurrent()) return;
          const key = typeof data?.error === 'string' ? `refine.errors.${data.error}` : null;
          setError(key && tRef.current.has(key) ? tRef.current(key) : data?.message || failed());
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
          if (!isCurrent()) {
            // A newer refine()/reset() took over while this read was in flight.
            // Their abort() usually tears the stream down, but a response whose
            // body was already buffered can resolve post-abort without erroring
            // — so cancel explicitly to release the reader and close the
            // connection rather than leaving this stale stream open and hanging.
            reader.cancel().catch(() => {});
            return;
          }
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setSuggestion(acc);
        }
        acc += decoder.decode(); // flush any multi-byte tail
        acc = acc.trim();

        if (!isCurrent()) return;
        if (!acc) {
          setError(failed());
          setStatus('error');
          return;
        }
        setSuggestion(acc);
        setStatus('done');
      } catch (err) {
        // An intentional abort (new refine / unmount) is not a user-facing error.
        if (err?.name === 'AbortError') return;
        if (!isCurrent()) return;
        setError(failed());
        setStatus('error');
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [abort, mode],
  );

  return { status, suggestion, error, refine, reset };
}
