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
// Identity model: `username` is the guestbook's stable per-user key (author
// identity, rate-limit key, reactions hash field, admin check).
//   github → the public login, e.g. "MA1002643" (also displayable/linkable)
//   google → "google:<sub>" — Google's stable account id under a provider
//            prefix, INTERNAL ONLY (cards display the person's name instead).
// The prefix guarantees the two namespaces can never collide: ':' is illegal
// in a GitHub login, so a Google user can never shadow a GitHub identity —
// including GUESTBOOK_ADMIN's.
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { isAdminUsername } from '@/lib/guestbook/admin';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub, Google],
  callbacks: {
    // `account` and the raw OAuth `profile` exist only on the initial
    // sign-in callback — persist identity into the JWT then, and copy it
    // onto every session after. It must come from this flow and never from
    // a request body.
    jwt({ token, account, profile }) {
      if (account && profile) {
        if (account.provider === 'github' && profile.login) {
          token.username = profile.login;
          token.provider = 'github';
        } else if (account.provider === 'google' && profile.sub) {
          token.username = `google:${profile.sub}`;
          token.provider = 'google';
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.username) {
        session.user.username = token.username;
        session.user.provider = token.provider;
        // Derived HERE (server-side, from the JWT identity + env) rather than
        // stored in the token: rotating GUESTBOOK_ADMIN takes effect on the
        // next session read instead of surviving inside old JWTs. The flag is
        // presentation-only — the DELETE route re-derives authority itself.
        session.user.isAdmin = isAdminUsername(token.username);
      }
      return session;
    },
  },
});
