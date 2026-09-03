import { describe, expect, it } from 'vitest';
import { validateMessage, MESSAGE_MAX } from '@/lib/guestbook/validate';

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
});
