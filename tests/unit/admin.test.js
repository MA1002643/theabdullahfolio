import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAdminUsername } from '@/lib/guestbook/admin';

// isAdminUsername backs BOTH delete authorities: the DELETE route's real gate
// and the session callback's display-only `isAdmin` stamp. The env var is
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
