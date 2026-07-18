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
  roundCoord,
} from '@/utils/liveLocation';

// Live-location endpoint for the footer availability line (issue #30).
//
//   POST — ingest a GPS fix from the owner's phone tracker (OwnTracks / Overland
//          / an iOS Shortcut). Header trackers authenticate with
//          LOCATION_INGEST_TOKEN (Bearer/Basic); URL-only trackers (Overland)
//          use the separate LOCATION_INGEST_QUERY_TOKEN via `?token=` so the
//          log-exposed query secret is isolated from the header write token.
//          Derives the timezone offline, reverse-geocodes to a town, and stores
//          the latest fix in Upstash KV.
//   GET  — public read for the footer. Returns ONLY { town, tz, live } — never
//          coordinates — with the freshness guard applied so a stale fix falls
//          back to the home city.
//
// Node runtime (tz-lookup ships data; the auth helper uses node:crypto) and
// never cached at the framework level — this is live state.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Primary write secret, presented via an Authorization header (Bearer or Basic).
const INGEST_TOKEN = process.env.LOCATION_INGEST_TOKEN;
// A SEPARATE secret for the `?token=` query path. Overland (and other URL-only
// trackers) can't send headers, so they must put the token in the URL — where
// it inevitably lands in proxy / platform / analytics logs. Giving that path its
// own credential means the value exposed in URLs is NOT the primary write token:
// it's rotatable on its own, and a leak from a log can't be replayed against the
// header path. Leave it unset to disable URL-based ingestion entirely.
const QUERY_TOKEN = process.env.LOCATION_INGEST_QUERY_TOKEN;
const NO_STORE = { 'Cache-Control': 'no-store' };

// Pull a token out of an Authorization header — Bearer (Shortcuts / curl) or
// HTTP Basic where the password carries the token (OwnTracks' built-in auth).
// Returns '' when neither scheme is present.
function headerToken(request) {
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

// Authorize a write. The two entry points are checked against DIFFERENT secrets:
// a `?token=` query param against QUERY_TOKEN (the log-exposed, independently-
// rotatable credential), and an Authorization header against the primary
// INGEST_TOKEN. Each path fails closed when its own secret isn't configured, and
// both reuse the constant-time compare in _utils/cronAuth so there's a single
// vetted comparison path.
//
// A tracker normally presents exactly ONE of the two, but a mixed-client / debug
// setup can send both. So each token is an INDEPENDENT sufficient credential: we
// try the query token first and, if it doesn't authorize (absent, empty, or
// wrong), FALL BACK to the header — a valid header still authorizes even when a
// stale/blank query token rides along, instead of the query check masking it.
// Neither fallback relaxes a secret: an invalid token never passes its compare.
function isAuthorized(request) {
  const fromQuery = new URL(request.url).searchParams.get('token');
  if (fromQuery && Boolean(QUERY_TOKEN) && safeBearerEqual(`Bearer ${fromQuery}`, QUERY_TOKEN)) {
    return true;
  }
  const fromHeader = headerToken(request);
  if (fromHeader && Boolean(INGEST_TOKEN) && safeBearerEqual(`Bearer ${fromHeader}`, INGEST_TOKEN)) {
    return true;
  }
  return false;
}

export async function POST(request) {
  // Fail closed if neither credential is configured — never accept anonymous
  // writes. (isAuthorized also rejects per-path when a given secret is unset.)
  if (!INGEST_TOKEN && !QUERY_TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'location ingest not configured' },
      { status: 503, headers: NO_STORE },
    );
  }
  if (!isAuthorized(request)) {
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
    // Rounded to the ~1km privacy floor — stored for possible future use, never
    // returned. Same helper the geocoder request uses, so the two never drift.
    lat: roundCoord(coords.lat),
    lng: roundCoord(coords.lon),
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
