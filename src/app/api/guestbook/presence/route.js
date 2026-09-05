// Guestbook presence endpoint (issue #40 Phase 4).
//   POST { id } → registers a heartbeat for that anonymous id and returns
//                 { count } — the poll and the register are one round-trip.
//                 Rate-limited per client IP (PRESENCE_BEATS_PER_MINUTE, see
//                 ratelimit.js) because every accepted id is a Redis write and
//                 the endpoint is deliberately unauthenticated. Over budget →
//                 429 + Retry-After and the id is NOT registered, so the count
//                 cannot be inflated past the budget per IP per minute.
//
// POST is the only method. There used to be a read-only GET → { count } as
// well, which nothing called (the client's heartbeat IS its read — the poll
// and the register are one round-trip) yet cost a Redis prune + count on
// every hit with no limiter in front of it: an unmetered path around the
// budget above (code review). It is gone rather than metered — a read
// nobody needs is not worth a second limiter key — and Next answers a
// method this file does not export with 405.
//
// The id is a client-generated random UUID that exists only to dedupe tabs —
// it is never linked to a session or an author, so presence stays anonymous
// by construction (the limiter keys on a hash of the IP, never the address).
// No auth: watching who's around is part of the read-only experience.
import { NextResponse } from 'next/server';
import { PRESENCE_ID_RE } from '@/lib/guestbook/anonId';
import { readJsonBody } from '@/lib/guestbook/body';
import { heartbeat } from '@/lib/guestbook/presence';
import { checkPresenceRateLimit } from '@/lib/guestbook/ratelimit';

export const dynamic = 'force-dynamic';

// The whole legitimate body is `{"id":"<8–64 chars>"}` — under 100 bytes. A
// kilobyte is the abuse boundary (code review): anything larger is a 413
// before a byte of it is parsed, so an unauthenticated caller cannot have
// near-platform-limit payloads buffered and parsed on every request while
// "validate first, meter second" keeps them out of any limiter bucket. Under
// the ceiling a malformed body still spends no budget — that property is
// deliberate (see below) — and costs no more than any request does.
export const PRESENCE_BODY_MAX_BYTES = 1024;

// Vercel sets both x-real-ip and x-forwarded-for to the connecting client and
// overwrites any inbound value, so neither is spoofable there. With no proxy
// at all (local dev) both are absent and every tab shares one bucket.
function clientIp(request) {
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || 'unknown';
}

export async function POST(request) {
  // Ceiling before parsing (body.js): over it → 413, never read past the
  // limit; not JSON → 400, as ever.
  const read = await readJsonBody(request, { maxBytes: PRESENCE_BODY_MAX_BYTES });
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const { body } = read;
  // PRESENCE_ID_RE is shared with the client that mints ids (anonId.js), so a
  // fallback id minted over plain http can never be one the server rejects.
  if (typeof body?.id !== 'string' || !PRESENCE_ID_RE.test(body.id)) {
    return NextResponse.json({ error: 'Invalid presence id' }, { status: 400 });
  }
  // Validate first, meter second: a malformed flood costs no Redis and no
  // budget; a well-formed one is metered before anything is written. The
  // byte ceiling above is what keeps "costs no budget" from meaning "costs
  // the server a full parse of anything": the unmetered path is bounded to
  // PRESENCE_BODY_MAX_BYTES per request. A pre-parse limiter would be worse
  // — a Redis round-trip per garbage request, and a flood could then spend
  // the budget of the real client behind the same IP.
  const limit = await checkPresenceRateLimit(clientIp(request));
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many presence heartbeats' },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      },
    );
  }
  return NextResponse.json(await heartbeat(body.id));
}
