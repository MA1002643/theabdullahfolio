// The wire format between /api/ask and the palette's Ask and Fit panels
// (issue #41): newline-delimited JSON, one event per line.
//
//   {"type":"meta","facts":42,"model":"anthropic/claude-haiku-5.5"}
//   {"type":"step","id":"t1","tool":"get_github_activity","status":"running"}
//   {"type":"step","id":"t1","tool":"get_github_activity","status":"done","data":{…}}
//   {"type":"retract"}                      the text so far was a plan, not the answer
//   {"type":"text","text":"He built AfaaqX "}
//   {"type":"cite","id":"P2"}               a citation at this point in the text
//   {"type":"source","id":"P2","kind":"project","href":"/projects/2"}
//   {"type":"followups","questions":["…","…"]}
//   {"type":"fit-row","row":{"requirement":"…","verdict":"strong","evidence":"…","sources":["P2"]}}
//   {"type":"done","ms":3900,"steps":2}
//   {"type":"error","code":"failed"}
//
// Why not the AI SDK's UI message stream: the client would need @ai-sdk/react
// (a dependency, and a bigger chunk than this whole panel) to read a protocol
// carrying far more than these events. Shared by both ends so the encoder and
// the decoder are one definition, and the decoder accepts ONLY these exact
// shapes: the client renders what it receives, so it takes only what it knows
// how to render, as plain values.

const VERDICTS = new Set(['strong', 'partial', 'gap']);
const STATUSES = new Set(['running', 'done', 'failed']);

const str = (v, max = 2000) => (typeof v === 'string' && v.length <= max ? v : null);
const strings = (v, maxItems, maxLen) =>
  Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s && s.length <= maxLen).slice(0, maxItems) : [];
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Tool data reaches the client as a flat record of primitives and short
// string lists, never nested objects or markup: the panel formats it with its
// own messages.
function flatData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(value).slice(0, 16)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 120) out[k] = v;
    else if (Array.isArray(v)) out[k] = strings(v, 5, 80);
  }
  return out;
}

function toEvent(value) {
  if (!value || typeof value !== 'object') return null;
  switch (value.type) {
    case 'text':
      return str(value.text, 4000) !== null ? { type: 'text', text: value.text } : null;
    case 'cite':
      return str(value.id, 64) ? { type: 'cite', id: value.id } : null;
    case 'source': {
      if (!str(value.id, 64) || !str(value.href, 200) || !str(value.kind, 16)) return null;
      const event = { type: 'source', id: value.id, kind: value.kind, href: value.href };
      if (str(value.label, 160)) event.label = value.label;
      return event;
    }
    case 'step': {
      if (!str(value.id, 80) || !str(value.tool, 40) || !STATUSES.has(value.status)) return null;
      const event = { type: 'step', id: value.id, tool: value.tool, status: value.status };
      const data = flatData(value.data);
      if (data) event.data = data;
      return event;
    }
    case 'retract':
      return { type: 'retract' };
    case 'followups':
      return { type: 'followups', questions: strings(value.questions, 3, 120) };
    case 'meta':
      return { type: 'meta', facts: num(value.facts) ?? 0, model: str(value.model, 80) ?? '' };
    case 'fit-row': {
      const r = value.row;
      if (!r || !str(r.requirement, 200) || !VERDICTS.has(r.verdict)) return null;
      return {
        type: 'fit-row',
        row: {
          requirement: r.requirement,
          verdict: r.verdict,
          evidence: str(r.evidence, 400) ?? '',
          sources: strings(r.sources, 3, 64),
        },
      };
    }
    case 'done': {
      const event = { type: 'done' };
      if (num(value.ms) !== null) event.ms = value.ms;
      if (num(value.steps) !== null) event.steps = value.steps;
      return event;
    }
    case 'error':
      return { type: 'error', code: str(value.code, 40) ?? 'failed' };
    default:
      return null;
  }
}

export const EVENT_TYPES = new Set([
  'text', 'cite', 'source', 'step', 'retract', 'followups', 'meta', 'fit-row', 'done', 'error',
]);

/** One event as one line, newline included. */
export function encodeEvent(event) {
  return `${JSON.stringify(event)}\n`;
}

/**
 * An incremental decoder. Feed it the response body's chunks (bytes or
 * strings) in order; it returns the events completed by each chunk. A line
 * split across chunks, and a multi-byte character split across chunks, decode
 * exactly as if they had arrived whole (the fast-check property in
 * tests/property/askProtocol.property.test.js).
 */
export function createEventDecoder() {
  const decoder = new TextDecoder();
  let buffer = '';

  const drain = (final) => {
    const events = [];
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          const event = toEvent(JSON.parse(line));
          if (event) events.push(event);
        } catch {
          // A malformed line is skipped, not fatal: the next one may be fine.
        }
      }
      newline = buffer.indexOf('\n');
    }
    if (final && buffer.trim()) {
      buffer += '\n';
      return events.concat(drain(false));
    }
    return events;
  };

  return {
    /** @param {Uint8Array | string} chunk */
    push(chunk) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      return drain(false);
    },
    /** Flushes a final line that arrived without its newline. */
    end() {
      buffer += decoder.decode();
      return drain(true);
    },
  };
}
