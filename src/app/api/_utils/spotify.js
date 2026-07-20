// Server-side Spotify helpers for the "Now Playing" widget (issue #42).
//
// SERVER ONLY. This module imports `sharp` and `@upstash/redis` and touches the
// SPOTIFY_* secrets — it must never be imported by a client component. Its sole
// consumer is the /api/spotify route handler (and the dev-only auth helper).
//
// What lives here, and why it's here rather than inline in the route:
//   • getAccessToken()   — refresh-token → access-token exchange, with the
//                          access token cached in Upstash KV for its lifetime so
//                          we don't re-hit the token endpoint on every poll.
//   • extractArtwork()   — pulls a tasteful accent colour AND a tiny blur
//                          placeholder out of the album art with `sharp`, in one
//                          fetch, per-album-cached in KV (album art never changes
//                          colour, so this is computed at most once per album).
//   • clampAccent()      — the taste guardrail: whatever colour an album yields,
//                          it's pushed into a legible, premium HSL band so the
//                          widget never recolours to something muddy or garish.
//   • buildTrackPayload  — normalises a Spotify track object into the compact
//                          display shape the client consumes.
//   • demoPayload()      — a curated sample track so the widget showcases in dev
//                          (and in an explicit demo mode) when no creds are set.
//
// Every external call is timed and every failure degrades to a sane default —
// the widget's contract is "never throw, just show less", mirroring the
// graceful-degradation posture of src/utils/liveLocation.js.

import { Redis } from '@upstash/redis';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
export const NOW_PLAYING_ENDPOINT =
  'https://api.spotify.com/v1/me/player/currently-playing';
export const RECENTLY_PLAYED_ENDPOINT =
  'https://api.spotify.com/v1/me/player/recently-played?limit=1';

// True only when the three server secrets are all present. When false the route
// short-circuits to demo/empty rather than making doomed token calls.
export const spotifyConfigured = Boolean(
  CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN,
);

// Demo mode: show the sample track when creds are absent. On in every non-prod
// build so the widget is visible during local development, or in prod only when
// SPOTIFY_DEMO is explicitly "true" (e.g. a deploy preview showing off the UI
// before the owner wires their own account). Never fabricates a "now playing"
// state in production by accident.
export const demoEnabled =
  process.env.NODE_ENV !== 'production' || process.env.SPOTIFY_DEMO === 'true';

// The site's warm ember, slightly de-saturated — the resting accent used when
// no album colour is available (demo, extraction failure, KV-less preview). It
// already sits inside the clamp band below, so the widget looks intentional even
// with zero external data.
export const DEFAULT_ACCENT = '#e6a34d';

// ── Upstash KV (optional) ───────────────────────────────────────────────────
// Same instantiation as src/utils/liveLocation.js so the whole app talks to
// Upstash identically. Null — and every helper a graceful no-op — when the env
// isn't present (a preview without KV linked). KV is a pure optimisation here:
// it caches the access token and per-album artwork derivations. Everything still
// works without it, just with a few more upstream calls.
const redisUrl =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis =
  redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

const TOKEN_KEY = 'spotify:access-token';
const ACCENT_KEY_PREFIX = 'spotify:artwork:';

// A short, stable key for an album-art URL so per-album derivations can be
// cached without storing the (long, query-laden) CDN URL as the key. Spotify art
// URLs end in the image's content hash, so the last path segment is already a
// stable identity for the image.
function artworkKey(url) {
  const id = String(url).split('/').pop() || String(url);
  return ACCENT_KEY_PREFIX + id;
}

// fetch with a hard timeout so a slow upstream can never hang a poll. Mirrors the
// AbortController pattern in liveLocation.reverseGeocode. Exported so the route's
// player-API calls share the same timed-fetch guarantee as the token/artwork
// calls (an aborted fetch throws → the route's catch degrades it to a 502).
export async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Access token ────────────────────────────────────────────────────────────
// Exchange the long-lived refresh token for a short-lived access token. The
// result is cached in KV for (expires_in − 60s) so a burst of polls reuses one
// token instead of hammering the token endpoint. Returns null on any failure so
// the caller degrades gracefully.
export async function getAccessToken() {
  if (!spotifyConfigured) return null;

  if (redis) {
    try {
      const cached = await redis.get(TOKEN_KEY);
      if (typeof cached === 'string' && cached) return cached;
    } catch {
      // KV read failed — fall through and mint a fresh token.
    }
  }

  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  let data;
  try {
    const res = await fetchWithTimeout(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: REFRESH_TOKEN,
      }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    return null;
  }

  const token = data?.access_token;
  if (typeof token !== 'string' || !token) return null;

  if (redis) {
    // Expire a minute before Spotify does, so we never hand out a token that
    // dies mid-flight. `expires_in` is seconds (typically 3600).
    const ttl = Math.max(30, Math.floor(Number(data.expires_in || 3600)) - 60);
    try {
      await redis.set(TOKEN_KEY, token, { ex: ttl });
    } catch {
      // Non-fatal: caching is best-effort.
    }
  }
  return token;
}

// ── Colour maths ────────────────────────────────────────────────────────────
// sRGB byte → HSL and back. Kept dependency-free (no colour library) because the
// only transform we need is the clamp below.
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToHex(h, s, l) {
  let r;
  let g;
  let b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v) =>
    Math.round(Math.min(255, Math.max(0, v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// THE TASTE GUARDRAIL. An album can be pitch black, blinding white, or neon
// magenta — none of which read as a premium accent on a near-black UI. So the
// extracted colour keeps only its HUE; saturation and lightness are forced into
// a mid-bright, mid-saturated band that always looks intentional against the
// rgb(27 27 27) background and stays legible for small text / a 2px ring.
export function clampAccent(r, g, b) {
  let [h, s, l] = rgbToHsl(r, g, b);
  // A near-greyscale album (s≈0) would clamp to an arbitrary hue; nudge it warm
  // so it lands on-brand rather than on a random cold cast.
  if (s < 0.08) {
    h = 32 / 360; // warm amber, the site's ember family
    s = 0.45;
  }
  s = Math.min(0.72, Math.max(0.4, s));
  l = Math.min(0.7, Math.max(0.52, l));
  return hslToHex(h, s, l);
}

// ── Artwork derivation ──────────────────────────────────────────────────────
// Fetch the album art ONCE and derive, in a single sharp pass:
//   • accent      — the clamped dominant colour (drives the widget's theme)
//   • blurDataURL — a 16px webp data URI for next/image's blur-up placeholder
// Result is cached in KV keyed by the image's content hash, so a given album is
// only ever processed once regardless of how many times it plays.
export async function extractArtwork(url) {
  const fallback = { accent: DEFAULT_ACCENT, blurDataURL: null };
  if (!url) return fallback;

  const key = artworkKey(url);
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached && typeof cached.accent === 'string') return cached;
    } catch {
      // fall through to recompute
    }
  }

  let buffer;
  try {
    const res = await fetchWithTimeout(url, { cache: 'no-store' }, 4000);
    if (!res.ok) return fallback;
    buffer = Buffer.from(await res.arrayBuffer());
  } catch {
    return fallback;
  }

  let result = fallback;
  try {
    // `sharp` is only required here, deep on the server, so it never risks being
    // pulled into a client bundle. Dynamic import keeps it out of module-eval
    // for requests that don't reach artwork extraction (demo mode, no track).
    const sharp = (await import('sharp')).default;
    const [{ dominant }, blur] = await Promise.all([
      sharp(buffer).stats(),
      sharp(buffer)
        .resize(16, 16, { fit: 'cover' })
        .webp({ quality: 40 })
        .toBuffer(),
    ]);
    result = {
      accent: clampAccent(dominant.r, dominant.g, dominant.b),
      blurDataURL: `data:image/webp;base64,${blur.toString('base64')}`,
    };
  } catch {
    return fallback;
  }

  if (redis) {
    try {
      // Album art (and thus its colour) is immutable, but cap the key's life at
      // 30 days so an unlisted album eventually ages out of the store.
      await redis.set(key, result, { ex: 30 * 24 * 60 * 60 });
    } catch {
      // best-effort
    }
  }
  return result;
}

// ── Payload shaping ─────────────────────────────────────────────────────────
// Prefer Spotify's 64px thumbnail (images[2]); fall back to the largest if a
// release only ships one size. Returns null when there's no usable art.
function pickAlbumArt(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  return images[2]?.url || images[images.length - 1]?.url || images[0]?.url || null;
}

// Normalise a Spotify `track` object (from either currently-playing.item or a
// recently-played item's `.track`) into the compact display shape the client
// renders. Colour + blur are attached separately by the route after the async
// extractArtwork call, so this stays synchronous and pure.
export function buildTrackPayload(track) {
  if (!track || typeof track !== 'object') return null;
  const albumArt = pickAlbumArt(track.album?.images);
  return {
    id: track.id || track.uri || track.name || 'unknown',
    title: track.name || 'Unknown track',
    artist:
      Array.isArray(track.artists) && track.artists.length
        ? track.artists.map((a) => a.name).filter(Boolean).join(', ')
        : 'Unknown artist',
    album: track.album?.name || '',
    albumArt,
    trackUrl: track.external_urls?.spotify || null,
  };
}

// ── Demo track ──────────────────────────────────────────────────────────────
// A curated, clearly-synthetic sample so the widget renders (as a dimmed
// "last played" card) during local development with no Spotify account wired.
// Uses a bundled SVG cover so it works fully offline, and a pre-picked accent so
// no sharp/network round-trip is needed. Never served in production unless
// SPOTIFY_DEMO is explicitly enabled.
export function demoPayload() {
  return {
    isPlaying: false,
    demo: true,
    track: {
      id: 'demo-aurora',
      title: 'Aurora (Interlude)',
      artist: 'Sample Artist',
      album: 'Portfolio Demo',
      albumArt: '/spotify/demo-cover.svg',
      trackUrl: 'https://open.spotify.com/',
    },
    progressMs: null,
    durationMs: 214000,
    playedAt: null,
    accent: DEFAULT_ACCENT,
    blurDataURL: null,
  };
}
