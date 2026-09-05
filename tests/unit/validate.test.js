import { describe, expect, it } from 'vitest';
import {
  containsUrl,
  validateMessage,
  MESSAGE_MAX,
} from '@/lib/guestbook/validate';
import * as limits from '@/lib/guestbook/limits';

describe('validateMessage', () => {
  it('accepts a normal message and returns the cleaned value', () => {
    const r = validateMessage('  Incredible   portfolio!  ');
    expect(r.ok).toBe(true);
    expect(r.value).toBe('Incredible portfolio!');
  });

  it('rejects non-strings', () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      expect(validateMessage(bad).ok).toBe(false);
    }
  });

  it('enforces the 2–150 length band on the TRIMMED value', () => {
    expect(validateMessage('a').ok).toBe(false);
    expect(validateMessage('  a  ').ok).toBe(false);
    expect(validateMessage('ab').ok).toBe(true);
    expect(validateMessage('x'.repeat(MESSAGE_MAX)).ok).toBe(true);
    expect(validateMessage('x'.repeat(MESSAGE_MAX + 1)).ok).toBe(false);
  });

  it('rejects control characters (single-line input was bypassed)', () => {
    expect(validateMessage('hello\nworld').ok).toBe(false);
    expect(validateMessage('hello\u0007world').ok).toBe(false);
    expect(validateMessage('hello\tworld').ok).toBe(false);
  });

  it('rejects URLs in every common shape', () => {
    expect(validateMessage('visit https://spam.example now').ok).toBe(false);
    expect(validateMessage('visit www.spam.example now').ok).toBe(false);
    expect(validateMessage('visit spam-site.com now').ok).toBe(false);
    expect(validateMessage('check bit.ly slash x').ok).toBe(false);
  });

  it('rejects profanity, including leet and stretched variants', () => {
    expect(validateMessage('well shit').ok).toBe(false);
    expect(validateMessage('well sh1t').ok).toBe(false);
    expect(validateMessage('fuuuuck this').ok).toBe(false);
  });

  it('does not Scunthorpe innocent words', () => {
    expect(validateMessage('a class assessment in Scunthorpe').ok).toBe(true);
    expect(validateMessage('great craftsmanship, basically art').ok).toBe(true);
  });

  it('shares its length band with limits.js, the module client code imports', () => {
    expect(MESSAGE_MAX).toBe(limits.MESSAGE_MAX);
  });
});

// The no-links policy, public-suffix-aware. The first cut matched a shortlist
// of fifteen TLDs, so a bare domain on any other — spam.ai, spam.tech — passed
// both gates and landed on a public wall. Every case below names the message
// it checks, so a failure reads as the sentence that got through or got
// blocked.
describe('validateMessage — no links, on any real TLD', () => {
  const refused = (s) =>
    expect(validateMessage(s), s).toMatchObject({
      ok: false,
      error: expect.stringMatching(/links are not allowed/i),
    });
  const kept = (s) => expect(validateMessage(s), s).toMatchObject({ ok: true });

  it('refuses a bare domain on ANY real TLD — the bypass this closes', () => {
    for (const s of [
      'visit spam.ai now',
      'visit spam.tech now',
      'grab it at spam.zip',
      'spam.co.uk has it',
      'try sub.spam.xyz',
      'see spam.ai/free',
      'spam.ai:8080 is up',
      'Spam.AI in caps',
      'wrapped (spam.ai), too',
      'and trailing spam.ai.',
      'an IDN спам.рф as well',
      'a raw 1.2.3.4 address',
    ]) {
      refused(s);
    }
  });

  it('still refuses the explicit shapes', () => {
    refused('visit https://spam.example now');
    refused('visit www.spam.example now');
    refused('HTTP://SPAM.EXAMPLE shouts');
  });

  it('keeps prose that merely contains dots — no registrable domain in it', () => {
    for (const s of [
      'built with node.js and next.js',
      'e.g. this, i.e. that',
      'a Ph.D. in CS',
      'version 1.2.3 shipped',
      'at 9.30 a.m. sharp',
      'a U.S. based team',
      'greetings from St.Louis',
      'Mr.Smith says hi',
      '3.14 is pi',
      'Dear Dr. Who. Great site.',
      'costs £9.99 a month',
    ]) {
      kept(s);
    }
  });

  it('exempts dev file names whose extension is also a ccTLD — as bare names only', () => {
    for (const s of ['edit README.md first', 'run main.py then run.sh', 'see lib.rs and app.ts']) {
      kept(s);
    }
    // …while a real host under one of those TLDs is still a link.
    for (const s of ['www.spam.md wins', 'https://spam.py', 'see docs.spam.sh']) {
      refused(s);
    }
  });

  it("exempts the site's own domain, and nothing hiding behind it", () => {
    kept('love ma.codes!');
    kept('MA.CODES is great');
    refused('see ma.codes.evil.ai');
  });

  it('exposes the detector itself', () => {
    expect(containsUrl('spam.ai')).toBe(true);
    expect(containsUrl('node.js')).toBe(false);
    expect(containsUrl('')).toBe(false);
  });
});
