// Live-location backing for the footer's availability line (issue #30).
//
// A tracker app on the owner's phone POSTs GPS fixes to /api/location; this
// module turns coordinates into a { town, IANA timezone } pair, persists the
// latest fix in Upstash KV, and — on read — applies a freshness guard so a
// tracker that's been off for a while quietly falls back to the home city
// rather than stranding the footer on a stale/wrong town.
//
// Privacy: only TOWN-LEVEL data is ever exposed to visitors (see the read
// route). Raw coordinates are rounded before storage and never returned.

import { Redis } from '@upstash/redis';
import tzLookup from 'tz-lookup';

// Single KV key holding the latest fix. Namespaced so it never collides with
// the work-status / other portfolio keys.
export const LOCATION_KEY = 'footer:live-location';

// Home fallback — shown whenever there is no fix, the fix is stale, geocoding
// failed, or KV isn't configured, so the footer always has a sane answer. Kept
// in sync with `availability` in src/components/footer/footer-data.js.
export const HOME_LOCATION = {
  town: 'Bolton',
  region: 'England',
  country: 'United Kingdom',
  tz: 'Europe/London',
};

// How long a GPS fix is trusted. After this we assume the tracker is off (or
// the owner is asleep / out of signal) and fall back to home, so the footer
// never claims a town the owner left hours ago. 12h is a travel-friendly
// balance: it survives an overnight stationary gap (when low-power trackers go
// quiet) without risking a very stale city if the tracker actually dies.
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

// KV client — mirrors the instantiation in src/app/api/send-mail/route.js so
// the whole app talks to Upstash the same way. Null (and every call a graceful
// no-op) when the env isn't present, e.g. a preview without KV linked.
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;
export const kvConfigured = Boolean(redis);

// Pull a {lat, lon} out of whatever the owner's tracker sends, so they can wire
// up whatever they already use without a custom payload:
//   • OwnTracks  → { _type: 'location', lat, lon, tst, ... }
//   • Overland   → { locations: [{ geometry: { coordinates: [lon, lat] } }] }
//   • iOS Shortcut / curl → { lat, lng } or { latitude, longitude }
// Returns null for anything without a valid, in-range coordinate pair.
export function parseCoords(body) {
  if (!body || typeof body !== 'object') return null;

  let lat;
  let lon;
  if (Array.isArray(body.locations) && body.locations.length) {
    // GeoJSON-style: newest fix last, coordinates ordered [lon, lat].
    const coords = body.locations[body.locations.length - 1]?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      lon = Number(coords[0]);
      lat = Number(coords[1]);
    }
  } else {
    lat = Number(body.lat ?? body.latitude);
    lon = Number(body.lon ?? body.lng ?? body.longitude);
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

// IANA timezone from coordinates, computed OFFLINE (no per-request API call) so
// the footer clock is always right even if the geocoder is down.
export function timeZoneFor(lat, lon) {
  try {
    return tzLookup(lat, lon);
  } catch {
    return null;
  }
}

// Last-ditch town from an IANA zone ("Asia/Karachi" -> "Karachi") when
// reverse-geocoding is unavailable. Coarse, but better than showing nothing.
export function townFromTimeZone(tz) {
  if (typeof tz !== 'string') return null;
  const leaf = tz.split('/').pop() || '';
  const cleaned = leaf.replace(/_/g, ' ').trim();
  return cleaned || null;
}

// Reverse-geocode coordinates to a town, server-side and keyless. BigDataCloud's
// client endpoint works fine at this (personal-tracker) volume. Prefer the most
// specific name: `locality` is the actual town ("Bolton"), where `city` is often
// the wider metro ("Manchester"). Timed so a slow geocoder can't hang ingest; on
// any failure returns null and the caller falls back to the tz-derived name.
export async function reverseGeocode(lat, lon) {
  const url =
    'https://api.bigdatacloud.net/data/reverse-geocode-client' +
    `?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const d = await res.json();
    const town = d.locality || d.city || d.principalSubdivision || null;
    if (!town) return null;
    return {
      town,
      region: d.principalSubdivision || null,
      country: d.countryName || null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function readLocation() {
  if (!redis) return null;
  try {
    // @upstash/redis auto-deserialises the JSON it stored.
    return await redis.get(LOCATION_KEY);
  } catch {
    return null;
  }
}

export async function writeLocation(record) {
  if (!redis) return false;
  try {
    // Self-expire well after the stale window so an abandoned key doesn't
    // linger forever, while a normally-updating tracker keeps refreshing it.
    await redis.set(LOCATION_KEY, record, {
      ex: Math.ceil((STALE_AFTER_MS * 2) / 1000),
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearLocation() {
  if (!redis) return false;
  try {
    await redis.del(LOCATION_KEY);
    return true;
  } catch {
    return false;
  }
}

// Given the stored record, decide what the footer should actually show: the
// live town when the fix is fresh, otherwise home. Coordinates are never part
// of the returned shape.
export function effectiveLocation(record, now = Date.now()) {
  const fresh =
    record &&
    typeof record.town === 'string' &&
    typeof record.tz === 'string' &&
    typeof record.updatedAt === 'number' &&
    now - record.updatedAt <= STALE_AFTER_MS;

  if (fresh) {
    return { town: record.town, tz: record.tz, live: true };
  }
  return { town: HOME_LOCATION.town, tz: HOME_LOCATION.tz, live: false };
}
