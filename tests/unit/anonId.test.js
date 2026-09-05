import { describe, expect, it } from 'vitest';
import { PRESENCE_ID_RE, randomAnonId } from '@/lib/guestbook/anonId';

// Every tier of the generator must satisfy the server's regex — this is the
// client↔route lock-step the shared constant exists for — and no tier may
// throw, because the hook calls it from an effect where a throw unmounts the
// wall.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomAnonId', () => {
  it('tier 1: uses crypto.randomUUID when present (a secure context)', () => {
    const id = randomAnonId(globalThis.crypto);
    expect(id).toMatch(UUID_RE);
    expect(id).toMatch(PRESENCE_ID_RE);
  });

  it('tier 2: falls back to getRandomValues where randomUUID is absent (http on a LAN)', () => {
    const insecure = { getRandomValues: (a) => globalThis.crypto.getRandomValues(a) };
    const id = randomAnonId(insecure);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).toMatch(PRESENCE_ID_RE);
    expect(randomAnonId(insecure)).not.toBe(id);
  });

  it('tier 3: still mints a valid id with no crypto object at all', () => {
    const id = randomAnonId(undefined);
    expect(id).toMatch(PRESENCE_ID_RE);
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(randomAnonId(null)).toMatch(PRESENCE_ID_RE);
  });

  it('never throws, even when a crypto method is present but broken', () => {
    const broken = {
      randomUUID: () => {
        throw new Error('not allowed here');
      },
      getRandomValues: () => {
        throw new Error('nor this');
      },
    };
    expect(() => randomAnonId(broken)).not.toThrow();
    expect(randomAnonId(broken)).toMatch(PRESENCE_ID_RE);
  });

  it('defaults to the runtime crypto when called with no argument', () => {
    expect(randomAnonId()).toMatch(PRESENCE_ID_RE);
  });
});
