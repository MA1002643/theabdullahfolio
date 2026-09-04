// Guestbook admin identity (issue #40). One place answers "is this viewer the
// wall's moderator?" for both halves of the delete story:
//   • the DELETE route's authority check (server, the real gate), and
//   • the Auth.js session callback, which stamps `session.user.isAdmin` so
//     the wall can SHOW the bin on every card for the owner. That flag is
//     display-only — a forged client value changes nothing server-side.
//
// GUESTBOOK_ADMIN (see .env.example) holds ONE of two forms, told apart by the
// ':' that is present in every identity key and illegal in a GitHub login:
//   • the owner's GitHub login — compared case-insensitively with the viewer's
//     `username`, because GitHub logins are; or
//   • the owner's identity key, `github:<account id>` (identity.js) — compared
//     exactly with the viewer's `key`. The rename-proof form: a login can be
//     renamed and the old name claimed by someone else, who would then pass
//     the login comparison until the variable was updated; an account id
//     cannot be. With this form set, the login is never consulted.
// Google identities ("google:<sub>") never match a login-form admin — the
// digits of a sub never case-fold into one.

export function isAdminUsername(username) {
  const admin = process.env.GUESTBOOK_ADMIN;
  return Boolean(
    admin && username && username.toLowerCase() === admin.toLowerCase(),
  );
}

export function isAdminKey(key) {
  const admin = process.env.GUESTBOOK_ADMIN;
  return Boolean(admin && key && admin === key);
}

// `identity` is the viewer shape identity.js builds ({ key, username }); the
// session callback passes the JWT's fields in the same shape.
export function isAdminIdentity(identity) {
  const admin = process.env.GUESTBOOK_ADMIN;
  if (!admin) return false;
  return admin.includes(':')
    ? isAdminKey(identity?.key)
    : isAdminUsername(identity?.username);
}
