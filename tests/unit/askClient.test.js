// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDLE, applyEvents, citedSources, errorCopyKey, plainText, useAsk } from '@/components/commandPalette/useAsk';
import { encodeEvent } from '@/lib/ask/protocol';

// The client half of the research assistant (issue #41 §4): the reducer that
// folds wire events into render state, and the hook's request lifecycle —
// abort, errors, a cut-off body, and the conversation memory follow-ups use.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const pending = { ...IDLE, status: 'pending', question: 'q' };
const src = (id, href = '/projects/2') => ({ type: 'source', id, kind: 'project', href });

describe('applyEvents', () => {
  it('builds the answer as text and citation segments, with sources in first-cited order', () => {
    const s = applyEvents(pending, [
      { type: 'meta', facts: 42, model: 'anthropic/claude-haiku-5.5' },
      { type: 'text', text: 'He built ' },
      { type: 'text', text: 'AfaaqX ' },
      src('P2'),
      { type: 'cite', id: 'P2' },
      { type: 'text', text: '.' },
      { type: 'cite', id: 'NO-SOURCE' },
      { type: 'done', ms: 3900, steps: 0 },
    ]);
    expect(s.segments).toEqual([
      { t: 'text', v: 'He built AfaaqX ' },
      { t: 'cite', id: 'P2' },
      { t: 'text', v: '.' },
    ]);
    expect(plainText(s.segments)).toBe('He built AfaaqX.');
    expect(citedSources(s).map((x) => x.id)).toEqual(['P2']);
    expect(s).toMatchObject({ status: 'done', meta: { facts: 42 }, stats: { ms: 3900, steps: 0 } });
  });

  it('moves a retracted plan into the trace, and only counts sources the final answer cites', () => {
    const s = applyEvents(pending, [
      { type: 'text', text: "I'll check his GitHub " },
      src('L:github', '/about'),
      { type: 'cite', id: 'L:github' },
      { type: 'retract' },
      { type: 'step', id: 't1', tool: 'get_github_activity', status: 'running' },
      { type: 'step', id: 't1', tool: 'get_github_activity', status: 'done', data: { commits: 9 } },
      { type: 'text', text: 'He has 9 commits ' },
      src('P1', '/projects/1'),
      { type: 'cite', id: 'P1' },
    ]);
    expect(s.trace).toEqual([
      { id: 'note-0', note: "I'll check his GitHub" },
      { id: 't1', tool: 'get_github_activity', status: 'done', data: { commits: 9 } },
    ]);
    expect(citedSources(s).map((x) => x.id)).toEqual(['P1']);
  });

  it('collects follow-ups and fit rows, and stops at an error keeping what arrived', () => {
    const s = applyEvents({ ...pending, mode: 'fit' }, [
      { type: 'fit-row', row: { requirement: 'React', verdict: 'strong', evidence: 'x', sources: [] } },
      { type: 'followups', questions: ['a?', 'b?', 'c?', 'd?'] },
      { type: 'error', code: 'failed' },
      { type: 'fit-row', row: { requirement: 'late', verdict: 'gap', evidence: '', sources: [] } },
    ]);
    expect(s.rows.map((r) => r.requirement)).toEqual(['React']);
    expect(s.followups).toEqual(['a?', 'b?', 'c?']);
    expect(s).toMatchObject({ status: 'error', error: 'failed' });
  });

  it('maps server codes onto the copy the panel knows', () => {
    expect(errorCopyKey('unconfigured')).toBe('unavailable');
    expect(errorCopyKey('budget')).toBe('budget');
    expect(errorCopyKey('rate_limited')).toBe('rateLimited');
    expect(errorCopyKey('anything else')).toBe('failed');
  });
});

const ndjson = (events, { split = 7 } = {}) => {
  const bytes = new TextEncoder().encode(events.map(encodeEvent).join(''));
  return new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += split) c.enqueue(bytes.slice(i, i + split));
      c.close();
    },
  });
};

const ANSWER = (text) => [
  { type: 'meta', facts: 42, model: 'm' },
  { type: 'text', text },
  { type: 'done', ms: 10, steps: 0 },
];

describe('useAsk', () => {
  it('posts the normalised question with locale, path and empty history, and streams the answer in', async () => {
    const fetchSpy = vi.fn(async () => new Response(ndjson(ANSWER('He builds things.'))));
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useAsk({ locale: 'ja', path: '/about' }));
    await act(() => result.current.ask('  what does he build?  '));
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(plainText(result.current.segments)).toBe('He builds things.');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({
      question: 'what does he build?',
      locale: 'ja',
      path: '/about',
      history: [],
    });
  });

  it('remembers completed answers and sends the last two with the next question', async () => {
    let n = 0;
    const fetchSpy = vi.fn(async () => new Response(ndjson(ANSWER(`answer ${(n += 1)}`))));
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useAsk({ locale: 'en', path: '/' }));
    for (const q of ['first?', 'second?', 'third?', 'fourth?']) {
      await act(() => result.current.ask(q));
    }
    const sent = JSON.parse(fetchSpy.mock.calls[3][1].body).history;
    expect(sent).toEqual([
      { q: 'second?', a: 'answer 2' },
      { q: 'third?', a: 'answer 3' },
    ]);
  });

  it('runs a fit check with the job text, and refuses one that is too short without sending', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(ndjson([{ type: 'fit-row', row: { requirement: 'React', verdict: 'strong', evidence: 'e', sources: [] } }, { type: 'done' }])),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useAsk({ locale: 'en', path: null }));
    await act(() => result.current.checkFit('too short'));
    expect(result.current).toMatchObject({ mode: 'fit', status: 'error', error: 'too_short' });
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(() => result.current.checkFit(`Senior engineer. ${'React TypeScript Node. '.repeat(6)}`));
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.rows).toHaveLength(1);
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toMatchObject({ mode: 'fit', locale: 'en' });
  });

  it('turns a JSON error response into its code', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'budget' }, { status: 429 }));
    const { result } = renderHook(() => useAsk({ locale: 'en', path: '/' }));
    await act(() => result.current.ask('anything?'));
    expect(result.current).toMatchObject({ status: 'error', error: 'budget' });
  });

  it('treats a body cut off before `done` as a failure, and does not remember it', async () => {
    const fetchSpy = vi.fn(async () => new Response(ndjson([{ type: 'text', text: 'half' }])));
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useAsk({ locale: 'en', path: '/' }));
    await act(() => result.current.ask('anything?'));
    expect(result.current.status).toBe('error');
    await act(() => result.current.ask('again?'));
    expect(JSON.parse(fetchSpy.mock.calls[1][1].body).history).toEqual([]);
  });

  it('does not send while offline', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useAsk({ locale: 'en', path: '/' }));
    await act(() => result.current.ask('anything?'));
    expect(result.current).toMatchObject({ status: 'error', error: 'offline' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('aborts the request in flight when asked again, and on unmount', async () => {
    const signals = [];
    vi.stubGlobal('fetch', (url, init) => {
      signals.push(init.signal);
      return new Promise(() => {});
    });
    const { result, unmount } = renderHook(() => useAsk({ locale: 'en', path: '/' }));
    act(() => {
      result.current.ask('first question');
    });
    act(() => {
      result.current.ask('second question');
    });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    unmount();
    expect(signals[1].aborted).toBe(true);
  });
});
