import { NextResponse } from 'next/server';

// ONE-TIME SETUP HELPER (issue #42, §4C) — DEV ONLY.
//
// Exchanges the `code` Spotify redirects back with (after you approve the
// scopes) for a long-lived REFRESH TOKEN, which you copy into .env.local as
// SPOTIFY_REFRESH_TOKEN. You only ever run this once.
//
// How to use (with SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET already in
// .env.local and http://127.0.0.1:3000/api/spotify/auth registered as a Redirect
// URI in your Spotify app):
//
//   1. Visit (one line, replace YOUR_CLIENT_ID):
//      https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://127.0.0.1:3000/api/spotify/auth&scope=user-read-currently-playing%20user-read-recently-played
//   2. Approve — Spotify redirects here with ?code=...
//   3. Copy the `refresh_token` from the JSON response into .env.local
//   4. Restart the dev server. You're done.
//
// This route HARD-REFUSES to run in production AND, in any other build, serves
// ONLY loopback hosts (404 everywhere else — see the GET guard), so it's safe to
// leave in the repo as reproducible setup documentation rather than deleting it.
// The redirect_uri is a FIXED literal (http://127.0.0.1:3000/api/spotify/auth),
// overridable via SPOTIFY_REDIRECT_URI — deliberately NOT derived from the
// request origin, which reports `localhost` in dev and makes Spotify reject the
// exchange (see the inline note at the redirectUri assignment for the full why).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Extract the bare hostname from a Host header, dropping any :port. Bracketed
// IPv6 literals (`[::1]:3000`) can't use a naive `split(':')` — the colons in
// the address itself would shred it — so unwrap the brackets first. Everything
// else (`127.0.0.1:3000`, `localhost:3000`, or a bare host) strips at the first
// colon, which is the single :port separator.
function loopbackHostname(hostHeader) {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end === -1 ? h.slice(1) : h.slice(1, end);
  }
  return h.split(':')[0];
}

export async function GET(request) {
  // This helper mints a LONG-LIVED refresh token, so it must be unreachable on
  // any deployed/public host — not merely on "production" builds. Layered guard:
  //   1. Hard 404 whenever NODE_ENV=production — covers every Vercel deployment
  //      (prod AND preview both build as production).
  //   2. Otherwise require a LOOPBACK Host (127.0.0.1 / localhost / ::1), so a
  //      staging/demo box that accidentally runs `next dev` on a public URL — or
  //      a drive-by scanner hitting /api/spotify/auth — still gets a 404 rather
  //      than a working token-exchange endpoint.
  // Escape hatch: SPOTIFY_AUTH_ALLOW_REMOTE=true permits a non-loopback dev host
  // (LAN IP, cloud dev box). The Host header is client-controlled, so the
  // loopback check is defence-in-depth against ACCIDENTAL exposure, not a hard
  // authz boundary — but the minted token is only ever for the account that
  // authorises, at read-only scopes, so the residual blast radius is low.
  // Normalise the Host to a bare hostname (see loopbackHostname): strip the
  // :port and unwrap bracketed IPv6 so `[::1]:3000` resolves to `::1` instead
  // of being shredded by a naive `split(':')`. A browser sends the Host exactly
  // as typed (not the resolved IP), so 127.0.0.1, localhost and ::1 are the
  // loopback values that actually arise here.
  const host = loopbackHostname(request.headers.get('host') || '');
  const isLoopback =
    host === '127.0.0.1' || host === 'localhost' || host === '::1';
  const allowRemote = process.env.SPOTIFY_AUTH_ALLOW_REMOTE === 'true';

  if (process.env.NODE_ENV === 'production' || (!isLoopback && !allowRemote)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) {
    return NextResponse.json(
      {
        error: 'No code provided',
        hint: 'Start the flow from the authorize URL in this file\'s header comment.',
      },
      { status: 400 },
    );
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET missing from .env.local' },
      { status: 500 },
    );
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  // Must byte-for-byte match the redirect_uri used in the authorize step AND
  // registered in the Spotify dashboard. Deriving it from `request.url` is NOT
  // safe: Next's dev server reports the host as `localhost` even when the
  // browser hit `127.0.0.1`, so the token exchange sent `localhost` and Spotify
  // rejected it (invalid_grant / "Invalid redirect URI"). Use the exact literal
  // Spotify requires for loopback dev; override via SPOTIFY_REDIRECT_URI only if
  // your dev host/port differs.
  const redirectUri =
    process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/api/spotify/auth';

  // The token exchange is a live network call to Spotify: it can reject (DNS /
  // socket failure, or the AbortSignal.timeout below firing) and its body can
  // fail to parse (a proxy or outage returning HTML or an empty payload). This
  // is a one-time setup helper, so every failure should degrade to a readable
  // 502 JSON error rather than bubbling an unhandled exception that Next
  // surfaces as an opaque 500.
  let res;
  try {
    res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      cache: 'no-store',
      // WHATWG fetch has no default timeout — bound it so an unreachable Spotify
      // returns a clear error instead of hanging the setup flow indefinitely.
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    // AbortSignal.timeout rejects with a DOMException named 'TimeoutError';
    // anything else here is a transport-level failure.
    const timedOut = err?.name === 'TimeoutError';
    return NextResponse.json(
      {
        error: 'Could not reach Spotify to exchange the code',
        reason: timedOut
          ? 'Request timed out after 10s'
          : err?.message || 'Network error',
      },
      { status: 502 },
    );
  }

  // A successful HTTP round-trip can still carry a non-JSON body — parse
  // defensively so that too degrades to a 502 rather than throwing.
  let data;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json(
      { error: 'Spotify returned a non-JSON response', status: res.status },
      { status: 502 },
    );
  }

  if (!res.ok || !data.refresh_token) {
    return NextResponse.json(
      { error: 'Token exchange failed', details: data },
      { status: 502 },
    );
  }

  return NextResponse.json({
    refresh_token: data.refresh_token,
    message:
      'Copy this refresh_token into .env.local as SPOTIFY_REFRESH_TOKEN, then restart the dev server. This route 404s in production.',
  });
}
