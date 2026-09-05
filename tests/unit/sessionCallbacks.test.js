import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  jwtCallback,
  sessionCallback,
} from '@/lib/guestbook/sessionCallbacks';

// The Auth.js callbacks behind src/auth.js, as pure functions: what a sign-in
// writes to the JWT and what every session read copies from it. The shapes
// are the ones Auth.js passes — `account` + raw OAuth `profile` on the first
// callback only, `token` alone afterwards.

const GITHUB_SIGN_IN = {
  account: { provider: 'github', providerAccountId: '583231', type: 'oauth' },
  profile: { id: 583231, login: 'octocat', name: 'The Octocat' },
};
const GOOGLE_SIGN_IN = {
  account: { provider: 'google', providerAccountId: '110000000000000000001', type: 'oidc' },
  profile: { sub: '110000000000000000001', name: 'Gee' },
};

describe('jwtCallback — sign-in mints the identity onto the token', () => {
  it('stamps key, provider and the GitHub login as display data', () => {
    const token = jwtCallback({ token: { name: 'The Octocat' }, ...GITHUB_SIGN_IN });
    expect(token).toEqual({
      name: 'The Octocat',
      key: 'github:583231',
      provider: 'github',
      username: 'octocat',
    });
  });

  it('a Google sign-in gets a key and no username — and clears a stale one', () => {
    const token = jwtCallback({ token: { username: 'left-over' }, ...GOOGLE_SIGN_IN });
    expect(token).toEqual({ key: 'google:110000000000000000001', provider: 'google' });
  });

  it('a later call without an account leaves the token untouched', () => {
    const before = { key: 'github:583231', provider: 'github', username: 'octocat' };
    const after = jwtCallback({ token: { ...before } });
    expect(after).toEqual(before);
  });

  it('an unkeyable account mints nothing', () => {
    const token = jwtCallback({
      token: {},
      account: { provider: 'github' },
      profile: { login: 'octocat' },
    });
    expect(token).toEqual({});
  });
});

describe('sessionCallback — every session read copies the identity from the token', () => {
  let saved;
  beforeEach(() => {
    saved = process.env.GUESTBOOK_ADMIN;
    delete process.env.GUESTBOOK_ADMIN;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.GUESTBOOK_ADMIN;
    else process.env.GUESTBOOK_ADMIN = saved;
    vi.restoreAllMocks();
  });

  const fresh = () => ({ user: { name: 'The Octocat', image: 'https://a/b.png' } });
  const TOKEN = { key: 'github:583231', provider: 'github', username: 'octocat' };

  it('stamps key, provider, username and a false isAdmin with no admin configured', () => {
    const session = sessionCallback({ session: fresh(), token: TOKEN });
    expect(session.user).toEqual({
      name: 'The Octocat',
      image: 'https://a/b.png',
      key: 'github:583231',
      provider: 'github',
      username: 'octocat',
      isAdmin: false,
    });
  });

  it('a Google token stamps no username', () => {
    const session = sessionCallback({
      session: fresh(),
      token: { key: 'google:42', provider: 'google' },
    });
    expect(session.user.key).toBe('google:42');
    expect(session.user).not.toHaveProperty('username');
  });

  it('isAdmin is true only for the key-form GUESTBOOK_ADMIN matching the token key', () => {
    process.env.GUESTBOOK_ADMIN = 'github:583231';
    expect(sessionCallback({ session: fresh(), token: TOKEN }).user.isAdmin).toBe(true);
    // The owner after a rename: the key is what is compared.
    expect(
      sessionCallback({ session: fresh(), token: { ...TOKEN, username: 'renamed' } }).user
        .isAdmin,
    ).toBe(true);
    // Another account holding the owner's old login: not the moderator.
    expect(
      sessionCallback({ session: fresh(), token: { ...TOKEN, key: 'github:9999' } }).user
        .isAdmin,
    ).toBe(false);
  });

  it('a login-form GUESTBOOK_ADMIN never grants isAdmin — even to the matching login', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.GUESTBOOK_ADMIN = 'octocat';
    expect(sessionCallback({ session: fresh(), token: TOKEN }).user.isAdmin).toBe(false);
  });

  it('rotating GUESTBOOK_ADMIN takes effect on the next session read', () => {
    process.env.GUESTBOOK_ADMIN = 'github:583231';
    expect(sessionCallback({ session: fresh(), token: TOKEN }).user.isAdmin).toBe(true);
    process.env.GUESTBOOK_ADMIN = 'github:1';
    expect(sessionCallback({ session: fresh(), token: TOKEN }).user.isAdmin).toBe(false);
  });

  it('a legacy token (username, no key) stamps no identity at all', () => {
    const session = sessionCallback({
      session: fresh(),
      token: { username: 'octocat', provider: 'github' },
    });
    expect(session.user).toEqual({ name: 'The Octocat', image: 'https://a/b.png' });
  });

  it('a session without a user is returned as is', () => {
    const session = { expires: '2099-01-01T00:00:00.000Z' };
    expect(sessionCallback({ session, token: TOKEN })).toBe(session);
  });
});
