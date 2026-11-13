import { describe, expect, it } from 'vitest';
import { askEvents, fitEvents } from '@/lib/ask/stream';

// Model parts → wire events for /api/ask (issue #41 §4), driven with scripted
// AI SDK stream parts. These are the behaviours a visitor sees: prose with
// citations and their sources, a plan retracted into the trace when the agent
// reaches for a live tool, each live step running then done, follow-ups, and
// fit rows that only ever name real facts.

const stream = (parts) =>
  new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(p);
      c.close();
    },
  });

async function collect(gen) {
  const out = [];
  for await (const e of gen) out.push(e);
  return out;
}

const label = (fact) => (fact.kind === 'project' ? `name-of-${fact.id}` : undefined);
const ask = (parts) => collect(askEvents(stream(parts), { label }));
const types = (events) => events.map((e) => e.type);
const without = (events, ...drop) => events.filter((e) => !drop.includes(e.type));

describe('askEvents — citations', () => {
  it('turns markers split across deltas into a source (once) and a cite, dropping unknown ids', async () => {
    const events = await ask([
      { type: 'text-delta', text: 'He built AfaaqX [[P' },
      { type: 'text-delta', text: '2]] and more [[P2]], ' },
      { type: 'text-delta', text: 'not [[P999]] this.' },
    ]);
    expect(without(events, 'done')).toEqual([
      { type: 'text', text: 'He built AfaaqX ' },
      { type: 'source', id: 'P2', kind: 'project', href: '/projects/2', label: 'name-of-P2' },
      { type: 'cite', id: 'P2' },
      { type: 'text', text: ' and more ' },
      { type: 'cite', id: 'P2' },
      { type: 'text', text: ', ' },
      // The unknown marker vanishes; the space either side of it collapses
      // when rendered (white-space: pre-line).
      { type: 'text', text: 'not  this.' },
    ]);
  });

  it('labels live, page and journey sources by their registry kind and href', async () => {
    const events = await ask([{ type: 'text-delta', text: 'a [[L:github]] b [[R:contact]] c [[J:indie]]' }]);
    const sources = events.filter((e) => e.type === 'source');
    expect(sources).toEqual([
      { type: 'source', id: 'L:github', kind: 'live', href: '/about' },
      { type: 'source', id: 'R:contact', kind: 'page', href: '/contact' },
      { type: 'source', id: 'J:indie', kind: 'journey', href: '/journey' },
    ]);
  });
});

describe('askEvents — the agent loop', () => {
  it('retracts a plan written before a live tool call, traces the step, and carries its data', async () => {
    const events = await ask([
      { type: 'start-step' },
      { type: 'text-delta', text: "I'll check his GitHub." },
      { type: 'tool-call', toolCallId: 't1', toolName: 'get_github_activity', input: {} },
      { type: 'tool-result', toolCallId: 't1', toolName: 'get_github_activity', output: { id: 'L:github', live: true, commits: 1502, topLanguages: ['JS 57%'] } },
      { type: 'start-step' },
      { type: 'text-delta', text: 'He has 1,502 commits [[L:github]].' },
    ]);
    expect(types(events)).toEqual(['text', 'retract', 'step', 'step', 'text', 'source', 'cite', 'text', 'done']);
    expect(events[2]).toEqual({ type: 'step', id: 't1', tool: 'get_github_activity', status: 'running' });
    expect(events[3]).toMatchObject({ status: 'done', data: { live: true, commits: 1502, topLanguages: ['JS 57%'] } });
    expect(events.at(-1)).toMatchObject({ type: 'done', steps: 1 });
  });

  it('does not retract an answer followed by the follow-up suggestions, and keeps only valid questions', async () => {
    const events = await ask([
      { type: 'text-delta', text: 'He builds web apps.' },
      {
        type: 'tool-call',
        toolCallId: 'f',
        toolName: 'suggest_followups',
        input: { questions: ['What about testing?', '', 'x'.repeat(120), 'Where is he based?', 'Fourth?'] },
      },
    ]);
    expect(types(events)).toEqual(['text', 'followups', 'done']);
    expect(events[1].questions).toEqual(['What about testing?', 'Where is he based?', 'Fourth?']);
  });

  it('marks an unavailable or erroring live tool as failed', async () => {
    const events = await ask([
      { type: 'tool-call', toolCallId: 'a', toolName: 'get_current_work', input: {} },
      { type: 'tool-result', toolCallId: 'a', toolName: 'get_current_work', output: { id: 'L:work', live: false, unavailable: true } },
      { type: 'tool-call', toolCallId: 'b', toolName: 'get_project_progress', input: {} },
      { type: 'tool-error', toolCallId: 'b', toolName: 'get_project_progress', error: new Error('x') },
    ]);
    expect(events.filter((e) => e.type === 'step').map((e) => [e.id, e.status])).toEqual([
      ['a', 'running'],
      ['a', 'failed'],
      ['b', 'running'],
      ['b', 'failed'],
    ]);
  });

  it('throws a model error part, so the route can still answer with a real status', async () => {
    await expect(ask([{ type: 'error', error: Object.assign(new Error('nope'), { statusCode: 429 }) }])).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it('caps the number of distinct sources one answer can show', async () => {
    const ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    const events = await ask([{ type: 'text-delta', text: ids.map((id) => `x [[${id}]]`).join(' ') }]);
    expect(events.filter((e) => e.type === 'source')).toHaveLength(6);
    // A cite is only emitted for an id that has a source.
    const sourced = new Set(events.filter((e) => e.type === 'source').map((e) => e.id));
    for (const e of events.filter((x) => x.type === 'cite')) expect(sourced.has(e.id)).toBe(true);
  });
});

describe('fitEvents', () => {
  async function* rows(list) {
    for (const r of list) yield r;
  }

  it('keeps only real fact ids, clears evidence on a gap, and caps the rows', async () => {
    const list = Array.from({ length: 10 }, (_, i) => ({
      requirement: `Req ${i}`,
      verdict: i === 1 ? 'gap' : i === 2 ? 'nonsense' : 'strong',
      evidence: 'Evidence.',
      sources: ['P1', 'FAKE', 'P1'],
    }));
    const events = await collect(fitEvents(rows(list), { label }));
    const fitRows = events.filter((e) => e.type === 'fit-row').map((e) => e.row);
    expect(fitRows).toHaveLength(8);
    expect(fitRows[0]).toEqual({ requirement: 'Req 0', verdict: 'strong', evidence: 'Evidence.', sources: ['P1'] });
    expect(fitRows[1]).toEqual({ requirement: 'Req 1', verdict: 'gap', evidence: '', sources: [] });
    // An unknown verdict is never presented as evidence of anything.
    expect(fitRows[2]).toMatchObject({ verdict: 'gap', evidence: '', sources: [] });
    expect(events.filter((e) => e.type === 'source')).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: 'done', steps: 8 });
  });
});
