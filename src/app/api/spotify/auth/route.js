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
// This route HARD-REFUSES to run in production (returns 404), so it's safe to
// leave in the repo as reproducible setup documentation rather than deleting it.
// The redirect_uri is a FIXED literal (http://127.0.0.1:3000/api/spotify/auth),
// overridable via SPOTIFY_REDIRECT_URI — deliberately NOT derived from the
// request origin, which reports `localhost` in dev and makes Spotify reject the
// exchange (see the inline note at the redirectUri assignment for the full why).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Never expose the token-exchange helper on a production deployment.
  if (process.env.NODE_ENV === 'production') {
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

  const res = await fetch('https://accounts.spotify.com/api/token', {
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
  });

  const data = await res.json();
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
