import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAdminIdentity } from '@/lib/guestbook/admin';

// isAdminIdentity backs BOTH delete authorities: the DELETE route's real gate
// and the session callback's display-only `isAdmin` stamp. GUESTBOOK_ADMIN
// must be the owner's identity key (identity.js) — a login is refused, since
// a renamed login can be claimed by another account. The env var is read
// per-call (not captured at import), so the tests can set and restore it
// around each case.

describe('isAdminIdentity', () => {
  let saved;
  beforeEach(() => {
    saved = process.env.GUESTBOOK_ADMIN;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.GUESTBOOK_ADMIN;
    else process.env.GUESTBOOK_ADMIN = saved;
    vi.restoreAllMocks();
  });

  it("matches the viewer's identity key exactly, whatever their login", () => {
    process.env.GUESTBOOK_ADMIN = 'github:1002643';
    expect(isAdminIdentity({ key: 'github:1002643', username: 'MA1002643' })).toBe(true);
    expect(isAdminIdentity({ key: 'github:1002643', username: null })).toBe(true);
    expect(isAdminIdentity({ key: 'github:1002644', username: 'MA1002643' })).toBe(false);
  });

  it('the renamed owner is still the moderator; the holder of the old login never is', () => {
    process.env.GUESTBOOK_ADMIN = 'github:1002643';
    // The owner, after renaming their account.
    expect(isAdminIdentity({ key: 'github:1002643', username: 'renamed-owner' })).toBe(true);
    // Whoever registered the owner's released login on their own account.
    expect(isAdminIdentity({ key: 'github:9999', username: 'MA1002643' })).toBe(false);
    // Nor anyone whose username merely spells the key (impossible for a
    // GitHub login, ruled out regardless).
    expect(isAdminIdentity({ key: 'github:9999', username: 'github:1002643' })).toBe(false);
  });

  it('is exact — no case folding, no prefix or suffix games', () => {
    process.env.GUESTBOOK_ADMIN = 'github:1002643';
    expect(isAdminIdentity({ key: 'GITHUB:1002643' })).toBe(false);
    expect(isAdminIdentity({ key: 'github:10026430' })).toBe(false);
    expect(isAdminIdentity({ key: 'github:100264' })).toBe(false);
    expect(isAdminIdentity({ key: 'google:1002643' })).toBe(false);
  });

  it('tolerates surrounding whitespace in the variable (a pasted trailing newline)', () => {
    process.env.GUESTBOOK_ADMIN = ' github:1002643\n';
    expect(isAdminIdentity({ key: 'github:1002643' })).toBe(true);
  });

  it('rejects a missing identity and an unset or empty variable', () => {
    process.env.GUESTBOOK_ADMIN = 'github:1002643';
    expect(isAdminIdentity(null)).toBe(false);
    expect(isAdminIdentity(undefined)).toBe(false);
    expect(isAdminIdentity({})).toBe(false);
    expect(isAdminIdentity({ key: '' })).toBe(false);
    delete process.env.GUESTBOOK_ADMIN;
    expect(isAdminIdentity({ key: 'github:1002643' })).toBe(false);
    process.env.GUESTBOOK_ADMIN = '';
    expect(isAdminIdentity({ key: 'github:1002643' })).toBe(false);
    // An unset env must never make "missing" match "missing".
    delete process.env.GUESTBOOK_ADMIN;
    expect(isAdminIdentity({ key: undefined })).toBe(false);
  });

  it('a login-form value grants nobody — not even a matching username — and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.GUESTBOOK_ADMIN = 'MA1002643';
    // The pre-key form: the owner's own login. Still not the moderator —
    // that is the takeover path this closes.
    expect(isAdminIdentity({ key: 'github:1002643', username: 'MA1002643' })).toBe(false);
    expect(isAdminIdentity({ key: 'github:1002643', username: 'ma1002643' })).toBe(false);
    expect(isAdminIdentity({ key: 'github:9999', username: 'MA1002643' })).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/GUESTBOOK_ADMIN/);
    expect(warn.mock.calls[0][0]).toMatch(/github:<your numeric GitHub user id>/);
  });
});
