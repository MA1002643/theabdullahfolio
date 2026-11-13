'use client';

import { useSyncExternalStore } from 'react';
import { ASK_LIMITS, askable, normaliseQuestion } from '@/lib/ask/limits';
import { IDLE, plainText, streamRequest } from './useAsk';

// The Ask conversations (issue #41), kept OUTSIDE the panel that shows them.
//
// The Ask view used to own its one conversation in component state, so going
// back to the command list, or closing the palette, threw it away, and there
// was only ever one thread. This store lets the view work like a chat client:
// a sidebar of conversations, each a list of turns, which survives the panel
// unmounting (back to the list, the palette closing, a client-side route
// change).
//
// It is memory only, for the life of the page: nothing goes to localStorage
// or sessionStorage, so a reload starts clean and there is nothing new to
// disclose on /privacy. What reaches the server is unchanged: the question,
// the locale, the page path and, for a follow-up, the last
// ASK_LIMITS.historyTurns turns OF THAT CONVERSATION.
//
// One request runs at a time across every conversation. Asking again while an
// answer streams stops that answer (it keeps what arrived, marked stopped).
// The palette calls `stop()` when it closes, so an abandoned answer stops
// costing anything, as before.

const MAX_CONVERSATIONS = 12;
const MAX_TURNS = 30;

const EMPTY = Object.freeze({ conversations: [], activeId: null, streaming: null });

let state = EMPTY;
let inflight = null; // { controller, conversationId, turnId }
let seq = 0;
const listeners = new Set();

const emit = (next) => {
  state = next;
  for (const fn of listeners) fn();
};

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getSnapshot = () => state;
const getServerSnapshot = () => EMPTY;

/** The whole session: { conversations, activeId, streaming }. */
export function useAskSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The conversation being shown, or null for a fresh one not yet asked. */
export function activeConversation(s = state) {
  return s.conversations.find((c) => c.id === s.activeId) ?? null;
}

function patchTurn(conversationId, turnId, answer) {
  emit({
    ...state,
    conversations: state.conversations.map((c) =>
      c.id !== conversationId
        ? c
        : { ...c, turns: c.turns.map((t) => (t.id === turnId ? { ...t, answer } : t)) },
    ),
  });
}

/** Stops the answer in flight, keeping what has arrived. */
export function stop() {
  if (!inflight) return;
  const { controller, conversationId, turnId } = inflight;
  inflight = null;
  controller.abort();
  const turn = state.conversations
    .find((c) => c.id === conversationId)
    ?.turns.find((t) => t.id === turnId);
  if (turn && (turn.answer.status === 'pending' || turn.answer.status === 'streaming')) {
    patchTurn(conversationId, turnId, { ...turn.answer, status: 'stopped' });
  }
  emit({ ...state, streaming: null });
}

/** Shows an empty conversation; it is created by its first question. */
export function startNew() {
  emit({ ...state, activeId: null });
}

export function select(id) {
  if (state.conversations.some((c) => c.id === id)) emit({ ...state, activeId: id });
}

/** The completed turns a follow-up carries, oldest first. */
export function historyOf(conversation) {
  if (!conversation) return [];
  return conversation.turns
    .filter((t) => t.answer.status === 'done')
    .map((t) => ({ q: t.question, a: plainText(t.answer.segments).slice(0, ASK_LIMITS.historyAnswerMax) }))
    .filter((t) => t.a)
    .slice(-ASK_LIMITS.historyTurns);
}

/**
 * Asks `raw` in the active conversation (a new one if none is active).
 * Resolves when the answer ends. A question too short or too long is refused
 * without a request, as an error turn.
 */
export async function ask(raw, { locale, path, endpoint = '/api/ask' }) {
  stop();
  const question = normaliseQuestion(raw);
  let conversation = activeConversation();
  const history = historyOf(conversation);

  seq += 1;
  const turnId = `t${seq}`;
  const turn = { id: turnId, question, answer: { ...IDLE, question } };

  if (!conversation || conversation.turns.length >= MAX_TURNS) {
    seq += 1;
    conversation = { id: `c${seq}`, title: question, turns: [] };
    emit({
      ...state,
      // Newest first, as a chat client lists them.
      conversations: [conversation, ...state.conversations].slice(0, MAX_CONVERSATIONS),
      activeId: conversation.id,
    });
  }
  const conversationId = conversation.id;
  emit({
    ...state,
    conversations: state.conversations.map((c) =>
      c.id === conversationId ? { ...c, turns: [...c.turns, turn] } : c,
    ),
  });

  if (!askable(question)) {
    patchTurn(conversationId, turnId, { ...turn.answer, status: 'error', error: 'too_short' });
    return;
  }

  const controller = new AbortController();
  inflight = { controller, conversationId, turnId };
  emit({ ...state, streaming: turnId });
  await streamRequest({
    endpoint,
    body: { question, locale, path, history },
    signal: controller.signal,
    initial: turn.answer,
    onUpdate: (answer) => patchTurn(conversationId, turnId, answer),
  });
  if (inflight?.turnId === turnId) {
    inflight = null;
    emit({ ...state, streaming: null });
  }
}

/** Test seam: forget every conversation. */
export function resetAskSession() {
  inflight?.controller.abort();
  inflight = null;
  seq = 0;
  emit(EMPTY);
}
