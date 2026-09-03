// Guestbook admin identity (issue #40). One place answers "is this username
// the wall's moderator?" for both halves of the delete story:
//   • the DELETE route's authority check (server, the real gate), and
//   • the Auth.js session callback, which stamps `session.user.isAdmin` so
//     the wall can SHOW the bin on every card for the owner. That flag is
//     display-only — a forged client value changes nothing server-side.
//
// GUESTBOOK_ADMIN holds the owner's GitHub login (see .env.example). The
// comparison is case-insensitive because GitHub logins are; Google identities
// ("google:<sub>") can never collide with it — ':' is illegal in a GitHub
// login, and the digits of a sub never case-fold into one.

export function isAdminUsername(username) {
  const admin = process.env.GUESTBOOK_ADMIN;
  return Boolean(
    admin && username && username.toLowerCase() === admin.toLowerCase(),
  );
}
