// Auth.js v5 configuration (issue #40). GitHub + Google OAuth, JWT sessions
// (no adapter/database — the guestbook only needs identity, not account
// storage).
//
// v5 pattern, NOT the v4 one: this module is the single source of truth,
// exporting { handlers, auth, signIn, signOut }; the route at
// app/api/auth/[...nextauth]/route.js just re-exports `handlers`, and server
// code checks identity with `await auth()` (getServerSession is v4 and gone).
//
// No credentials appear here on purpose: v5 infers them from the environment —
// AUTH_GITHUB_ID / AUTH_GITHUB_SECRET and AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
// for the providers, AUTH_SECRET for token encryption, and the host is
// trusted automatically on Vercel. Set those in .env.local / Vercel env (see
// .env.example); never inline a value.
//
// Identity model (src/lib/guestbook/identity.js has the full account): the
// guestbook's per-user key is `key`, minted here at sign-in from the OAuth
// account — `${account.provider}:${account.providerAccountId}` — and copied
// onto every session. It is the author identity, the rate-limit key, the
// reactions hash field and (in its key form) the admin check, and it never
// changes for the life of the account.
//   github → "github:<numeric user id>", with the login (`profile.login`)
//            carried BESIDE it as `username` — display data for the card's
//            @handle and profile link, never a key: logins are renameable,
//            and a released login can be claimed by someone else.
//   google → "google:<sub>", INTERNAL ONLY (cards display the person's name
//            instead); no username at all.
// The prefix keeps the two namespaces apart by construction — a Google sub
// can never spell a GitHub id, and ':' is illegal in a GitHub login.
//
// Sessions minted before `key` existed carry a username and no key. They are
// not upgraded (an id is not recoverable from a login without a GitHub API
// call), so their writes answer 401 until the person signs in again.
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { isAdminIdentity } from '@/lib/guestbook/admin';
import { identityFromSignIn } from '@/lib/guestbook/identity';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub, Google],
  callbacks: {
    // `account` and the raw OAuth `profile` exist only on the initial
    // sign-in callback — persist identity into the JWT then, and copy it
    // onto every session after. It must come from this flow and never from
    // a request body.
    jwt({ token, account, profile }) {
      if (account) {
        const identity = identityFromSignIn({ account, profile });
        if (identity) {
          token.key = identity.key;
          token.provider = identity.provider;
          // The display handle: present for GitHub, absent for Google —
          // cleared rather than left over, so a token never carries a stale
          // one.
          if (identity.username) token.username = identity.username;
          else delete token.username;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.key) {
        session.user.key = token.key;
        session.user.provider = token.provider;
        if (token.username) session.user.username = token.username;
        // Derived HERE (server-side, from the JWT identity + env) rather than
        // stored in the token: rotating GUESTBOOK_ADMIN takes effect on the
        // next session read instead of surviving inside old JWTs. The flag is
        // presentation-only — the DELETE route re-derives authority itself.
        session.user.isAdmin = isAdminIdentity({
          key: token.key,
          username: token.username,
        });
      }
      return session;
    },
  },
});
