import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { freshSecret, freshShortSecret } from '../helpers/secrets.js';

import {
  SECRET_ENV_VARS,
  describeError,
  redactSecrets,
} from '@/app/api/_utils/redact';

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

// The ENDPOINT stays a readable literal, deliberately: it is an address, not a
// credential, and `tests/helpers/secrets.js` says so in as many words —
// `KV_REST_API_URL` is pinned to a reserved-TLD placeholder precisely so it is
// legible and unresolvable, and randomising it would cost that and protect
// nothing. The TOKEN beside it is the opposite case and is minted per run.
const URL_VALUE = 'https://eu2-notreal-12345.upstash.io';
const TOKEN_VALUE = freshSecret('test-kv-token');

const SET_BY_CASES = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'GITHUB_TOKEN',
  'SMTP_USER',
  'RECEIVER_EMAIL',
  'GSC_SERVICE_ACCOUNT_KEY',
];

beforeEach(() => {
  for (const name of SET_BY_CASES) delete process.env[name];
});

afterEach(() => {
  for (const name of SET_BY_CASES) delete process.env[name];
});

// ── The list, held against the environment rather than against memory ───────
// The allowlist was first written by copying the credential TABLE in CLAUDE.md,
// which is a summary for a reader and not a manifest — so it missed
// `GSC_SERVICE_ACCOUNT_KEY` and `RECEIVER_EMAIL`, one in each of the two routes
// this module was written for. A list maintained by remembering to update it
// fails the same way twice; this is the part that makes the next omission a red
// build instead of a review finding.
describe('the secret allowlist covers the environment it protects', () => {
  /** Variable names declared in `.env.example`, which is the tracked manifest. */
  const declaredEnvVars = () => {
    const source = readFileSync(
      path.join(process.cwd(), '.env.example'),
      'utf8',
    );
    return [...source.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map(
      (match) => match[1],
    );
  };

  // Everything in `.env.example` that is NOT a credential, each with the reason
  // it is safe in a log. Written out rather than pattern-matched, because
  // "looks public" is exactly the judgement that produced the gap above.
  const PUBLIC_BY_DESIGN = {
    NEXT_PUBLIC_GITHUB_USERNAME:
      'NEXT_PUBLIC_ — inlined into the client bundle at build, public by definition',
    BASE_URL: 'the deployment’s own public origin',
    SMTP_HOST: 'a mail provider’s public hostname',
    SMTP_PORT: 'a port number',
    GOOGLE_SITE_VERIFICATION:
      'published verbatim in a <meta> tag on every page',
    GUESTBOOK_ADMIN:
      'a public GitHub numeric id — it names who may moderate, and holding it unlocks nothing without that account',
  };

  it('classifies every variable .env.example declares', () => {
    const declared = declaredEnvVars();
    // Guard on the guard: a parse that matched nothing would make this pass
    // while checking no variable at all.
    expect(declared.length).toBeGreaterThanOrEqual(15);

    const unclassified = declared.filter(
      (name) =>
        !SECRET_ENV_VARS.includes(name) &&
        !Object.hasOwn(PUBLIC_BY_DESIGN, name),
    );

    expect(
      unclassified,
      `.env.example declares these, and redact.js neither redacts them nor ` +
        `this file records why they are safe in a log:\n  ` +
        `${unclassified.join('\n  ')}\n\n` +
        `Add each to SECRET_ENV_VARS, or to PUBLIC_BY_DESIGN here with the ` +
        `reason it is public.`,
    ).toEqual([]);
  });

  it('names the two the CLAUDE.md table omitted', () => {
    // Pinned by name, not left to the sweep above: these are the ones that were
    // actually missing, in the two routes `describeError` is called from.
    expect(SECRET_ENV_VARS).toContain('GSC_SERVICE_ACCOUNT_KEY');
    expect(SECRET_ENV_VARS).toContain('RECEIVER_EMAIL');
  });

  it('does not redact a variable recorded as public', () => {
    // The other direction, and the one that keeps PUBLIC_BY_DESIGN honest: a
    // name cannot sit in both lists and have the classification mean anything.
    for (const name of Object.keys(PUBLIC_BY_DESIGN)) {
      expect(
        SECRET_ENV_VARS,
        `${name} is recorded as public AND redacted.`,
      ).not.toContain(name);
    }
  });
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

  it('redacts the service-account key a signing failure could quote', () => {
    // The base64 blob holds an RSA private key, and it is read in the route
    // whose catch calls `describeError`. `atob`/`JSON.parse`/`createSign` all
    // throw with the input in scope, and a library that echoes what it was
    // handed is the whole reason this module exists.
    const key = Buffer.from(
      JSON.stringify({ private_key: 'notreal', client_email: 'x@y.z' }),
    ).toString('base64');
    process.env.GSC_SERVICE_ACCOUNT_KEY = key;

    const redacted = redactSecrets(`Error: bad key material: ${key}`);

    expect(redacted).toBe('Error: bad key material: [GSC_SERVICE_ACCOUNT_KEY]');
  });

  it('redacts the delivery inbox a bounce would name', () => {
    // A rejected recipient comes back with the envelope in it. `RECEIVER_EMAIL`
    // is server-only by construction — it exists as a variable separate from
    // `NEXT_PUBLIC_CONTACT_EMAIL` for exactly that reason — and /api/send-mail
    // logs the rejection it appears in.
    process.env.RECEIVER_EMAIL = 'inbox-notreal@example.com';

    expect(
      redactSecrets(
        '550 5.1.1 <inbox-notreal@example.com>: recipient rejected',
      ),
    ).toBe('550 5.1.1 <[RECEIVER_EMAIL]>: recipient rejected');
  });

  it('redacts the hostname when the configured URL carries a port', () => {
    // `URL.host` keeps the port, and a DNS failure names the hostname ALONE —
    // the resolver never saw a port. So for any deployment whose endpoint is
    // configured with one, the host needle could not match the error shape it
    // exists to catch, and the endpoint reached the log exactly as before.
    process.env.KV_REST_API_URL = 'https://eu2-notreal-12345.upstash.io:6379';

    expect(
      redactSecrets('Error: getaddrinfo ENOTFOUND eu2-notreal-12345.upstash.io'),
    ).toBe('Error: getaddrinfo ENOTFOUND [KV_REST_API_URL]');

    // And the form that DOES carry the port goes as one unit, rather than
    // leaving `:6379` stranded beside a placeholder.
    expect(
      redactSecrets('connect ECONNREFUSED eu2-notreal-12345.upstash.io:6379'),
    ).toBe('connect ECONNREFUSED [KV_REST_API_URL]');
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

  it('redacts a short value where it stands alone, not inside a word', () => {
    // This case used to assert the opposite — that a value under eight
    // characters was skipped entirely, on the reasoning that it would match
    // inside ordinary words and shred the line. The noise was real and the
    // conclusion was an exemption: an operator with a seven-character
    // `CRON_SECRET` or a short SMTP password is the deployment least able to
    // afford it in a drain, and this module does not get to decide their
    // credential is not one. Bounded matching keeps the short case safe without
    // the confetti.
    // Short AND generated. `freshShortSecret` exists so the two are not a
    // trade: a hand-written weak password here would be a credential-shaped
    // string committed to history, and the repository's rule draws no
    // exception for one that is only pretending.
    const weak = freshShortSecret();
    process.env.GITHUB_TOKEN = weak;

    expect(redactSecrets(`rejected token ${weak} at 01:00`)).toBe(
      'rejected token [GITHUB_TOKEN] at 01:00',
    );
    // Not inside a longer word, which is what made the blanket skip tempting.
    expect(redactSecrets(`the ${weak}000 build`)).toBe(`the ${weak}000 build`);
    expect(redactSecrets(`pre${weak} and ${weak}x`)).toBe(
      `pre${weak} and ${weak}x`,
    );
  });

  it('still matches a long value embedded in a longer string', () => {
    // The other half of the tier, and the reason it IS a tier: a boundary rule
    // applied to everything would let a high-entropy token through whenever a
    // library concatenated it into a longer word. Length is what makes that
    // trade safe in one direction and not the other.
    const token = freshSecret('test-github-token');
    process.env.GITHUB_TOKEN = token;

    expect(redactSecrets(`Authorization=Bearer${token}xyz`)).toBe(
      'Authorization=Bearer[GITHUB_TOKEN]xyz',
    );
  });

  it('skips an unset variable rather than matching between every character', () => {
    // Empty is the one length with no safe treatment: a zero-length needle
    // matches at every position, so this is the case that has to be a skip.
    process.env.GITHUB_TOKEN = '';
    const text = 'nothing secret here at all';

    expect(redactSecrets(text)).toBe(text);
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
    expect(described).not.toContain(TOKEN_VALUE);
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
