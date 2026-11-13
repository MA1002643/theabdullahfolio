import { jsonSchema } from 'ai';
import { createCitationParser } from '@/lib/ask/citations';
import { FACT_IDS, factById, isCitable } from '@/lib/ask/corpus';
import { ASK_LIMITS, FIT_LIMITS, askable, normaliseQuestion } from '@/lib/ask/limits';
import { LIVE_TOOL_NAMES, displayData } from '@/lib/ask/liveTools';

// Model parts → wire events, for /api/ask (issue #41). Pure over the streams
// it is handed, so tests/unit/askStream.test.js drives both generators with
// scripted AI SDK parts and asserts the exact events a visitor would receive.
// `label(fact)` names a source in the visitor's language where the server can
// (projects, journey entries); see sourceLabeller in the route.

// ── Ask: model parts → wire events ──────────────────────────────────────────
// A generator, so the commit logic below can pull the first event before
// deciding the status line. It owns three behaviours worth naming:
//   citations — prose goes through the incremental parser; each valid id
//               becomes a `cite` event (preceded by its `source` the first
//               time), unknown ids vanish;
//   retract   — if the model wrote prose and THEN reached for a live tool in
//               the same step, that prose was its plan, not the answer: the
//               client is told to move it into the reasoning trace;
//   trace     — every live tool call is a `step`, running then done/failed,
//               carrying the small flat result the trace displays.
export async function* askEvents(stream, { label }) {
  const reader = stream.getReader();
  const parser = createCitationParser(isCitable);
  const sent = new Set();
  const started = Date.now();
  let stepHasText = false;
  let liveSteps = 0;

  function* forward(events) {
    for (const event of events) {
      if (event.type === 'text') {
        if (event.text.trim()) stepHasText = true;
        yield event;
        continue;
      }
      stepHasText = true;
      if (!sent.has(event.id) && sent.size < ASK_LIMITS.maxSources) {
        sent.add(event.id);
        const fact = factById(event.id);
        const source = { type: 'source', id: fact.id, kind: fact.kind, href: fact.href };
        const name = label(fact);
        if (name) source.label = name;
        yield source;
      }
      if (sent.has(event.id)) yield event;
    }
  }

  try {
    for (;;) {
      const { value: part, done } = await reader.read();
      if (done) break;
      switch (part.type) {
        case 'error':
          throw part.error;
        case 'start-step':
          yield* forward(parser.end());
          stepHasText = false;
          break;
        case 'text-delta':
          if (part.text) yield* forward(parser.push(part.text));
          break;
        case 'tool-call':
          yield* forward(parser.end());
          if (LIVE_TOOL_NAMES.includes(part.toolName)) {
            if (stepHasText) {
              yield { type: 'retract' };
              stepHasText = false;
            }
            liveSteps += 1;
            yield { type: 'step', id: part.toolCallId, tool: part.toolName, status: 'running' };
          } else if (part.toolName === 'suggest_followups') {
            const questions = (Array.isArray(part.input?.questions) ? part.input.questions : [])
              .map((q) => normaliseQuestion(q))
              .filter((q) => askable(q) && q.length <= 90)
              .slice(0, 3);
            if (questions.length) yield { type: 'followups', questions };
          }
          break;
        case 'tool-result':
          if (LIVE_TOOL_NAMES.includes(part.toolName)) {
            yield {
              type: 'step',
              id: part.toolCallId,
              tool: part.toolName,
              status: part.output?.unavailable ? 'failed' : 'done',
              data: displayData(part.output),
            };
          }
          break;
        case 'tool-error':
          if (LIVE_TOOL_NAMES.includes(part.toolName)) {
            yield { type: 'step', id: part.toolCallId, tool: part.toolName, status: 'failed' };
          }
          break;
        default:
          break;
      }
    }
    yield* forward(parser.end());
    yield { type: 'done', ms: Date.now() - started, steps: liveSteps };
  } finally {
    reader.releaseLock?.();
  }
}

// ── Fit: completed rows → wire events ───────────────────────────────────────
export const FIT_ROW = jsonSchema({
  type: 'object',
  properties: {
    requirement: { type: 'string', maxLength: 120 },
    verdict: { type: 'string', enum: ['strong', 'partial', 'gap'] },
    evidence: { type: 'string', maxLength: 260 },
    sources: { type: 'array', items: { type: 'string', enum: [...FACT_IDS] }, maxItems: 3 },
  },
  required: ['requirement', 'verdict', 'evidence', 'sources'],
  additionalProperties: false,
});

export async function* fitEvents(elementStream, { label }) {
  const started = Date.now();
  const sent = new Set();
  let rows = 0;
  for await (const row of elementStream) {
    if (rows >= FIT_LIMITS.maxRows) break;
    const sources = [...new Set((row.sources ?? []).filter((id) => FACT_IDS.includes(id)))].slice(0, 3);
    for (const id of sources) {
      if (sent.has(id)) continue;
      sent.add(id);
      const fact = factById(id);
      const source = { type: 'source', id, kind: fact.kind, href: fact.href };
      const name = label(fact);
      if (name) source.label = name;
      yield source;
    }
    const verdict = ['strong', 'partial', 'gap'].includes(row.verdict) ? row.verdict : 'gap';
    yield {
      type: 'fit-row',
      row: {
        requirement: String(row.requirement ?? '').slice(0, 120),
        verdict,
        // A gap has no evidence by definition; anything written there would be
        // a claim the facts do not support.
        evidence: verdict === 'gap' ? '' : String(row.evidence ?? '').slice(0, 260),
        sources: verdict === 'gap' ? [] : sources,
      },
    };
    rows += 1;
  }
  yield { type: 'done', ms: Date.now() - started, steps: rows };
}

