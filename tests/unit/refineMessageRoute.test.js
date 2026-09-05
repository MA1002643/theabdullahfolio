import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The byte ceiling on /api/refine-message (code review): MAX_BODY_BYTES used
// to be enforced by a Content-Length check alone, so a body sent with the
// header absent (chunked transfer, HTTP/2) or understated was still buffered
// in full by req.json(). The route now reads through body.js's counted
// reader; these cases prove the ceiling holds on the STREAM, and that the
// model is never reached on the way to a 413 or a 400.

// The AI SDK is mocked at the module boundary: every case here must be
// answered before the route calls streamText, and the mock proves it was.
vi.mock('ai', () => ({
  streamText: vi.fn(),
  createTextStreamResponse: vi.fn(),
}));

const ENDPOINT = 'http://localhost/api/refine-message';

// A body delivered in fixed-size chunks that records how many were pulled and
// whether it was cancelled (the same probe as body.test.js), so a test can
// prove the route stopped reading rather than merely that it answered 413.
// highWaterMark 0: a pull happens only for a pending read, so the count is
// exactly what the reader asked for.
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

// Each case uses its own client IP: the route meters per IP BEFORE the
// ceiling (the model budget is what it protects), so the cases must not share
// a window.
function post({ body, ip, headers = {} }) {
  const streamed = typeof body !== 'string';
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...headers },
    body,
    ...(streamed ? { duplex: 'half' } : {}),
  });
}

let previousVercel;
beforeAll(() => {
  // The route answers 503 unless the gateway counts as configured; on Vercel
  // that is the platform flag, not a credential.
  previousVercel = process.env.VERCEL;
  process.env.VERCEL = '1';
});
afterAll(() => {
  if (previousVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previousVercel;
});

describe('POST /api/refine-message — the body byte ceiling holds without an honest Content-Length', () => {
  it('an oversized body with NO Content-Length is 413, the stream cancelled at the ceiling, the model never called', async () => {
    const { POST, MAX_BODY_BYTES } = await import('@/app/api/refine-message/route');
    const { streamText } = await import('ai');
    const big = JSON.stringify({ message: 'x'.repeat(MAX_BODY_BYTES * 4) });
    const { stream, pulled, total } = chunked(big, 1024);

    const res = await POST(post({ body: stream, ip: '203.0.113.10' }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too_large', message: 'Request is too large.' });
    // Ceiling 8 KB in 1 KB chunks: the 9th chunk crosses it; the other ~24 are never read.
    expect(pulled.chunks).toBeLessThanOrEqual(9);
    expect(pulled.chunks).toBeLessThan(total);
    expect(pulled.cancelled).toBe(true);
    expect(streamText).not.toHaveBeenCalled();
  });

  it('a Content-Length that understates an oversized body does not get it past the ceiling', async () => {
    const { POST, MAX_BODY_BYTES } = await import('@/app/api/refine-message/route');
    const { streamText } = await import('ai');
    const big = JSON.stringify({ message: 'x'.repeat(MAX_BODY_BYTES * 4) });
    const { stream, pulled, total } = chunked(big, 1024);

    const res = await POST(
      post({ body: stream, ip: '203.0.113.11', headers: { 'content-length': '64' } }),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('too_large');
    expect(pulled.chunks).toBeLessThan(total);
    expect(pulled.cancelled).toBe(true);
    expect(streamText).not.toHaveBeenCalled();
  });

  it('a declared Content-Length over the ceiling is refused without reading a byte', async () => {
    const { POST, MAX_BODY_BYTES } = await import('@/app/api/refine-message/route');
    const { stream, pulled } = chunked('{"message":"never read"}', 4);

    const res = await POST(
      post({
        body: stream,
        ip: '203.0.113.12',
        headers: { 'content-length': String(MAX_BODY_BYTES + 1) },
      }),
    );
    expect(res.status).toBe(413);
    expect(pulled.chunks).toBe(0);
  });

  it('under the ceiling, not-JSON is the bad_request 400 and a short message the too_short 400 — parsing still reaches validation', async () => {
    const { POST } = await import('@/app/api/refine-message/route');
    const { streamText } = await import('ai');
    const ip = '203.0.113.13';

    for (const bad of ['not json', '', '{"message":']) {
      const res = await POST(post({ body: bad, ip }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('bad_request');
    }
    // Valid JSON, but the message is below every mode's minLen — so the parse
    // completed and the route reached its length gate.
    for (const body of [JSON.stringify({ message: '' }), 'null']) {
      const res = await POST(post({ body, ip }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('too_short');
    }
    expect(streamText).not.toHaveBeenCalled();
  });
});
