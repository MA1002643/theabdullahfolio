// The Auth.js callbacks src/auth.js wires into NextAuth — pure functions over
// the shapes Auth.js passes, kept out of auth.js so they can be unit-tested
// without booting next-auth: what a sign-in writes to the JWT, and what every
// session read copies from it.
import { isAdminIdentity } from './admin';
import { identityFromSignIn } from './identity';

// `account` and the raw OAuth `profile` exist only on the initial sign-in
// callback — persist identity into the JWT then, and copy it onto every
// session after. It must come from this flow and never from a request body.
export function jwtCallback({ token, account, profile }) {
  if (account) {
    const identity = identityFromSignIn({ account, profile });
    if (identity) {
      token.key = identity.key;
      token.provider = identity.provider;
      // The display handle: present for GitHub, absent for Google — cleared
      // rather than left over, so a token never carries a stale one.
      if (identity.username) token.username = identity.username;
      else delete token.username;
    }
  }
  return token;
}

// A token without a key (minted before keys existed) stamps nothing: the
// session stays a plain signed-in shell whose writes answer 401 until the
// person signs in again (identity.js).
//
// The session object built here is served in two directions: `auth()` hands
// it to the routes, which derive identity from `user.key` through
// viewerFromSession(), and /api/auth/session hands it to the signed-in
// browser for SessionProvider. Auth.js gives the callback no way to tell the
// two apart, so the key goes to both — and that is acceptable because it is
// the person's OWN account id (a GitHub id is public on the GitHub API; a
// Google sub is their own app-scoped id), no other visitor's key is ever
// served (route.js strips every author's), and the wall's client code never
// reads `session.user.key`. Keeping the key out of the browser entirely would
// mean the routes decoding the JWT cookie themselves (getToken + cookie
// naming + secret handling): a second identity path with nothing to protect.
export function sessionCallback({ session, token }) {
  if (session.user && token.key) {
    session.user.key = token.key;
    session.user.provider = token.provider;
    if (token.username) session.user.username = token.username;
    // Derived HERE (server-side, from the JWT identity + env) rather than
    // stored in the token: rotating GUESTBOOK_ADMIN takes effect on the next
    // session read instead of surviving inside old JWTs. The flag is
    // presentation-only — the DELETE route re-derives authority itself. Keyed
    // on the identity key alone (admin.js): the login never grants it.
    session.user.isAdmin = isAdminIdentity({ key: token.key });
  }
  return session;
}
