// A JSON request body with a BYTE CEILING (issue #40, code-review follow-up).
//
// The guestbook routes validate a body before they meter the caller — on
// purpose: a malformed flood must not eat a real client's budget. But that
// order means `request.json()` ran on whatever arrived, and the presence
// endpoint is unauthenticated, so a caller could send near-platform-limit
// payloads on every request and have each one fully buffered and parsed
// without ever entering a rate-limit bucket. Every legitimate body here is
// tiny — a presence beat is `{"id":"<8–64 chars>"}`, a reaction a few dozen
// bytes, a message ≤150 chars plus a ≤4 KB signature — so each route names
// a small ceiling and this reader enforces it BEFORE parsing:
//
//   1. a Content-Length above the ceiling is refused without reading a byte;
//   2. otherwise the stream is read chunk by chunk with a running byte count
//      and cancelled the moment it crosses the ceiling — the rest is never
//      read, let alone parsed;
//   3. what remains is decoded and JSON.parse'd; failure there is the 400 the
//      routes always answered.
//
// This is a byte ceiling, not a pre-parse IP limiter: a limiter costs a
// Redis round-trip per request, which is more than parsing 1 KB, and it would
// let a garbage flood exhaust the budget of the real client behind the same
// IP — the very property "validate first, meter second" protects. Under the
// ceiling a malformed request costs what any HTTP request to a function
// costs, and nothing more.
//
// Answers { ok: true, body } or { ok: false, status, error } with the status
// the route should return (413 over the ceiling, 400 for anything that is
// not JSON). Pure over the Request; no I/O beyond the body itself.
export const PAYLOAD_TOO_LARGE = 413;

const tooLarge = (maxBytes) => ({
  ok: false,
  status: PAYLOAD_TOO_LARGE,
  error: `Request body must be at most ${maxBytes} bytes`,
});
const notJson = { ok: false, status: 400, error: 'Invalid request body' };

export async function readJsonBody(request, { maxBytes }) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge(maxBytes);

  let text = '';
  const stream = request.body;
  if (stream && typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return tooLarge(maxBytes);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } else {
    // No readable stream (a bodiless request): whatever text() yields, still
    // held to the ceiling.
    text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) return tooLarge(maxBytes);
  }

  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return notJson;
  }
}
