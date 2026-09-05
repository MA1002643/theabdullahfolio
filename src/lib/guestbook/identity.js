// Guestbook identity (issue #40, code-review correction). ONE stable key per
// person, minted at sign-in from the OAuth `account` — never from a display
// field — and carried on the JWT, the session and every stored author:
//
//   key = `${account.provider}:${account.providerAccountId}`
//         github → "github:<numeric user id>"    google → "google:<sub>"
//
// The key is the only thing the guestbook COMPARES: the DELETE ownership
// check and `isOwn`, the posting and reaction limiters, and the field of each
// message's reactions hash. It never changes for the life of the account. A
// GitHub login (`profile.login`) does — accounts get renamed, and a released
// login can be claimed by someone else — so a login-keyed wall would, on a
// rename, take an author's messages, reaction choices and rate-limit slot away
// from them and hand them to whoever picks the old name up. The login is
// therefore DISPLAY DATA only: `username`, the card's @handle and profile
// link, present beside the key for GitHub authors and absent for Google ones
// (a sub is internal, and the card shows the person's name).
//
// Where a key travels, exactly: the encrypted JWT cookie; the stored author
// (server side, on every message); and the session object — the one
// `auth()` hands the routes, which is the same one /api/auth/session serves
// to the signed-in browser. So a person's OWN key reaches their own client,
// as their name and avatar do (a GitHub id is public on the GitHub API; a
// Google sub is the account's app-scoped id, the person's own). What never
// happens is anyone learning anyone ELSE's key: no guestbook response carries
// a key — route.js strips it from every author, the viewer's own included —
// and the wall's client code never reads `session.user.key`. The routes read
// it through viewerFromSession() below; that is its only consumer.
//
// The provider prefix keeps the namespaces apart by construction — a Google
// sub can never spell a GitHub id. It is also why the Google key is
// byte-identical to the `google:<sub>` username the wall stored before `key`
// existed: authorKey() reads that legacy form back as the key, so those rows
// stay owned. GitHub rows from before `key` were keyed by login and are owned
// by nobody until MIGRATED (the moderator can still remove them) — a
// deliberate cut, not a login fallback, which would re-open the hole for
// exactly the rows it covered. The repair is an operator-run migration
// (legacyIdentity.js, scripts/guestbook-migrate-identity.mjs) that backfills
// `key` from an authoritative login → account-id mapping — the operator's,
// or what the row itself recorded at write time — and folds the bare-login
// reaction fields of the same era under the key. A login on its own never
// becomes a key, there or here.

const nonEmptyString = (v) => typeof v === 'string' && v.length > 0;

// Sign-in time (the Auth.js `jwt` callback, the one place `account` exists).
// Answers the identity to persist, or null when the account cannot be keyed —
// then nothing is minted and the session stays write-incapable rather than
// falling back to a display field.
export function identityFromSignIn({ account, profile } = {}) {
  const provider = account?.provider;
  const id = account?.providerAccountId;
  if (!nonEmptyString(provider)) return null;
  if (id === undefined || id === null || id === '') return null;
  const identity = { key: `${provider}:${String(id)}`, provider };
  if (provider === 'github' && nonEmptyString(profile?.login)) {
    identity.username = profile.login;
  }
  return identity;
}

// Request time: the viewer behind a session, or null — for an anonymous
// request, or for a session minted before keys existed (a username and no
// key; signing in again mints one). Routes treat null as "no identity":
// reads stay public, writes answer 401.
export function viewerFromSession(session) {
  const user = session?.user;
  if (!nonEmptyString(user?.key)) return null;
  return {
    key: user.key,
    provider: nonEmptyString(user.provider)
      ? user.provider
      : user.key.split(':')[0],
    username: nonEmptyString(user.username) ? user.username : null,
    name: nonEmptyString(user.name) ? user.name : null,
    image: nonEmptyString(user.image) ? user.image : null,
  };
}

// The stable key of a STORED author, or null when the row has none: `key`
// when present, otherwise the legacy Google form, whose username WAS the key.
// A bare login is never a key.
export function authorKey(author) {
  if (nonEmptyString(author?.key)) return author.key;
  const legacy = author?.username;
  return nonEmptyString(legacy) && legacy.includes(':') ? legacy : null;
}

// Ownership: the one comparison behind DELETE and `isOwn`. Exact — keys are
// provider account ids, so there is no case to fold.
export function ownsMessage(author, viewer) {
  const key = authorKey(author);
  return key !== null && Boolean(viewer?.key) && key === viewer.key;
}
