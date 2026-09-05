import { describe, expect, it } from 'vitest';
import { arrivalAnnouncement } from '@/lib/guestbook/events';

// The wall's screen-reader copy for new arrivals: one string per batch, so a
// poll that brings several marks at once is heard in full — React would fold
// one live-region write per message into a single DOM change, and assistive
// technology would announce only the last.

const mark = (name, message) => ({ author: { name }, message });

describe('arrivalAnnouncement', () => {
  it('is empty when nothing arrived', () => {
    expect(arrivalAnnouncement([])).toBe('');
  });

  it('keeps the single-arrival copy', () => {
    expect(arrivalAnnouncement([mark('Alice', 'hello there')])).toBe(
      'New message from Alice: hello there',
    );
  });

  it('folds a batch into one string naming every arrival, in the order given', () => {
    const text = arrivalAnnouncement([
      mark('Alice', 'first in'),
      mark('Bob', 'then me'),
      mark('Carol', 'and last'),
    ]);
    expect(text).toBe(
      '3 new messages. Alice: first in. Bob: then me. Carol: and last',
    );
    // Every author is present exactly once — nobody is dropped for the last.
    for (const name of ['Alice', 'Bob', 'Carol']) {
      expect(text.split(name)).toHaveLength(2);
    }
  });

  it('falls back to "Someone" when an author has no display name', () => {
    expect(
      arrivalAnnouncement([{ author: {}, message: 'anon mark' }]),
    ).toBe('New message from Someone: anon mark');
  });
});
