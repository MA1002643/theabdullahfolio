import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DRAFT_FIELDS,
  newIdempotencyKey,
  postContactMessage,
  readJSON,
  remove,
  writeJSON,
} from '@/lib/contact';

// The contact client's failure classification (issue #92, L10). Written after
// Stryker scored src/lib/contact.js at 47.6%: the form's component suite drives
// it end to end, but nothing pinned the one decision that matters most here,
// which outcome is TRANSIENT (keep the message queued and retry) and which is
// FINAL (show the error, drop the send). Get it wrong one way and a message is
// lost; the other way, the offline queue retries a doomed request forever.
//
//   2xx + success        → { ok: true }
//   409 + retryable      → { ok: false, network: true }   another attempt in flight
//   any 5xx              → { ok: false, network: true }   server-side, retry
//   4xx                  → { ok: false, errors: [...] }   final
//   fetch throws         → { ok: false, network: true }   offline / reset
//   our 15 s timeout     → { ok: false, network: true }
//   the CALLER aborts    → { ok: false, aborted: true }

const params = { name: 'Ada', email: 'ada@example.com', subject: 'Hi', message: 'Hello there', idempotencyKey: 'key-123' };

const respond = (status, body) =>
  vi.fn(async () => new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('postContactMessage — outcome classification', () => {
  it('delivers: 200 + success', async () => {
    vi.stubGlobal('fetch', respond(200, { success: true }));
    await expect(postContactMessage(params)).resolves.toEqual({ ok: true });
  });

  it('a 200 WITHOUT success is not a delivery', async () => {
    vi.stubGlobal('fetch', respond(200, { error: 'odd' }));
    await expect(postContactMessage(params)).resolves.toEqual({ ok: false, errors: ['odd'] });
  });

  it.each([500, 502, 503, 504])('queues a %i for retry', async (status) => {
    vi.stubGlobal('fetch', respond(status, { error: 'down' }));
    await expect(postContactMessage(params)).resolves.toEqual({ ok: false, network: true });
  });

  it('queues a 409 retryable (a concurrent attempt holds the claim)', async () => {
    vi.stubGlobal('fetch', respond(409, { retryable: true }));
    await expect(postContactMessage(params)).resolves.toEqual({ ok: false, network: true });
  });

  it('treats a 409 WITHOUT retryable as final', async () => {
    vi.stubGlobal('fetch', respond(409, { error: 'conflict' }));
    await expect(postContactMessage(params)).resolves.toEqual({ ok: false, errors: ['conflict'] });
  });

  it('surfaces every 4xx validation error, in order', async () => {
    vi.stubGlobal('fetch', respond(400, { errors: ['Subject is required.', 'Invalid email format.'] }));
    await expect(postContactMessage(params)).resolves.toEqual({
      ok: false,
      errors: ['Subject is required.', 'Invalid email format.'],
    });
  });

  it('falls back to a single `error`, then to a generic message, then survives a non-JSON body', async () => {
    vi.stubGlobal('fetch', respond(413, { error: 'Too large' }));
    await expect(postContactMessage(params)).resolves.toEqual({ ok: false, errors: ['Too large'] });
    vi.stubGlobal('fetch', respond(400, {}));
    await expect(postContactMessage(params)).resolves.toEqual({ ok: false, errors: ['Failed to send message'] });
    vi.stubGlobal('fetch', respond(400, '<html>bad gateway</html>'));
    await expect(postContactMessage(params)).resolves.toEqual({ ok: false, errors: ['Failed to send message'] });
  });

  it('queues when fetch itself throws (offline, reset)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(postContactMessage(params)).resolves.toEqual({ ok: false, network: true });
  });

  it('sends the key as a header and never in the body', async () => {
    const fetchSpy = respond(200, { success: true });
    vi.stubGlobal('fetch', fetchSpy);
    await postContactMessage(params);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/send-mail');
    expect(init.method).toBe('POST');
    expect(init.headers['Idempotency-Key']).toBe('key-123');
    expect(init.headers['Content-Type']).toBe('application/json');
    const { idempotencyKey, ...fields } = params;
    expect(JSON.parse(init.body)).toEqual(fields);
  });

  it('omits the header entirely when there is no key', async () => {
    const fetchSpy = respond(200, { success: true });
    vi.stubGlobal('fetch', fetchSpy);
    const { idempotencyKey, ...noKey } = params;
    await postContactMessage(noKey);
    expect(fetchSpy.mock.calls[0][1].headers).not.toHaveProperty('Idempotency-Key');
  });
});

describe('postContactMessage — aborts and timeouts', () => {
  /** A fetch that never settles until its signal aborts (at once if it already has, as real fetch does). */
  const hanging = () =>
    vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      const fail = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      if (signal.aborted) fail();
      else signal.addEventListener('abort', fail);
    }));

  it('our own 15 s ceiling counts as transient (queue and retry)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hanging());
    const pending = postContactMessage(params);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toEqual({ ok: false, network: true });
  });

  it('does not time out a hair early', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hanging());
    let settled = false;
    postContactMessage(params).then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it('a CALLER abort is reported as aborted, not queued', async () => {
    vi.stubGlobal('fetch', hanging());
    const controller = new AbortController();
    const pending = postContactMessage(params, controller.signal);
    controller.abort();
    await expect(pending).resolves.toEqual({ ok: false, aborted: true });
  });

  it('an already-aborted signal aborts at once', async () => {
    vi.stubGlobal('fetch', hanging());
    const controller = new AbortController();
    controller.abort();
    await expect(postContactMessage(params, controller.signal)).resolves.toEqual({ ok: false, aborted: true });
  });

  it('detaches its abort listener afterwards (no leak across queue retries)', async () => {
    vi.stubGlobal('fetch', respond(200, { success: true }));
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await postContactMessage(params, controller.signal);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

describe('storage helpers and keys', () => {
  const store = new Map();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    });
  });

  it('round-trips JSON and removes it', () => {
    writeJSON('k', { a: [1, 2] });
    expect(readJSON('k')).toEqual({ a: [1, 2] });
    remove('k');
    expect(readJSON('k')).toBeNull();
  });

  it('reads corrupt JSON as null rather than throwing', () => {
    store.set('k', '{not json');
    expect(readJSON('k')).toBeNull();
  });

  it('never throws when storage itself throws (private mode, quota)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    });
    expect(readJSON('k')).toBeNull();
    expect(() => writeJSON('k', 1)).not.toThrow();
    expect(() => remove('k')).not.toThrow();
  });

  it('mints distinct keys, and falls back when randomUUID is missing', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
    vi.stubGlobal('crypto', {});
    const fallback = newIdempotencyKey();
    expect(fallback).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    // The server's key pattern must accept the fallback shape too.
    expect(fallback).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
  });

  it('drafts exactly the four message fields', () => {
    expect(DRAFT_FIELDS).toEqual(['name', 'email', 'subject', 'message']);
  });
});
