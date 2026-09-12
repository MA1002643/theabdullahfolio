import crypto from 'node:crypto';

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { freshCronSecret, freshSecret } from '../helpers/secrets.js';

// ── "Not configured" is a claim, and only one state may make it ─────────────
// /api/seo-report answers 503 with a `skipped` reason to mean "this integration
// has not been set up"; /api/daily-warmup honours exactly that answer, marks the
// step `notConfigured`, and stays green. Everything else counts against the run.
//
// The regression these cases pin: `readCredentials()` returned null for an
// UNSET variable and for a set-but-unusable one alike — a truncated paste, a
// re-encoded value, the wrong JSON swapped in during a rotation — so a broken
// configured integration answered 503 `skipped`, daily-warmup excused it, and
// the cron stayed green while the report quietly stopped arriving. That is the
// same blind spot the verdict fix closed from the other side, re-entered
// through the credential reader, and it is invisible from the outside: the
// status code is a deliberate one and the body reads like a decision.
//
// So these assert the DISTINCTION, not just the status: absent stays skippable,
// and every invalid shape is a failure daily-warmup will count.

vi.mock('@/lib/guestbook/redisDriver', () => ({
  redis: { get: async () => null, set: async () => 'OK' },
  redisAvailable: true,
}));

const CRON_SECRET = freshCronSecret();

/**
 * daily-warmup's `isNotConfigured`, replicated from its source.
 *
 * Copied deliberately rather than imported: it is the READER's rule, and what
 * these cases need to know is whether this route's answer would be excused by
 * it. Importing the route would test daily-warmup; restating the predicate
 * tests the contract between them, which is the thing that broke.
 */
const wouldBeExcusedByDailyWarmup = (status, body) =>
  status === 503 && typeof body?.skipped === 'string';

let GET;
let realFetch;
let validKey;

beforeAll(async () => {
  // A real keypair: the route signs its JWT before any fetch, so the valid case
  // needs a key that actually signs.
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  validKey = Buffer.from(
    JSON.stringify({
      client_email: 'seo-report@test.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }),
  ).toString('base64');

  process.env.CRON_SECRET = CRON_SECRET;

  realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 't' }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ rows: [] }) };
  };

  ({ GET } = await import('@/app/api/seo-report/route'));
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Call the route with `GSC_SERVICE_ACCOUNT_KEY` set to `key` (or unset). */
async function callWithKey(key) {
  if (key === undefined) delete process.env.GSC_SERVICE_ACCOUNT_KEY;
  else process.env.GSC_SERVICE_ACCOUNT_KEY = key;

  const response = await GET(
    new Request('http://localhost/api/seo-report', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    }),
  );
  return { status: response.status, body: await response.json() };
}

const b64 = (value) => Buffer.from(value).toString('base64');

describe('/api/seo-report — an unset credential is skippable', () => {
  it('answers 503 with a skipped reason, which daily-warmup may excuse', async () => {
    const { status, body } = await callWithKey(undefined);

    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(typeof body.skipped).toBe('string');
    expect(body.error).toBeUndefined();
    expect(wouldBeExcusedByDailyWarmup(status, body)).toBe(true);
  });
});

describe('/api/seo-report — a set but unusable credential fails the run', () => {
  // Every way the variable can be present and unusable. The shared assertions
  // are the point: a failure daily-warmup counts, and a reason that names the
  // variable without quoting any of its value.
  const cases = [
    ['not base64-encoded JSON at all', 'this is not base64 json'],
    ['base64 of something that is not JSON', b64('still not json')],
    ['base64 of an empty object', b64('{}')],
    ['decoded JSON missing private_key', b64('{"client_email":"a@b.test"}')],
    [
      'decoded JSON missing client_email',
      b64('{"private_key":"-----BEGIN PRIVATE KEY-----"}'),
    ],
    // JSON.parse yields these happily, and none has fields to read — the old
    // `!parsed.client_email` would have thrown a TypeError on null.
    ['base64 of JSON null', b64('null')],
    ['base64 of a JSON number', b64('42')],
    ['base64 of a JSON array', b64('[]')],
  ];

  it.each(cases)('%s → 500 that daily-warmup counts', async (_label, key) => {
    const { status, body } = await callWithKey(key);

    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    // The half that matters: it must NOT look like a deliberate opt-out.
    expect(body.skipped).toBeUndefined();
    expect(wouldBeExcusedByDailyWarmup(status, body)).toBe(false);
    // And it must say what is wrong, naming the variable.
    expect(body.error).toContain('GSC_SERVICE_ACCOUNT_KEY');
  });

  it('names the missing field rather than failing anonymously', async () => {
    // The shape is what makes this actionable — "decoded but is missing
    // private_key" tells you the paste truncated; a bare "invalid" does not.
    const { body } = await callWithKey(b64('{"client_email":"a@b.test"}'));
    expect(body.error).toContain('private_key');

    const both = await callWithKey(b64('{}'));
    expect(both.body.error).toContain('client_email');
    expect(both.body.error).toContain('private_key');
  });

  it('logs the reason as well as returning it', async () => {
    // The response reaches the caller; the cron failure is read in the platform
    // log. The silent case was a decoded object of the wrong shape, which used
    // to return null with no log line at all.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await callWithKey(b64('{"client_email":"a@b.test"}'));

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('private_key');
  });

  it('never echoes the credential value, in the body or the log', async () => {
    // This route's responses are readable by anyone holding CRON_SECRET, and an
    // error message is a place a secret leaks from. The value is minted here so
    // a match cannot be a coincidence.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const secretish = freshSecret('test-gsc');

    const { body } = await callWithKey(b64(`{"client_email":"${secretish}"}`));

    // Asserted over the whole serialised body rather than `body.error` alone:
    // it covers every field, and it cannot pass vacuously by the field being
    // absent (`expect(undefined).not.toContain` throws instead of asserting).
    expect(JSON.stringify(body)).not.toContain(secretish);
    for (const call of error.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secretish);
    }
  });

  it('also does not echo a value that failed to decode', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const secretish = freshSecret('test-gsc');

    const { body } = await callWithKey(secretish);

    expect(JSON.stringify(body)).not.toContain(secretish);
    for (const call of error.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secretish);
    }
  });
});

describe('/api/seo-report — a usable credential still runs', () => {
  it('gets past the guard and reports a snapshot', async () => {
    const { status, body } = await callWithKey(validKey);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.skipped).toBeUndefined();
    expect(body.error).toBeUndefined();
  });
});
