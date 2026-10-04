import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';

import { safeBearerEqual } from '@/app/api/_utils/cronAuth';
import { describeError, redactSecrets } from '@/app/api/_utils/redact';

// Log redaction and the constant-time bearer compare, as invariants (issue #92,
// L2). Both are last lines of defence: redaction is what keeps a credential out
// of a log drain when a library quotes it in an error, and safeBearerEqual is
// the only thing between the internet and the cron routes. Example tests prove
// the cases someone thought of. These prove the rule over every string
// fast-check can construct around a secret.
//
// Secrets are drawn from the alphabets real credentials use (hex, base64url,
// the `ghp_`-style prefixes). A value built from the placeholder's own
// characters (`[CRON_SECRET]`) could in principle re-form around a replacement,
// but no provider issues tokens containing brackets, and generating them would
// make the property about an input that cannot occur.

const SECRET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const secretArb = (min, max) =>
  fc.string({ unit: fc.constantFrom(...SECRET_ALPHABET), minLength: min, maxLength: max });
const noise = fc.string({ maxLength: 40 });

const saved = process.env.CRON_SECRET;
afterEach(() => {
  if (saved === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved;
});

const contains = (haystack, needle) => haystack.toLowerCase().includes(needle.toLowerCase());

describe('redactSecrets — properties', () => {
  it('removes a long secret wherever it appears, in any case', () => {
    fc.assert(
      fc.property(secretArb(8, 64), noise, noise, fc.boolean(), (secret, before, after, upper) => {
        process.env.CRON_SECRET = secret;
        const leaked = `${before}${upper ? secret.toUpperCase() : secret}${after}`;
        const out = redactSecrets(leaked);
        expect(contains(out, secret)).toBe(false);
        expect(out).toContain('[CRON_SECRET]');
      }),
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(secretArb(8, 64), noise, noise, (secret, before, after) => {
        process.env.CRON_SECRET = secret;
        const once = redactSecrets(`${before}${secret}${after}`);
        expect(redactSecrets(once)).toBe(once);
      }),
    );
  });

  it('leaves text that holds no configured secret byte-for-byte unchanged', () => {
    fc.assert(
      fc.property(secretArb(8, 64), noise, (secret, text) => {
        fc.pre(!contains(text, secret));
        process.env.CRON_SECRET = secret;
        expect(redactSecrets(text)).toBe(text);
      }),
    );
  });

  it('redacts a SHORT secret only where it stands alone as a token', () => {
    fc.assert(
      fc.property(secretArb(3, 7), (secret) => {
        fc.pre(/^[\w-]+$/.test(secret));
        process.env.CRON_SECRET = secret;
        // Standing alone: gone. Judged token by token, not by substring: a
        // 3–7 character secret can occur inside the fixed words around it or
        // the placeholder that replaces it. The first 20,000-run soak
        // (2026-10-04) drew "SWo", which "password" contains, and failed a
        // redaction that had worked.
        const tokens = redactSecrets(`password is ${secret} here`).split(/\s+/);
        expect(tokens).not.toContain(secret);
        expect(tokens).toHaveLength(4);
        // Inside a longer word: left alone, or every "id" in a log would vanish.
        expect(redactSecrets(`x${secret}y`)).toBe(`x${secret}y`);
      }),
    );
  });

  it('follows the cause chain: a secret deep in `error.cause` never survives', () => {
    fc.assert(
      fc.property(secretArb(8, 64), fc.integer({ min: 0, max: 3 }), (secret, depth) => {
        process.env.CRON_SECRET = secret;
        let err = new Error(`connect failed using ${secret}`);
        for (let i = 0; i < depth; i += 1) err = new Error('fetch failed', { cause: err });
        expect(contains(describeError(err), secret)).toBe(false);
      }),
    );
  });
});

describe('safeBearerEqual — properties', () => {
  it('accepts exactly "Bearer <secret>" and nothing else', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 64 }), fc.string({ maxLength: 80 }), (secret, header) => {
        expect(safeBearerEqual(`Bearer ${secret}`, secret)).toBe(true);
        expect(safeBearerEqual(header, secret)).toBe(header === `Bearer ${secret}`);
      }),
    );
  });

  it('rejects every one-character corruption of a valid header', () => {
    fc.assert(
      fc.property(secretArb(8, 64), fc.nat(), fc.constantFrom(...SECRET_ALPHABET), (secret, at, ch) => {
        const i = at % secret.length;
        fc.pre(secret[i] !== ch);
        const wrong = secret.slice(0, i) + ch + secret.slice(i + 1);
        expect(safeBearerEqual(`Bearer ${wrong}`, secret)).toBe(false);
      }),
    );
  });

  it('never throws on hostile input (non-strings, multi-byte, mismatched lengths)', () => {
    fc.assert(
      fc.property(fc.anything(), fc.string({ unit: 'grapheme', maxLength: 20 }), (header, secret) => {
        expect(() => safeBearerEqual(header, secret)).not.toThrow();
      }),
    );
  });
});
