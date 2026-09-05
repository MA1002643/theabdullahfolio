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
// guestbook's per-user key is `key`, minted at sign-in from the OAuth
// account — `${account.provider}:${account.providerAccountId}` — and copied
// onto every session. It is the author identity, the rate-limit key, the
// reactions hash field and the admin check (GUESTBOOK_ADMIN holds the owner's
// key, never a login), and it never changes for the life of the account.
//   github → "github:<numeric user id>", with the login (`profile.login`)
//            carried BESIDE it as `username` — display data for the card's
//            @handle and profile link, never a key: logins are renameable,
//            and a released login can be claimed by someone else.
//   google → "google:<sub>", never displayed (cards show the person's name
//            instead); no username at all.
// The prefix keeps the two namespaces apart by construction — a Google sub
// can never spell a GitHub id, and ':' is illegal in a GitHub login.
//
// Where the key travels: the encrypted JWT cookie, every stored author, and
// the session object — which `auth()` hands the routes AND /api/auth/session
// hands the signed-in browser, so a person's own key does reach their own
// client, as their name and avatar do. No guestbook response carries any key
// (route.js strips it, the viewer's own included), and the wall's client code
// reads it for local purposes only — the write gate (viewerFromSession, the
// routes' own rule) and the composer's per-account draft slot
// (src/lib/guestbook/draftKey.js) — never to send it (sessionCallbacks.js).
//
// The callbacks that do this live in src/lib/guestbook/sessionCallbacks.js as
// pure functions, so what a sign-in writes to the JWT and what a session read
// copies from it are unit-tested without booting next-auth.
//
// Sessions minted before `key` existed carry a username and no key. They are
// not upgraded (an id is not recoverable from a login without a GitHub API
// call), so their writes answer 401 until the person signs in again — and the
// wall shows them the sign-in prompt in its re-auth voice instead of a
// composer (GuestbookWall gates on viewerFromSession, the routes' own rule).
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import {
  jwtCallback,
  sessionCallback,
} from '@/lib/guestbook/sessionCallbacks';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub, Google],
  callbacks: {
    jwt: jwtCallback,
    session: sessionCallback,
  },
});
