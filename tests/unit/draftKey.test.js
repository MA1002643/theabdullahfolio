import { describe, expect, it } from 'vitest';
import { draftKeyFor, LEGACY_DRAFT_KEY } from '@/lib/guestbook/draftKey';

// The composer's draft slot (draftKey.js): one per signed-in account, named
// by the session's stable identity key — never one per browser.

describe('draftKeyFor — one draft slot per account', () => {
  it('scopes the slot to the session identity key', () => {
    expect(draftKeyFor({ key: 'github:583231', username: 'octocat', name: 'The Octocat' })).toBe(
      'guestbook:draft:v2:github:583231',
    );
    expect(draftKeyFor({ key: 'google:42', name: 'Gee' })).toBe('guestbook:draft:v2:google:42');
  });

  it('two accounts never share a slot, and a rename does not move one', () => {
    const before = draftKeyFor({ key: 'github:583231', username: 'octocat' });
    const after = draftKeyFor({ key: 'github:583231', username: 'octocat-renamed' });
    const claimant = draftKeyFor({ key: 'github:999', username: 'octocat' });
    expect(after).toBe(before);
    expect(claimant).not.toBe(before);
  });

  it('a session without a key gets no slot — nothing is saved for it', () => {
    // A legacy JWT (username, no key), an anonymous viewer, an empty key.
    expect(draftKeyFor({ username: 'octocat', provider: 'github' })).toBe(null);
    expect(draftKeyFor(null)).toBe(null);
    expect(draftKeyFor(undefined)).toBe(null);
    expect(draftKeyFor({ key: '' })).toBe(null);
    expect(draftKeyFor({ key: 42 })).toBe(null);
  });

  it('the pre-scoping browser-wide slot is a different key, so nothing scoped ever reads it', () => {
    expect(LEGACY_DRAFT_KEY).toBe('guestbook:draft:v1');
    expect(draftKeyFor({ key: 'github:1' }).startsWith(LEGACY_DRAFT_KEY)).toBe(false);
  });
});
