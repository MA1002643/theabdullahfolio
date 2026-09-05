import { describe, expect, it } from 'vitest';
import { isMessageId, mintMessageId } from '@/lib/guestbook/messageId';

// The message id's mint and its recogniser live together (messageId.js) so
// the deep link can never disagree with the API about what an id looks like.

describe('mintMessageId / isMessageId — one shape, minted and recognised', () => {
  it('mints msg_<epoch ms>_<8 hex>, and recognises what it minted', () => {
    const id = mintMessageId(1725000000000);
    expect(id).toMatch(/^msg_1725000000000_[0-9a-f]{8}$/);
    expect(isMessageId(id)).toBe(true);
    for (let i = 0; i < 50; i++) expect(isMessageId(mintMessageId())).toBe(true);
  });

  it('two mints in the same millisecond are distinct', () => {
    expect(mintMessageId(1)).not.toBe(mintMessageId(1));
  });

  it('recognises nothing else — page anchors, near misses, non-strings', () => {
    for (const v of [
      'guestbook',
      'top',
      'msg',
      'msg_',
      'msg_google',
      'msg_1',
      'msg_1725000000000',
      'msg_1725000000000_',
      'msg_1725000000000_ab12cd3',
      'msg_1725000000000_ab12cd345',
      'msg_1725000000000_AB12CD34',
      'msg_1725000000000_ab12cd3g',
      'msg_17250000000001725000000000_ab12cd34',
      ' msg_1725000000000_ab12cd34',
      'msg_1725000000000_ab12cd34\n',
      '',
      null,
      undefined,
      1725000000000,
    ]) {
      expect(isMessageId(v)).toBe(false);
    }
  });
});
