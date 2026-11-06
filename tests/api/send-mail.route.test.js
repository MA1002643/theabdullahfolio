import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validContactMessage } from '../support/fixtures/api.js';
import { createFakeRedis } from '../support/fakeRedis.js';
import { abstractHandler } from '../support/msw/handlers.js';
import { server } from '../support/msw/server.js';
import { freshSecret } from '../helpers/secrets.js';
import { createTranslator } from 'next-intl';
import contactMessages from '../../messages/en/Contact.json';

// POST /api/send-mail, end to end inside the handler (issue #92, L4).
//
// The site's one public, unauthenticated write. Everything that crosses a
// process boundary is replaced by something that behaves, not something that
// merely answers:
//
//   • SMTP → nodemailer's transport, captured, so each case sees the exact
//     message that would have been mailed.
//   • Abstract's reputation API → MSW, over real `fetch`, so the request the
//     route builds (URL, encoding, abort) is what gets inspected.
//   • Upstash → a STATEFUL fake with atomic SET NX (tests/support/fakeRedis.js),
//     so the idempotency state machine runs against real state and two
//     concurrent requests genuinely race.

const { fake, sendMail } = vi.hoisted(() => ({ fake: { current: null }, sendMail: vi.fn() }));

vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() {
      return fake.current.client;
    }
  },
}));

const ENDPOINT = 'http://localhost/api/send-mail';
const SMTP_USER = `${freshSecret('smtp')}@example.com`;
const ABSTRACT_KEY = freshSecret('abstract');

const ENV = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_USER,
  SMTP_PASS: freshSecret('smtp-pass'),
  RECEIVER_EMAIL: 'inbox@example.test',
};
const STORE_ENV = { KV_REST_API_URL: 'https://unit-test.invalid', KV_REST_API_TOKEN: freshSecret('kv') };
const ALL_KEYS = [...Object.keys(ENV), ...Object.keys(STORE_ENV), 'ABSTRACT_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];

let saved;
let logs;
beforeEach(() => {
  saved = Object.fromEntries(ALL_KEYS.map((k) => [k, process.env[k]]));
  ALL_KEYS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, ENV);
  fake.current = createFakeRedis();
  sendMail.mockReset().mockResolvedValue({ messageId: 'x' });
  logs = [];
  for (const level of ['error', 'warn', 'log']) {
    vi.spyOn(console, level).mockImplementation((...args) => logs.push(args.map(String).join(' ')));
  }
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

/** Import a fresh copy of the route (it reads the store config at import). */
async function loadRoute({ store = false } = {}) {
  if (store) Object.assign(process.env, STORE_ENV);
  vi.resetModules();
  return import('@/app/api/send-mail/route');
}

function post(body, headers = {}) {
  const init = { method: 'POST', headers: { 'content-type': 'application/json', ...headers } };
  if (body instanceof ReadableStream) Object.assign(init, { body, duplex: 'half' });
  else init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request(ENDPOINT, init);
}

const json = async (res) => ({ status: res.status, body: await res.json() });

describe('validation', () => {
  it.each([
    ['name', 'Full Name is required.'],
    ['email', 'Email is required.'],
    ['subject', 'Subject is required.'],
    ['message', 'Message is required.'],
  ])('rejects a missing %s', async (field, error) => {
    const { POST } = await loadRoute();
    const { status, body } = await json(await POST(post(validContactMessage({ [field]: '' }))));
    expect(status).toBe(400);
    expect(body.errors).toContain(error);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('treats whitespace-only fields as missing', async () => {
    const { POST } = await loadRoute();
    const { body } = await json(await POST(post(validContactMessage({ name: '   \t ' }))));
    expect(body.errors).toContain('Full Name is required.');
  });

  it.each([
    ['name', 101, 'Full Name exceeds maximum allowed length (100 characters).'],
    ['subject', 176, 'Subject exceeds maximum allowed length (175 characters).'],
    ['message', 2001, 'Message exceeds maximum allowed length (2000 characters).'],
    ['email', 255, 'Email exceeds maximum allowed length (254 characters).'],
  ])('rejects a %s over its limit (%i chars)', async (field, length, error) => {
    const { POST } = await loadRoute();
    const { status, body } = await json(await POST(post(validContactMessage({ [field]: 'x'.repeat(length) }))));
    expect(status).toBe(400);
    expect(body.errors).toContain(error);
  });

  it('never hands an over-long address to nodemailer, even a well-formed one', async () => {
    // GHSA-v53p-9fqp-m79j (2026-09-29): nodemailer's address parser backtracks
    // quadratically on crafted text, and the patch is in a major version
    // next-auth does not yet allow. The address reaches that parser as the
    // reply-to, so its length is what bounds the cost: 254 is the most a real
    // address can be (RFC 5321), where the body ceiling alone allowed ~16 KB.
    const { POST } = await loadRoute();
    const email = `${'a'.repeat(243)}@example.com`; // 255 chars, passes the format check
    const { status, body } = await json(await POST(post(validContactMessage({ email }))));
    expect(status).toBe(400);
    expect(body.errors).toEqual(['Email exceeds maximum allowed length (254 characters).']);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('accepts an address of exactly the limit', async () => {
    const { POST } = await loadRoute();
    const email = `${'a'.repeat(242)}@example.com`; // 254 chars
    const res = await POST(post(validContactMessage({ email })));
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it.each([['name'], ['subject']])('refuses CR/LF in %s (email header injection)', async (field) => {
    const { POST } = await loadRoute();
    const injected = validContactMessage({ [field]: 'Hi\r\nBcc: victim@example.com' });
    const { status, body } = await json(await POST(post(injected)));
    expect(status).toBe(400);
    expect(body.errors).toContain('Input contains invalid characters.');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each(['plainaddress', 'a@b', '@example.com', 'a b@example.com', 'ada@@example.com'])(
    'rejects the malformed address %s',
    async (email) => {
      const { POST } = await loadRoute();
      const { body } = await json(await POST(post(validContactMessage({ email }))));
      expect(body.errors).toContain('Invalid email format.');
    },
  );

  it('collects every error at once rather than stopping at the first', async () => {
    const { POST } = await loadRoute();
    const { body } = await json(await POST(post({ name: '', email: 'nope', subject: '', message: '' })));
    expect(body.errors.length).toBeGreaterThanOrEqual(4);
  });

  // Issue #82: every error carries a machine code, index-aligned with the
  // English, and the form words it from the Contact catalogue. The contract
  // that keeps English byte-identical: each code, rendered in English with the
  // route's own values, IS the sentence the route sent.
  it('pairs every error with a code whose English catalogue entry matches it', async () => {
    const t = createTranslator({ locale: 'en', messages: { Contact: contactMessages }, namespace: 'Contact' });
    const { POST } = await loadRoute();
    const cases = [
      { name: '', email: 'nope', subject: '', message: '' },
      validContactMessage({ name: 'n'.repeat(101), subject: 's'.repeat(176), message: 'm'.repeat(2001) }),
      validContactMessage({ email: `${'e'.repeat(250)}@x.io`, name: 'a\nb' }),
    ];
    for (const payload of cases) {
      const { body } = await json(await POST(post(payload)));
      expect(body.issues).toHaveLength(body.errors.length);
      body.issues.forEach(({ code, values }, i) => {
        expect(t.has(`errors.${code}`), code).toBe(true);
        expect(t(`errors.${code}`, values)).toBe(body.errors[i]);
      });
    }
    const raw = await POST(post('{"name": '));
    const malformed = await raw.json();
    expect(malformed.issues).toEqual([{ code: 'invalid_body' }]);
    expect(t('errors.invalid_body')).toBe(malformed.errors[0]);
  });

  it('answers malformed JSON with a 400, not a retryable 500', async () => {
    // Regression (2026-09-28): this used to throw into the catch-all and answer
    // 500, which lib/contact.js treats as transient, so it would retry forever.
    const { POST } = await loadRoute();
    const res = await POST(post('{"name": '));
    expect(res.status).toBe(400);
  });

  it.each([['null'], ['[]'], ['"a string"'], ['42']])('treats a non-object JSON body (%s) as empty fields', async (raw) => {
    const { POST } = await loadRoute();
    const { status, body } = await json(await POST(post(raw)));
    expect(status).toBe(400);
    expect(body.errors).toContain('Full Name is required.');
  });

  it('refuses an oversized body mid-stream (413) without reading it all or sending', async () => {
    const { POST } = await loadRoute();
    // No Content-Length (streamed), so only the counted reader can stop it.
    let pulled = 0;
    const chunk = new TextEncoder().encode('x'.repeat(4096));
    const stream = new ReadableStream(
      {
        pull(controller) {
          pulled += 1;
          if (pulled > 64) controller.close();
          else controller.enqueue(chunk);
        },
      },
      { highWaterMark: 0 },
    );
    const res = await POST(post(stream));
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(10); // 16 KB ceiling = 4-5 chunks, never all 64
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('delivery', () => {
  it('mails the owner, replying to the visitor, with the site suffix on the subject', async () => {
    const { POST } = await loadRoute();
    const msg = validContactMessage();
    const { status, body } = await json(await POST(post(msg)));
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, message: 'Email sent successfully!' });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe(ENV.RECEIVER_EMAIL);
    expect(mail.from).toEqual({ name: 'ma.codes Contact Form', address: SMTP_USER });
    expect(mail.replyTo).toEqual({ name: msg.name, address: msg.email });
    expect(mail.subject).toBe(`${msg.subject} (ma.codes contact form)`);
    expect(mail.text).toContain(msg.message);
  });

  it('accepts a subject of exactly the limit', async () => {
    const { POST } = await loadRoute();
    const res = await POST(post(validContactMessage({ subject: 's'.repeat(175) })));
    expect(res.status).toBe(200);
  });

  it('HTML-escapes every visitor field in the HTML body (no stored XSS in the inbox)', async () => {
    const { POST } = await loadRoute();
    const payload = '<img src=x onerror="alert(1)">&\'';
    await POST(post(validContactMessage({ name: `Eve ${payload}`, message: `${payload}\n`.repeat(3) + 'x'.repeat(20) })));
    const { html } = sendMail.mock.calls[0][0];
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror="');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
    expect(html).toContain('<br>'); // newlines survive as markup, after escaping
  });

  it('reports an SMTP rejection by code, and never logs the SMTP account', async () => {
    const { POST } = await loadRoute();
    sendMail.mockRejectedValueOnce(
      Object.assign(new Error(`Invalid login: 535 Authentication failed for ${SMTP_USER}`), { responseCode: 535 }),
    );
    const { status, body } = await json(await POST(post(validContactMessage())));
    expect(status).toBe(500);
    expect(body.error).toBe('Mail server rejected the request (code 535).');
    expect(logs.join('\n')).not.toContain(SMTP_USER);
    expect(logs.join('\n')).toContain('[SMTP_USER]');
  });
});

describe('Abstract email-reputation check (MSW over real fetch)', () => {
  beforeEach(() => {
    process.env.ABSTRACT_API_KEY = ABSTRACT_KEY;
  });

  it('asks about the visitor’s address, URL-encoded', async () => {
    const { POST } = await loadRoute();
    const seen = [];
    server.use(abstractHandler('deliverable', { record: (url) => seen.push(url) }));
    await POST(post(validContactMessage({ email: 'ada+test@example.com' })));
    expect(seen).toHaveLength(1);
    expect(seen[0].searchParams.get('email')).toBe('ada+test@example.com');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['undeliverable', 'This email address does not exist or cannot receive emails.'],
    ['disposable', 'Disposable email addresses are not allowed.'],
  ])('refuses an %s address', async (verdict, error) => {
    const { POST } = await loadRoute();
    server.use(abstractHandler(verdict));
    const { status, body } = await json(await POST(post(validContactMessage())));
    expect(status).toBe(400);
    expect(body.errors).toContain(error);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each([
    ['a 5xx', () => abstractHandler('deliverable', { status: 503 })],
    ['a network failure', () => http.get('https://emailreputation.abstractapi.com/v1/', () => HttpResponse.error())],
  ])('fails OPEN on %s: the message is still sent', async (_label, handler) => {
    const { POST } = await loadRoute();
    server.use(handler());
    const res = await POST(post(validContactMessage()));
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('never writes the API key (which rides in the URL) to a log', async () => {
    const { POST } = await loadRoute();
    server.use(http.get('https://emailreputation.abstractapi.com/v1/', () => HttpResponse.error()));
    await POST(post(validContactMessage()));
    expect(logs.length).toBeGreaterThan(0); // the failure WAS logged…
    expect(logs.join('\n')).not.toContain(ABSTRACT_KEY); // …without the key
  });

  it('skips the lookup entirely for an address that is already malformed', async () => {
    const { POST } = await loadRoute();
    // No handler registered: any request would fail the suite (onUnhandledFrame).
    const res = await POST(post(validContactMessage({ email: 'not-an-email' })));
    expect(res.status).toBe(400);
  });
});

describe('idempotency state machine (stateful fake Redis)', () => {
  const KEY = '3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b';
  const STORE_KEY = `contact:idempotency:${KEY}`;
  const withKey = (key = KEY) => ({ 'Idempotency-Key': key });

  it('claims, sends once, then records SENT for 24 hours under a namespaced key', async () => {
    const { POST } = await loadRoute({ store: true });
    const res = await POST(post(validContactMessage(), withKey()));
    expect(res.status).toBe(200);
    const { store, ttl, calls } = fake.current.handle;
    expect(calls[0]).toEqual(['set', STORE_KEY, 'pending', { nx: true, ex: 120 }]);
    expect(store.get(STORE_KEY)).toBe('sent');
    expect(ttl.get(STORE_KEY)).toBe(24 * 60 * 60);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('dedupes a retry of a delivered message to success, without mailing twice', async () => {
    const { POST } = await loadRoute({ store: true });
    await POST(post(validContactMessage(), withKey()));
    const { status, body } = await json(await POST(post(validContactMessage(), withKey())));
    expect(status).toBe(200);
    expect(body.deduped).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('answers 409 retryable while another attempt holds the claim', async () => {
    const { POST } = await loadRoute({ store: true });
    fake.current.handle.store.set(STORE_KEY, 'pending');
    const { status, body } = await json(await POST(post(validContactMessage(), withKey())));
    expect(status).toBe(409);
    expect(body.retryable).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('releases its claim when SMTP fails, so a retry can still deliver', async () => {
    const { POST } = await loadRoute({ store: true });
    sendMail.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    expect((await POST(post(validContactMessage(), withKey()))).status).toBe(500);
    expect(fake.current.handle.store.has(STORE_KEY)).toBe(false);
    // …and the retry goes through.
    expect((await POST(post(validContactMessage(), withKey()))).status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('fails OPEN when the store is down, and then touches nothing it does not own', async () => {
    const { POST } = await loadRoute({ store: true });
    fake.current.handle.fail('set');
    const res = await POST(post(validContactMessage(), withKey()));
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
    // One (failed) SET, then no DEL and no SENT promotion: the claim was not ours.
    expect(fake.current.handle.calls.map(([cmd]) => cmd)).toEqual(['set']);
  });

  it('treats an unreadable claim state as not-yet-sent (409, keep it queued)', async () => {
    const { POST } = await loadRoute({ store: true });
    fake.current.handle.store.set(STORE_KEY, 'sent');
    fake.current.handle.fail('get');
    const res = await POST(post(validContactMessage(), withKey()));
    expect(res.status).toBe(409);
  });

  it.each([
    ['too long', 'k'.repeat(129)],
    ['spaces', 'has spaces in it'],
    // (CR/LF cannot be tested here: the Fetch Headers class itself refuses
    // them, so that attack never reaches the route at all.)
    ['a command-injection attempt', 'x;FLUSHALL'],
    ['glob characters', 'contact:*'],
  ])('ignores a malformed key (%s): sends, but never lets it near the store', async (_label, key) => {
    const { POST } = await loadRoute({ store: true });
    const res = await POST(post(validContactMessage(), withKey(key)));
    expect(res.status).toBe(200);
    expect(fake.current.handle.calls).toEqual([]);
  });

  it('under a genuine race, two requests with one key mail exactly once', async () => {
    const { POST } = await loadRoute({ store: true });
    // Slow the SMTP send so both requests are in flight together.
    sendMail.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({}), 20)));
    const results = await Promise.all([
      POST(post(validContactMessage(), withKey())),
      POST(post(validContactMessage(), withKey())),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('under a burst of ten concurrent retries, still mails exactly once', async () => {
    const { POST } = await loadRoute({ store: true });
    sendMail.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({}), 20)));
    const results = await Promise.all(
      Array.from({ length: 10 }, () => POST(post(validContactMessage(), withKey()))),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
