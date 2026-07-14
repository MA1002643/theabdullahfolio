import { NextResponse } from 'next/server';
import { safeBearerEqual } from '../_utils/cronAuth';
import {
  parseCoords,
  timeZoneFor,
  reverseGeocode,
  townFromTimeZone,
  writeLocation,
  readLocation,
  effectiveLocation,
} from '@/utils/liveLocation';

// Live-location endpoint for the footer availability line (issue #30).
//
//   POST — ingest a GPS fix from the owner's phone tracker (OwnTracks / Overland
//          / an iOS Shortcut). Authenticated with LOCATION_INGEST_TOKEN; derives
//          the timezone offline, reverse-geocodes to a town, and stores the
//          latest fix in Upstash KV.
//   GET  — public read for the footer. Returns ONLY { town, tz, live } — never
//          coordinates — with the freshness guard applied so a stale fix falls
//          back to the home city.
//
// Node runtime (tz-lookup ships data; the auth helper uses node:crypto) and
// never cached at the framework level — this is live state.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INGEST_TOKEN = process.env.LOCATION_INGEST_TOKEN;
const NO_STORE = { 'Cache-Control': 'no-store' };

// The presented secret can arrive three ways so any tracker works: a
// `?token=` query param (OwnTracks/Overland can only customise the URL), a
// `Authorization: Bearer <token>` header (Shortcuts / curl), or HTTP Basic
// where the password carries the token (OwnTracks' built-in auth). We normalise
// all three to a "Bearer <token>" string and reuse the vetted constant-time
// compare in _utils/cronAuth so there's a single comparison path.
function presentedToken(request) {
  const fromQuery = new URL(request.url).searchParams.get('token');
  if (fromQuery) return fromQuery;

  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(auth.slice('Basic '.length), 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      return sep >= 0 ? decoded.slice(sep + 1) : decoded;
    } catch {
      return '';
    }
  }
  return '';
}

export async function POST(request) {
  // Fail closed if no token is configured — never accept anonymous writes.
  if (!INGEST_TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'location ingest not configured' },
      { status: 503, headers: NO_STORE },
    );
  }
  if (!safeBearerEqual(`Bearer ${presentedToken(request)}`, INGEST_TOKEN)) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: NO_STORE },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid json' },
      { status: 400, headers: NO_STORE },
    );
  }

  // OwnTracks emits non-location messages (transition, waypoint, ...) on the
  // same URL; acknowledge and ignore them so the app doesn't retry-storm.
  if (body && body._type && body._type !== 'location') {
    return NextResponse.json(
      { ok: true, ignored: body._type },
      { headers: NO_STORE },
    );
  }

  const coords = parseCoords(body);
  if (!coords) {
    return NextResponse.json(
      { ok: false, error: 'no valid coordinates' },
      { status: 400, headers: NO_STORE },
    );
  }

  // Timezone is the one thing we can't approximate — without it there's no local
  // clock to show — so a lookup failure is the only hard reject.
  const tz = timeZoneFor(coords.lat, coords.lon);
  if (!tz) {
    return NextResponse.json(
      { ok: false, error: 'could not resolve timezone' },
      { status: 422, headers: NO_STORE },
    );
  }

  const geo = await reverseGeocode(coords.lat, coords.lon);
  const town = geo?.town || townFromTimeZone(tz) || 'Unknown';

  const record = {
    town,
    region: geo?.region ?? null,
    country: geo?.country ?? null,
    tz,
    // Rounded to ~1km (2 dp) — stored for possible future use, never returned.
    lat: Math.round(coords.lat * 100) / 100,
    lng: Math.round(coords.lon * 100) / 100,
    updatedAt: Date.now(),
  };

  const stored = await writeLocation(record);
  if (!stored) {
    return NextResponse.json(
      { ok: false, error: 'storage unavailable' },
      { status: 503, headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: true, town, tz }, { headers: NO_STORE });
}

export async function GET() {
  const record = await readLocation();
  const eff = effectiveLocation(record, Date.now());
  return NextResponse.json(eff, {
    headers: {
      // Live-ish: a short shared cache shields KV from every page view without
      // making the footer feel stale (the town only changes when travelling).
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
