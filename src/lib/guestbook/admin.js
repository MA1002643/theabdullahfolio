// Guestbook admin identity (issue #40). One place answers "is this viewer the
// wall's moderator?" for both halves of the delete story:
//   • the DELETE route's authority check (server, the real gate), and
//   • the Auth.js session callback, which stamps `session.user.isAdmin` so
//     the wall can SHOW the bin on every card for the owner. That flag is
//     display-only — a forged client value changes nothing server-side.
//
// GUESTBOOK_ADMIN (see .env.example) must hold the owner's IDENTITY KEY —
// `github:<providerAccountId>`, the numeric GitHub user id under its provider
// prefix (identity.js) — and is compared exactly with the viewer's `key`. It
// is never a login: a GitHub login can be renamed and the released name
// claimed by another account, which would then hold delete-any authority
// until the variable was updated. The account id cannot be taken over, which
// is the whole point of keying the wall by it. A value without the key's ':'
// is a misconfiguration (the pre-key login form): nobody becomes the
// moderator, and the process logs once, naming the fix — failing closed and
// visibly while the wall itself keeps serving.

let warnedLoginForm = false;

export function isAdminIdentity(identity) {
  const admin = (process.env.GUESTBOOK_ADMIN ?? '').trim();
  if (!admin) return false;
  if (!admin.includes(':')) {
    if (!warnedLoginForm) {
      warnedLoginForm = true;
      console.warn(
        '[guestbook] GUESTBOOK_ADMIN holds a login, not an identity key — ' +
          'moderation is OFF. Set it to github:<your numeric GitHub user id> ' +
          '(https://api.github.com/users/<login> shows the id).',
      );
    }
    return false;
  }
  return typeof identity?.key === 'string' && identity.key === admin;
}
