import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { describeError, redactSecrets } from '@/app/api/_utils/redact';

// ── Keeping this deployment's configuration out of its own logs ─────────────
// The response side of the leak is solved per route. The log side was left open
// on the reasoning that an operator reading a 01:00 cron failure wants the
// upstream's own words — which is true, and does not license writing a
// credential into a sink that persists, can be forwarded to a drain, and is
// readable by anyone with project access.
//
// Nobody logs an endpoint on purpose. `@upstash/redis` quotes the REST URL it
// could not reach, undici reports the DNS failure underneath as `getaddrinfo
// ENOTFOUND <host>`, and a raw `console.error(err)` carries both through. So
// these cases are written against the shapes those libraries actually produce
// rather than against a tidy fixture.

const URL_VALUE = 'https://eu2-notreal-12345.upstash.io';
const TOKEN_VALUE = 'AXY_notreal_token_value_0123456789';

const SET_BY_CASES = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'GITHUB_TOKEN',
  'SMTP_USER',
];

beforeEach(() => {
  for (const name of SET_BY_CASES) delete process.env[name];
});

afterEach(() => {
  for (const name of SET_BY_CASES) delete process.env[name];
});

describe('redactSecrets', () => {
  it('replaces a configured value with the NAME of its variable', () => {
    process.env.KV_REST_API_URL = URL_VALUE;

    const redacted = redactSecrets(`fetch failed: ${URL_VALUE}/get/seo:latest`);

    expect(redacted).not.toContain('upstash.io');
    expect(redacted).toContain('[KV_REST_API_URL]');
    // The half that must survive: what failed, and where in the call it was.
    expect(redacted).toContain('fetch failed');
    expect(redacted).toContain('/get/seo:latest');
  });

  it('redacts the HOST alone, which is the form a network error names', () => {
    // undici never prints the full REST URL — a DNS failure is `getaddrinfo
    // ENOTFOUND eu2-notreal-12345.upstash.io`, and a refusal is an address and
    // a port. Matching only the whole configured URL would miss every one of
    // them, which is most real failures.
    process.env.KV_REST_API_URL = URL_VALUE;

    const redacted = redactSecrets(
      'Error: getaddrinfo ENOTFOUND eu2-notreal-12345.upstash.io',
    );

    expect(redacted).not.toContain('upstash.io');
    expect(redacted).toBe('Error: getaddrinfo ENOTFOUND [KV_REST_API_URL]');
  });

  it('matches whatever case the value comes back in', () => {
    // DNS lowercases. A host typed with capitals in the dashboard is reported
    // in lowercase by the resolver, so an exact-match scrub would pass it
    // through while looking as though it had run.
    process.env.KV_REST_API_URL = 'https://EU2-NotReal-12345.upstash.io';

    expect(
      redactSecrets('ENOTFOUND eu2-notreal-12345.upstash.io'),
    ).not.toContain('eu2-notreal');
  });

  it('leaves one placeholder when the URL and its host both match', () => {
    // Longest needle first, or the host inside the URL is replaced first and
    // the result is a placeholder wrapped around another.
    process.env.KV_REST_API_URL = URL_VALUE;

    expect(redactSecrets(`POST ${URL_VALUE}/pipeline`)).toBe(
      'POST [KV_REST_API_URL]/pipeline',
    );
  });

  it('covers the UPSTASH_ names as well as the KV_ ones', () => {
    // `redisDriver` reads either pair, so redacting one and not the other
    // would leave a direct-Upstash deployment exposed while looking covered.
    process.env.UPSTASH_REDIS_REST_URL = URL_VALUE;

    expect(redactSecrets(`connect ECONNREFUSED ${URL_VALUE}`)).toContain(
      '[UPSTASH_REDIS_REST_URL]',
    );
  });

  it('does nothing when a variable is unset or empty', () => {
    // The failure mode this guards is not noise, it is `replace` on an empty
    // needle: an unset variable must contribute no match at all, not one
    // between every character.
    process.env.KV_REST_API_URL = '';
    const text = 'nothing secret here at all';

    expect(redactSecrets(text)).toBe(text);
  });

  it('ignores a value too short to match safely', () => {
    // A stray one-character value in a preview environment would otherwise
    // match inside ordinary words and shred the line it was meant to protect.
    process.env.GITHUB_TOKEN = 'a';

    expect(redactSecrets('a failure that mentions a token')).toBe(
      'a failure that mentions a token',
    );
  });

  it('reads the environment per call, not once at import', () => {
    // A snapshot taken at module scope is captured long before any request, so
    // it would redact nothing in an environment configured afterwards — and
    // every case above would pass for the wrong reason.
    expect(redactSecrets(`at ${URL_VALUE}`)).toContain('upstash.io');
    process.env.KV_REST_API_URL = URL_VALUE;
    expect(redactSecrets(`at ${URL_VALUE}`)).not.toContain('upstash.io');
  });
});

describe('describeError', () => {
  beforeEach(() => {
    process.env.KV_REST_API_URL = URL_VALUE;
    process.env.KV_REST_API_TOKEN = TOKEN_VALUE;
  });

  it('walks the cause chain, where undici puts the actual diagnosis', () => {
    // `TypeError: fetch failed` on its own says nothing. The refused address,
    // the DNS verdict and the TLS error all arrive as `cause`, so a fix that
    // logged only the top-level error would delete exactly what the raw object
    // was kept for — and would be reverted the first time a cron failed.
    const described = describeError(
      Object.assign(new TypeError('fetch failed'), {
        cause: new Error(`getaddrinfo ENOTFOUND eu2-notreal-12345.upstash.io`),
      }),
    );

    expect(described).toContain('fetch failed');
    expect(described).toContain('getaddrinfo ENOTFOUND');
    expect(described).toContain('caused by:');
    expect(described).toContain('[KV_REST_API_URL]');
    expect(described).not.toContain('upstash.io');
  });

  it('redacts every configured credential in the chain, not just the first', () => {
    const described = describeError(
      Object.assign(new Error(`write to ${URL_VALUE} refused`), {
        cause: new Error(`auth header carried ${TOKEN_VALUE}`),
      }),
    );

    expect(described).toContain('[KV_REST_API_URL]');
    expect(described).toContain('[KV_REST_API_TOKEN]');
    expect(described).not.toContain('upstash.io');
    expect(described).not.toContain('AXY_notreal');
  });

  it('keeps the stack, so the log still says where it came from', () => {
    expect(describeError(new Error('boom'))).toMatch(/\n\s+at /);
  });

  it('terminates on a cyclic cause', () => {
    // A `cause` pointing back up the chain would otherwise print the same two
    // frames until the depth cap.
    const outer = new Error('outer');
    const inner = new Error('inner');
    outer.cause = inner;
    inner.cause = outer;

    const described = describeError(outer);

    expect(described).toContain('outer');
    expect(described).toContain('inner');
    expect(described.match(/caused by:/g)).toHaveLength(1);
  });

  it('handles a thrown value that is not an Error', () => {
    expect(describeError('just a string')).toBe('just a string');
    expect(describeError({ code: 'ECONNRESET' })).toContain('ECONNRESET');
    expect(describeError(null)).toBe('');
  });
});
