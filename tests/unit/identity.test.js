import { describe, expect, it } from 'vitest';
import {
  authorKey,
  identityFromSignIn,
  ownsMessage,
  viewerFromSession,
} from '@/lib/guestbook/identity';

// The identity model behind the wall (identity.js): the key the guestbook
// compares is the provider account id, minted at sign-in; the GitHub login
// rides beside it as display data and is never compared.

// The shapes Auth.js hands the jwt callback on a first sign-in.
const GITHUB = {
  account: { provider: 'github', providerAccountId: '583231', type: 'oauth' },
  profile: { id: 583231, login: 'octocat', name: 'The Octocat' },
};
const GOOGLE = {
  account: {
    provider: 'google',
    providerAccountId: '110000000000000000001',
    type: 'oidc',
  },
  profile: { sub: '110000000000000000001', name: 'Gee', email: 'g@example.com' },
};

describe('identityFromSignIn — the key is the account id', () => {
  it('keys a GitHub account by id and keeps the login as display data', () => {
    expect(identityFromSignIn(GITHUB)).toEqual({
      key: 'github:583231',
      provider: 'github',
      username: 'octocat',
    });
  });

  it('a renamed GitHub account keeps its key and only its display handle moves', () => {
    const before = identityFromSignIn(GITHUB);
    const after = identityFromSignIn({
      ...GITHUB,
      profile: { ...GITHUB.profile, login: 'octocat-renamed' },
    });
    expect(after.key).toBe(before.key);
    expect(after.username).toBe('octocat-renamed');
  });

  it('keys a Google account by sub under its own prefix, with no username at all', () => {
    const identity = identityFromSignIn(GOOGLE);
    expect(identity).toEqual({
      key: 'google:110000000000000000001',
      provider: 'google',
    });
    expect(identity).not.toHaveProperty('username');
  });

  it('coerces a numeric providerAccountId to the string form', () => {
    expect(
      identityFromSignIn({
        account: { provider: 'github', providerAccountId: 583231 },
        profile: { login: 'octocat' },
      }).key,
    ).toBe('github:583231');
  });

  it('mints nothing when the account cannot be keyed', () => {
    expect(identityFromSignIn()).toBe(null);
    expect(identityFromSignIn({ profile: GITHUB.profile })).toBe(null);
    expect(
      identityFromSignIn({ account: { provider: 'github' }, profile: GITHUB.profile }),
    ).toBe(null);
    expect(
      identityFromSignIn({
        account: { provider: 'github', providerAccountId: '' },
        profile: GITHUB.profile,
      }),
    ).toBe(null);
  });
});

describe('viewerFromSession — a key or nothing', () => {
  it('reads the session identity', () => {
    expect(
      viewerFromSession({
        user: {
          key: 'github:583231',
          provider: 'github',
          username: 'octocat',
          name: 'The Octocat',
          image: 'https://avatars.example/583231',
        },
      }),
    ).toEqual({
      key: 'github:583231',
      provider: 'github',
      username: 'octocat',
      name: 'The Octocat',
      image: 'https://avatars.example/583231',
    });
  });

  it('a Google viewer has a key and no username', () => {
    const viewer = viewerFromSession({
      user: { key: 'google:42', provider: 'google', name: 'Gee' },
    });
    expect(viewer.key).toBe('google:42');
    expect(viewer.username).toBe(null);
    expect(viewer.image).toBe(null);
  });

  it('derives the provider from the key when the session lacks it', () => {
    expect(viewerFromSession({ user: { key: 'google:42' } }).provider).toBe('google');
  });

  it('is null for no session and for a session minted before keys existed', () => {
    expect(viewerFromSession(null)).toBe(null);
    expect(viewerFromSession({})).toBe(null);
    // A legacy JWT: username stamped, no key. Not an identity — signing in
    // again mints one.
    expect(
      viewerFromSession({ user: { username: 'octocat', provider: 'github' } }),
    ).toBe(null);
  });
});

describe('authorKey / ownsMessage — the stored key, never the login', () => {
  const viewer = { key: 'github:583231', username: 'octocat-renamed', provider: 'github' };

  it('owns by key whatever the login is now', () => {
    const author = { name: 'The Octocat', username: 'octocat', key: 'github:583231' };
    expect(authorKey(author)).toBe('github:583231');
    expect(ownsMessage(author, viewer)).toBe(true);
  });

  it("never owns by login — the old handle's new holder gets nothing", () => {
    const author = { name: 'The Octocat', username: 'octocat', key: 'github:583231' };
    const claimant = { key: 'github:999', username: 'octocat', provider: 'github' };
    expect(ownsMessage(author, claimant)).toBe(false);
    // Nor the other way round: same login, different account.
    expect(
      ownsMessage({ username: 'octocat-renamed', key: 'github:999' }, viewer),
    ).toBe(false);
  });

  it('is exact — provider ids have no case to fold', () => {
    expect(ownsMessage({ key: 'GITHUB:583231' }, viewer)).toBe(false);
  });

  it('reads a legacy Google row by its username, which was already the key', () => {
    const legacy = { name: 'Gee', username: 'google:42', provider: 'google' };
    expect(authorKey(legacy)).toBe('google:42');
    expect(ownsMessage(legacy, { key: 'google:42', provider: 'google' })).toBe(true);
  });

  it('a legacy GitHub row (login, no key) is owned by nobody — even the same login', () => {
    const legacy = { name: 'Old Timer', username: 'octocat' };
    expect(authorKey(legacy)).toBe(null);
    expect(ownsMessage(legacy, { key: 'github:583231', username: 'octocat' })).toBe(false);
  });

  it('an anonymous viewer owns nothing', () => {
    expect(ownsMessage({ key: 'github:583231' }, null)).toBe(false);
    expect(ownsMessage({ key: 'github:583231' }, {})).toBe(false);
    expect(ownsMessage(null, viewer)).toBe(false);
  });
});
