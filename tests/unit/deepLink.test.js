import { describe, expect, it } from 'vitest';
import { messageIdFromHash } from '@/lib/guestbook/deepLink';

describe('messageIdFromHash', () => {
  it('returns the id for a plain deep link', () => {
    expect(messageIdFromHash('#msg_1725000000000_ab12cd34')).toBe(
      'msg_1725000000000_ab12cd34',
    );
  });

  it('decodes a percent-encoded hash', () => {
    expect(messageIdFromHash('#msg%5F1_ab12cd34')).toBe('msg_1_ab12cd34');
  });

  it('is a no-op for an empty or bare hash', () => {
    expect(messageIdFromHash('')).toBe('');
    expect(messageIdFromHash('#')).toBe('');
    expect(messageIdFromHash(undefined)).toBe('');
  });

  it('treats a malformed percent sequence as a no-op instead of throwing', () => {
    expect(() => messageIdFromHash('#%zz')).not.toThrow();
    expect(messageIdFromHash('#%zz')).toBe('');
    expect(messageIdFromHash('#msg_1%')).toBe('');
    expect(messageIdFromHash('#%E0%A4%A')).toBe('');
  });
});
