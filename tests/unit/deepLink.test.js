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

  // The page's own anchors must never start the deep-link walk (loadUntil
  // fetches up to ten 50-message pages for an id it cannot find): only a
  // fragment shaped like a minted id (messageId.js) is a message.
  it("an ordinary page anchor is not a message id — '#guestbook' starts no crawl", () => {
    expect(messageIdFromHash('#guestbook')).toBe('');
    expect(messageIdFromHash('#top')).toBe('');
    expect(messageIdFromHash('#msg')).toBe('');
    expect(messageIdFromHash('#msg_')).toBe('');
    expect(messageIdFromHash('#msg_google')).toBe('');
    expect(messageIdFromHash('#msg_1725000000000')).toBe('');
    expect(messageIdFromHash('#msg_1725000000000_AB12CD34')).toBe('');
    expect(messageIdFromHash('#msg_1725000000000_ab12cd3')).toBe('');
    expect(messageIdFromHash('#msg_1725000000000_ab12cd34_x')).toBe('');
    expect(messageIdFromHash('#msg_1725000000000_ab12cd34/../x')).toBe('');
    expect(messageIdFromHash('#msg_x_ab12cd34')).toBe('');
  });

  it('a percent-encoded fragment is validated AFTER decoding', () => {
    // Decodes to a real id → returned; decodes to an anchor → nothing.
    expect(messageIdFromHash('#msg%5F1725000000000%5Fab12cd34')).toBe(
      'msg_1725000000000_ab12cd34',
    );
    expect(messageIdFromHash('#guest%62ook')).toBe('');
  });
});
