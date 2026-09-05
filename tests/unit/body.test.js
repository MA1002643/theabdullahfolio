import { describe, expect, it } from 'vitest';
import { PAYLOAD_TOO_LARGE, readJsonBody } from '@/lib/guestbook/body';

// The capped JSON reader (body.js): a byte ceiling enforced BEFORE parsing —
// by Content-Length when declared, else by counting the stream and cancelling
// it the moment the ceiling is crossed.

const MAX = 64;
const req = (body, headers = {}) =>
  new Request('http://localhost/x', { method: 'POST', body, headers });

// A body delivered in fixed-size chunks that records how many were pulled, so
// a test can prove the reader stopped early instead of draining everything.
// highWaterMark 0: a stream's default (1) pre-fills its queue with one pull at
// construction, before anyone reads — with 0, a pull happens only for a
// pending read, so the count is exactly what the reader asked for.
function chunked(text, size) {
  const bytes = new TextEncoder().encode(text);
  const pulled = { chunks: 0, cancelled: false };
  const stream = new ReadableStream(
    {
      pull(controller) {
        const start = pulled.chunks * size;
        if (start >= bytes.length) {
          controller.close();
          return;
        }
        pulled.chunks += 1;
        controller.enqueue(bytes.slice(start, start + size));
      },
      cancel() {
        pulled.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulled, total: Math.ceil(bytes.length / size) };
}

describe('readJsonBody — a byte ceiling before parsing', () => {
  it('parses a body under the ceiling', async () => {
    const r = await readJsonBody(req(JSON.stringify({ id: 'abc' })), { maxBytes: MAX });
    expect(r).toEqual({ ok: true, body: { id: 'abc' } });
  });

  it('a body exactly at the ceiling is fine; one byte over is 413', async () => {
    const exact = JSON.stringify({ id: 'x'.repeat(MAX - '{"id":""}'.length) });
    expect(new TextEncoder().encode(exact).byteLength).toBe(MAX);
    expect((await readJsonBody(req(exact), { maxBytes: MAX })).ok).toBe(true);

    const over = JSON.stringify({ id: 'x'.repeat(MAX - '{"id":""}'.length + 1) });
    const r = await readJsonBody(req(over), { maxBytes: MAX });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(PAYLOAD_TOO_LARGE);
    expect(r.error).toMatch(/at most 64 bytes/);
  });

  it('counts BYTES, not characters — multi-byte text is measured as sent', async () => {
    // 20 × "é" is 20 chars but 40 bytes; with the JSON wrapper that is over a
    // 48-byte ceiling though well under it as a character count.
    const body = JSON.stringify({ id: 'é'.repeat(20) });
    expect(body.length).toBeLessThan(48);
    expect((await readJsonBody(req(body), { maxBytes: 48 })).status).toBe(PAYLOAD_TOO_LARGE);
  });

  it('a declared Content-Length over the ceiling is refused without reading the body', async () => {
    const { stream, pulled } = chunked('{"id":"never read"}', 4);
    const request = new Request('http://localhost/x', {
      method: 'POST',
      body: stream,
      duplex: 'half',
      headers: { 'content-length': String(MAX + 1) },
    });
    const r = await readJsonBody(request, { maxBytes: MAX });
    expect(r.status).toBe(PAYLOAD_TOO_LARGE);
    expect(pulled.chunks).toBe(0);
  });

  it('an undeclared stream is cancelled the moment it crosses the ceiling — the rest is never read', async () => {
    const big = JSON.stringify({ id: 'y'.repeat(10_000) });
    const { stream, pulled, total } = chunked(big, 16);
    const request = new Request('http://localhost/x', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    });
    const r = await readJsonBody(request, { maxBytes: MAX });
    expect(r.status).toBe(PAYLOAD_TOO_LARGE);
    // Ceiling 64 in 16-byte chunks: the 5th chunk crosses it; hundreds remain.
    expect(pulled.chunks).toBeLessThanOrEqual(5);
    expect(pulled.chunks).toBeLessThan(total);
    expect(pulled.cancelled).toBe(true);
  });

  it('anything under the ceiling that is not JSON is the routes’ usual 400', async () => {
    for (const bad of ['', 'not json', '{"id":', '[1,2', 'null!']) {
      const r = await readJsonBody(req(bad), { maxBytes: MAX });
      expect(r).toEqual({ ok: false, status: 400, error: 'Invalid request body' });
    }
  });

  it('a bodiless request is a 400, not a crash', async () => {
    const r = await readJsonBody(new Request('http://localhost/x', { method: 'POST' }), {
      maxBytes: MAX,
    });
    expect(r.status).toBe(400);
  });
});
