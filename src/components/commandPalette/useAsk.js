'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ASK_LIMITS, FIT_LIMITS, askable, normaliseJob, normaliseQuestion } from '@/lib/ask/limits';
import { createEventDecoder } from '@/lib/ask/protocol';

// The client half of the palette's research assistant (issue #41 §4). One
// request at a time, in either mode:
//
//   ask  POST { question, locale, path, history } → a reasoning trace (live
//        tool steps), an answer with inline citations, its sources, and
//        follow-up questions;
//   fit  POST { mode: 'fit', job, locale } → requirement rows, one at a time.
//
// The NDJSON stream (src/lib/ask/protocol.js) is folded into render state by
// `applyEvents`, a pure reducer the unit suite drives directly. Each network
// chunk's events are applied in ONE state update, so a burst of tokens is one
// render. Asking again, going back or closing aborts the request in flight;
// the server passes the abort to the model, so an abandoned answer stops
// costing anything.
//
// Conversation memory: after each completed answer the hook keeps the
// question and the answer's plain text (citations stripped) for the last
// ASK_LIMITS.historyTurns turns, and sends them with the next question, so a
// follow-up like "and what about testing?" resolves. The server re-validates
// and bounds every field.

export const IDLE = Object.freeze({
  mode: 'ask',
  status: 'idle', // idle → pending → streaming → done | error
  question: '',
  segments: [], // [{ t: 'text', v } | { t: 'cite', id }]
  sources: [], // [{ id, kind, href, label? }] in first-cited order
  trace: [], // [{ id, tool, status, data? } | { id, note }]
  followups: [],
  rows: [], // fit rows
  meta: null, // { facts, model }
  stats: null, // { ms, steps }
  error: null,
});

const ERROR_COPY = {
  unconfigured: 'unavailable',
  unavailable: 'unavailable',
  rate_limited: 'rateLimited',
  budget: 'budget',
  too_short: 'invalid',
  too_long: 'invalid',
  bad_request: 'invalid',
  too_large: 'invalid',
  offline: 'offline',
};
export const errorCopyKey = (code) => ERROR_COPY[code] ?? 'failed';

/** The answer's plain text: what the visitor reads, without citation marks. */
export const plainText = (segments) =>
  segments.map((s) => (s.t === 'text' ? s.v : '')).join('').replace(/\s+([.,;:!?،。])/g, '$1').trim();

function appendText(segments, text) {
  const last = segments[segments.length - 1];
  if (last?.t === 'text') return [...segments.slice(0, -1), { t: 'text', v: last.v + text }];
  return [...segments, { t: 'text', v: text }];
}

/** Folds wire events into state. Pure. */
export function applyEvents(state, events) {
  let s = state;
  for (const event of events) {
    if (s.status === 'done' || s.status === 'error') break;
    const streaming = s.status === 'pending' ? 'streaming' : s.status;
    switch (event.type) {
      case 'meta':
        s = { ...s, meta: { facts: event.facts, model: event.model } };
        break;
      case 'text':
        s = { ...s, status: streaming, segments: appendText(s.segments, event.text) };
        break;
      case 'cite':
        if (s.sources.some((src) => src.id === event.id)) {
          s = { ...s, status: streaming, segments: [...s.segments, { t: 'cite', id: event.id }] };
        }
        break;
      case 'source':
        if (!s.sources.some((src) => src.id === event.id) && s.sources.length < ASK_LIMITS.maxSources * 2) {
          const { type, ...source } = event;
          s = { ...s, sources: [...s.sources, source] };
        }
        break;
      case 'retract': {
        // What was written before a tool call was the agent's plan: it moves
        // into the trace, and the answer starts again.
        const note = plainText(s.segments);
        s = {
          ...s,
          segments: [],
          trace: note ? [...s.trace, { id: `note-${s.trace.length}`, note }] : s.trace,
        };
        break;
      }
      case 'step': {
        const existing = s.trace.findIndex((row) => row.id === event.id);
        const row = { id: event.id, tool: event.tool, status: event.status, data: event.data };
        const trace =
          existing === -1
            ? [...s.trace, row]
            : s.trace.map((r, i) => (i === existing ? { ...r, ...row, data: row.data ?? r.data } : r));
        s = { ...s, status: streaming, trace };
        break;
      }
      case 'followups':
        s = { ...s, followups: event.questions.slice(0, 3) };
        break;
      case 'fit-row':
        if (s.rows.length < FIT_LIMITS.maxRows) s = { ...s, status: streaming, rows: [...s.rows, event.row] };
        break;
      case 'done':
        s = { ...s, status: 'done', stats: { ms: event.ms ?? null, steps: event.steps ?? 0 } };
        break;
      case 'error':
        s = { ...s, status: 'error', error: event.code };
        break;
      default:
        break;
    }
  }
  return s;
}

/**
 * The sources an answer actually uses, numbered by first citation. A source
 * cited only in retracted plan text, or never cited, is not shown.
 */
export function citedSources(state) {
  const order = [];
  for (const seg of state.segments) {
    if (seg.t === 'cite' && !order.includes(seg.id)) order.push(seg.id);
  }
  return order
    .map((id) => state.sources.find((s) => s.id === id))
    .filter(Boolean)
    .slice(0, ASK_LIMITS.maxSources);
}

/**
 * One request, start to finish: POSTs `body`, folds the NDJSON stream into a
 * state that starts as `initial`, and hands every new snapshot to `onUpdate`
 * (never after `signal` aborts). Resolves with the last state. Shared by the
 * hook below and the Ask conversation store (askSession.js).
 *
 * The state is owned HERE and pushed out as snapshots: reading it back out of
 * a React setState updater would be wrong (React runs updaters at render
 * time, not when they are queued).
 */
export async function streamRequest({ endpoint = '/api/ask', body, signal, initial, onUpdate }) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const offline = { ...initial, status: 'error', error: 'offline' };
    onUpdate(offline);
    return offline;
  }
  let local = { ...initial, status: 'pending' };
  const commit = (next) => {
    local = next;
    if (!signal?.aborted) onUpdate(next);
  };
  onUpdate(local);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      let code = 'failed';
      try {
        code = (await res.json())?.error || code;
      } catch {
        // Not JSON (a proxy's HTML error page): a plain failure.
      }
      commit({ ...local, status: 'error', error: code });
      return local;
    }
    const reader = res.body.getReader();
    const decoder = createEventDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (signal?.aborted) return local;
      const events = done ? decoder.end() : decoder.push(value);
      if (events.length) commit(applyEvents(local, events));
      if (done) break;
    }
    // A body that ended without `done` or `error` was cut off.
    if (local.status !== 'done' && local.status !== 'error') {
      commit({ ...local, status: 'error', error: 'failed' });
    }
  } catch {
    if (!signal?.aborted) commit({ ...local, status: 'error', error: 'failed' });
  }
  return local;
}

export function useAsk({ locale, path, endpoint = '/api/ask' }) {
  const [state, setState] = useState(IDLE);
  const controllerRef = useRef(null);
  const historyRef = useRef([]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const run = useCallback(
    async (mode, body, label) => {
      cancel();
      const controller = new AbortController();
      controllerRef.current = controller;
      let local;
      try {
        local = await streamRequest({
          endpoint,
          body,
          signal: controller.signal,
          initial: { ...IDLE, mode, question: label },
          onUpdate: setState,
        });
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        // Remember a completed answer for the next follow-up.
        if (mode === 'ask' && local?.status === 'done' && !controller.signal.aborted) {
          const a = plainText(local.segments);
          if (a) {
            historyRef.current = [
              ...historyRef.current,
              { q: label, a: a.slice(0, ASK_LIMITS.historyAnswerMax) },
            ].slice(-ASK_LIMITS.historyTurns);
          }
        }
      }
    },
    [cancel, endpoint],
  );

  const ask = useCallback(
    (raw) => {
      const question = normaliseQuestion(raw);
      if (!askable(question)) {
        setState({ ...IDLE, status: 'error', error: 'too_short', question });
        return Promise.resolve();
      }
      return run('ask', { question, locale, path, history: historyRef.current }, question);
    },
    [run, locale, path],
  );

  const checkFit = useCallback(
    (raw) => {
      const job = normaliseJob(raw);
      if (job.length < FIT_LIMITS.minLen || job.length > FIT_LIMITS.maxLen) {
        setState({ ...IDLE, mode: 'fit', status: 'error', error: job.length > FIT_LIMITS.maxLen ? 'too_long' : 'too_short' });
        return Promise.resolve();
      }
      return run('fit', { mode: 'fit', job, locale }, '');
    },
    [run, locale],
  );

  /** Starts a fresh conversation (the panel calls it on a new top-level ask). */
  const forget = useCallback(() => {
    historyRef.current = [];
  }, []);

  // Nothing may keep streaming into a panel that is gone.
  useEffect(() => cancel, [cancel]);

  return { ...state, ask, checkFit, cancel, forget, history: historyRef };
}
