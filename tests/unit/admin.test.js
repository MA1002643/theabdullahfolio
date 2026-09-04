import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isAdminIdentity,
  isAdminKey,
  isAdminUsername,
} from '@/lib/guestbook/admin';

// isAdminIdentity backs BOTH delete authorities: the DELETE route's real gate
// and the session callback's display-only `isAdmin` stamp. It reads
// GUESTBOOK_ADMIN in either of its two forms — a GitHub login (isAdminUsername,
// case-insensitive) or an identity key (isAdminKey, exact). The env var is
// read per-call (not captured at import), so the tests can set and restore it
// around each case.

describe('isAdminUsername', () => {
  let saved;
  beforeEach(() => {
    saved = process.env.GUESTBOOK_ADMIN;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.GUESTBOOK_ADMIN;
    else process.env.GUESTBOOK_ADMIN = saved;
  });

  it('matches the configured admin username exactly', () => {
    process.env.GUESTBOOK_ADMIN = 'MA1002643';
    expect(isAdminUsername('MA1002643')).toBe(true);
  });

  it('is case-insensitive, because GitHub logins are', () => {
    process.env.GUESTBOOK_ADMIN = 'MA1002643';
    expect(isAdminUsername('ma1002643')).toBe(true);
    process.env.GUESTBOOK_ADMIN = 'ma1002643';
    expect(isAdminUsername('MA1002643')).toBe(true);
  });

  it('rejects every other username', () => {
    process.env.GUESTBOOK_ADMIN = 'MA1002643';
    expect(isAdminUsername('someone-else')).toBe(false);
    expect(isAdminUsername('MA1002643x')).toBe(false);
  });

  it('rejects everyone when GUESTBOOK_ADMIN is unset or empty', () => {
    delete process.env.GUESTBOOK_ADMIN;
    expect(isAdminUsername('MA1002643')).toBe(false);
    process.env.GUESTBOOK_ADMIN = '';
    expect(isAdminUsername('MA1002643')).toBe(false);
    // An unset env must never make "missing" match "missing".
    delete process.env.GUESTBOOK_ADMIN;
    expect(isAdminUsername(undefined)).toBe(false);
  });

  it('rejects missing/empty usernames even with an admin configured', () => {
    process.env.GUESTBOOK_ADMIN = 'MA1002643';
    expect(isAdminUsername(undefined)).toBe(false);
    expect(isAdminUsername(null)).toBe(false);
    expect(isAdminUsername('')).toBe(false);
  });

  it('never lets a Google identity shadow the admin', () => {
    // ':' is illegal in a GitHub login, so the google:<sub> namespace can
    // never collide with GUESTBOOK_ADMIN (see src/auth.js identity model).
    process.env.GUESTBOOK_ADMIN = 'MA1002643';
    expect(isAdminUsername('google:1002643')).toBe(false);
  });
});

// The rename hazard (identity.js): a login-form admin is only as stable as
// the login. The key form pins moderation to the account id instead.
describe('isAdminIdentity — login form or key form', () => {
  let saved;
  beforeEach(() => {
    saved = process.env.GUESTBOOK_ADMIN;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.GUESTBOOK_ADMIN;
    else process.env.GUESTBOOK_ADMIN = saved;
  });

  it("a login-form admin matches the viewer's username case-insensitively, whatever their key", () => {
    process.env.GUESTBOOK_ADMIN = 'MA1002643';
    expect(isAdminIdentity({ key: 'github:1002643', username: 'ma1002643' })).toBe(true);
    expect(isAdminIdentity({ key: 'github:1002643', username: 'someone-else' })).toBe(false);
    // A Google viewer has no username, and the login form never reads the key.
    expect(isAdminIdentity({ key: 'google:1002643', username: null })).toBe(false);
  });

  it("a key-form admin matches the viewer's key exactly and never consults the login", () => {
    process.env.GUESTBOOK_ADMIN = 'github:1002643';
    expect(isAdminKey('github:1002643')).toBe(true);
    // The owner, renamed: still the moderator.
    expect(isAdminIdentity({ key: 'github:1002643', username: 'renamed-owner' })).toBe(true);
    // Whoever picked up the owner's old login: not.
    expect(isAdminIdentity({ key: 'github:9999', username: 'MA1002643' })).toBe(false);
    // Nor anyone whose username merely spells the key (impossible for a
    // GitHub login, ruled out anyway), nor a case variant of the key.
    expect(isAdminIdentity({ key: 'github:9999', username: 'github:1002643' })).toBe(false);
    expect(isAdminIdentity({ key: 'GITHUB:1002643', username: 'x' })).toBe(false);
  });

  it('rejects a missing identity and an unset admin', () => {
    process.env.GUESTBOOK_ADMIN = 'github:1002643';
    expect(isAdminIdentity(null)).toBe(false);
    expect(isAdminIdentity({})).toBe(false);
    delete process.env.GUESTBOOK_ADMIN;
    expect(isAdminIdentity({ key: 'github:1002643', username: 'MA1002643' })).toBe(false);
  });
});
