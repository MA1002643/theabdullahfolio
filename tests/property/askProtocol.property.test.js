import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEventDecoder, encodeEvent } from '@/lib/ask/protocol';

// The Ask wire format (issue #41 §4.4). A network delivers a response body in
// chunks of whatever size it likes: a JSON line can be split anywhere, and so
// can a multi-byte UTF-8 character (an Arabic or Japanese answer is mostly
// such characters). The decoder's one job is to make that invisible —
// decoding the stream in ANY chunking yields exactly the events that were
// encoded.

const unicodeText = fc.string({ unit: 'grapheme', maxLength: 24 });
const id = fc.constantFrom('P2', 'J:indie', 'L:github', 'R:contact');
// Every event type the protocol carries (issue #41), in its exact decoded shape.
const event = fc.oneof(
  unicodeText.map((text) => ({ type: 'text', text })),
  id.map((i) => ({ type: 'cite', id: i })),
  fc.record({ id, href: fc.constantFrom('/', '/projects/2', '/journey') }).map((s) => ({
    type: 'source',
    id: s.id,
    kind: 'project',
    href: s.href,
  })),
  fc
    .record({
      status: fc.constantFrom('running', 'done', 'failed'),
      commits: fc.nat(5000),
      langs: fc.array(fc.constantFrom('JS 57%', 'TS 20%'), { maxLength: 2 }),
    })
    .map((r) => ({
      type: 'step',
      id: 'toolu_1',
      tool: 'get_github_activity',
      status: r.status,
      data: { commits: r.commits, live: true, topLanguages: r.langs },
    })),
  fc.constant({ type: 'retract' }),
  fc.array(fc.constantFrom('What about testing?', 'Where is he?'), { maxLength: 3 }).map((q) => ({ type: 'followups', questions: q })),
  fc.nat(60).map((n) => ({ type: 'meta', facts: n, model: 'anthropic/claude-haiku-5.5' })),
  fc
    .record({ verdict: fc.constantFrom('strong', 'partial', 'gap'), requirement: unicodeText.filter((t) => t.length > 0) })
    .map((r) => ({ type: 'fit-row', row: { requirement: r.requirement, verdict: r.verdict, evidence: 'e', sources: ['P2'] } })),
  fc.nat(9000).map((ms) => ({ type: 'done', ms, steps: 1 })),
  fc.constantFrom('failed', 'budget').map((code) => ({ type: 'error', code })),
);

// Splits `bytes` at the given cut points (each taken modulo the length).
function chunk(bytes, cuts) {
  const points = [...new Set(cuts.map((c) => (bytes.length ? c % bytes.length : 0)))].sort(
    (a, b) => a - b,
  );
  const out = [];
  let at = 0;
  for (const p of points) {
    if (p > at) out.push(bytes.slice(at, p));
    at = Math.max(at, p);
  }
  out.push(bytes.slice(at));
  return out;
}

function decodeAll(chunks) {
  const decoder = createEventDecoder();
  const events = chunks.flatMap((c) => decoder.push(c));
  return [...events, ...decoder.end()];
}

describe('Ask protocol — chunking is invisible', () => {
  it('decodes the same events whatever the byte chunking', () => {
    fc.assert(
      fc.property(fc.array(event, { maxLength: 8 }), fc.array(fc.nat(), { maxLength: 12 }), (events, cuts) => {
        const bytes = new TextEncoder().encode(events.map(encodeEvent).join(''));
        expect(decodeAll(chunk(bytes, cuts))).toEqual(events);
      }),
    );
  });

  it('decodes the same events from string chunks, and without the final newline', () => {
    fc.assert(
      fc.property(fc.array(event, { minLength: 1, maxLength: 6 }), fc.array(fc.nat(), { maxLength: 8 }), (events, cuts) => {
        const wire = events.map(encodeEvent).join('').replace(/\n$/, '');
        const pieces = chunk([...wire], cuts).map((cs) => cs.join(''));
        expect(decodeAll(pieces)).toEqual(events);
      }),
    );
  });

  it('drops lines that are not one of the known shapes, and keeps going', () => {
    fc.assert(
      fc.property(fc.array(event, { maxLength: 5 }), fc.string({ maxLength: 20 }), (events, junk) => {
        // Never JSON (a leading '#'), an unknown type, and a known type with a
        // field of the wrong type: all three must vanish without a trace.
        const noise =
          `#${junk.replace(/\n/g, ' ')}\n` +
          '{"type":"script","src":"x"}\n' +
          '{"type":"source","id":"P2","href":7,"kind":"project"}\n' +
          '{"type":"step","id":"t","tool":"x","status":"exploded"}\n' +
          '{"type":"fit-row","row":{"requirement":"r","verdict":"amazing"}}\n' +
          '{"type":"text","text":{"html":"<b>"}}\n';
        const wire = noise + events.map(encodeEvent).join('');
        expect(decodeAll([wire])).toEqual(events);
      }),
    );
  });
});
