import { NextResponse } from 'next/server';
import {
  spotifyConfigured,
  demoEnabled,
  demoPayload,
  getAccessToken,
  extractArtwork,
  buildTrackPayload,
  fetchWithTimeout,
  NOW_PLAYING_ENDPOINT,
  RECENTLY_PLAYED_ENDPOINT,
} from '../_utils/spotify';

// "Now Playing" data endpoint for the floating widget (issue #42).
//
//   GET — returns the owner's currently-playing Spotify track, or the last one
//         played when nothing is live, shaped down to display-only fields plus
//         an album-derived accent colour and a blur placeholder. NEVER returns a
//         token or secret; every failure degrades to { isPlaying: false }.
//
// Node runtime: the shared lib uses `sharp` (album-art colour extraction) and
// `@upstash/redis`, neither of which run on the edge. `force-dynamic` keeps Next
// from statically caching the route at build; the explicit Cache-Control header
// below still governs the Vercel CDN edge cache — the same pattern the live
// /api/location route relies on.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Edge-cache the response so Spotify sees at most ~2 calls/min regardless of how
// many visitors are polling: served fresh for 30s, then stale-while-revalidate
// for 60s. The client re-anchors playback position from `progressMs` on every
// poll, so a cached-and-slightly-stale response still renders a correct LIVE
// progress bar (it advances locally from the anchor) — staleness costs nothing
// visible. The demo/empty responses reuse the same envelope.
const LIVE_CACHE = {
  'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
};
// Upstream-failure responses (502) must NOT be edge-cached — otherwise a single
// transient Spotify error would be served to everyone for 30s. `no-store` keeps
// each failure private and short-lived, and the non-2xx status makes the client
// preserve its previous track instead of blanking.
const ERROR_CACHE = { 'Cache-Control': 'no-store' };
const EMPTY = { isPlaying: false };

// Attach the album-derived accent + blur placeholder to a shaped track payload.
// Kept here (not in buildTrackPayload) so the pure shaper stays synchronous.
async function withArtwork(base, track, extra) {
  const { accent, blurDataURL } = await extractArtwork(track.albumArt);
  return { ...base, track, accent, blurDataURL, ...extra };
}

export async function GET() {
  // No credentials wired: show the demo track in dev / explicit demo mode, else
  // stay invisible. Never mints a fake "now playing" in production by accident.
  if (!spotifyConfigured) {
    const body = demoEnabled ? demoPayload() : EMPTY;
    return NextResponse.json(body, { headers: LIVE_CACHE });
  }

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      // Token refresh failed. In demo mode still showcase the demo; otherwise
      // this is an upstream/auth failure (502, uncached) so the client keeps
      // whatever it was showing rather than blanking on a transient hiccup.
      if (demoEnabled) {
        return NextResponse.json(demoPayload(), { headers: LIVE_CACHE });
      }
      return NextResponse.json(EMPTY, { status: 502, headers: ERROR_CACHE });
    }
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Tracks whether any player call returned a genuine upstream error status
    // (401/429/5xx) as opposed to a legitimate "nothing to show" (204 / empty
    // recent list). Only the former should signal a non-2xx to the client.
    let upstreamError = false;

    // 1) Currently playing. 200 = something is loaded in the player; 204 = the
    //    player is idle (a genuine "nothing playing"); anything else is an
    //    upstream failure. Timed so a stalled endpoint can't hang the function.
    const nowRes = await fetchWithTimeout(
      NOW_PLAYING_ENDPOINT,
      { headers: authHeader, cache: 'no-store' },
      5000,
    );

    if (nowRes.status === 200) {
      const data = await nowRes.json();
      // Only surface music tracks — ads and podcast episodes are filtered out so
      // the widget never shows a non-track "currently_playing_type". A non-track
      // isn't an error; fall through to recently-played.
      if (data?.currently_playing_type === 'track' && data.item) {
        const track = buildTrackPayload(data.item);
        if (track) {
          const payload = await withArtwork(
            { isPlaying: Boolean(data.is_playing) },
            track,
            {
              progressMs:
                typeof data.progress_ms === 'number' ? data.progress_ms : null,
              durationMs:
                typeof data.item.duration_ms === 'number'
                  ? data.item.duration_ms
                  : null,
              playedAt: null,
            },
          );
          return NextResponse.json(payload, { headers: LIVE_CACHE });
        }
      }
    } else if (nowRes.status !== 204) {
      upstreamError = true;
    }

    // 2) Nothing playing (or a non-track was loaded) — show the last track.
    const recentRes = await fetchWithTimeout(
      RECENTLY_PLAYED_ENDPOINT,
      { headers: authHeader, cache: 'no-store' },
      5000,
    );
    if (recentRes.status === 200) {
      const recent = await recentRes.json();
      const item = recent?.items?.[0];
      const track = buildTrackPayload(item?.track);
      if (track) {
        const payload = await withArtwork(
          { isPlaying: false },
          track,
          {
            progressMs: null,
            durationMs:
              typeof item.track?.duration_ms === 'number'
                ? item.track.duration_ms
                : null,
            playedAt: item.played_at || null,
          },
        );
        return NextResponse.json(payload, { headers: LIVE_CACHE });
      }
      // 200 with an empty history → genuinely nothing to show (not an error).
    } else {
      upstreamError = true;
    }

    // Nothing to show. A genuine empty state is a cacheable 200 (the widget
    // stays hidden); an upstream failure is an uncached 502 so the client keeps
    // its previous track instead of blanking mid-session.
    if (upstreamError) {
      return NextResponse.json(EMPTY, { status: 502, headers: ERROR_CACHE });
    }
    return NextResponse.json(EMPTY, { headers: LIVE_CACHE });
  } catch {
    // Timeout/abort or unexpected exception is an upstream failure: never cache
    // it, and signal non-2xx so the client preserves the previous track.
    return NextResponse.json(EMPTY, { status: 502, headers: ERROR_CACHE });
  }
}
