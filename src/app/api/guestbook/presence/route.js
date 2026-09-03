// Guestbook presence endpoint (issue #40 Phase 4).
//   POST { id } → registers a heartbeat for that anonymous id and returns
//                 { count } — the poll and the register are one round-trip.
//                 Rate-limited per client IP (PRESENCE_BEATS_PER_MINUTE, see
//                 ratelimit.js) because every accepted id is a Redis write and
//                 the endpoint is deliberately unauthenticated. Over budget →
//                 429 + Retry-After and the id is NOT registered, so the count
//                 cannot be inflated past the budget per IP per minute.
//   GET        → { count } read-only (nothing to register).
//
// The id is a client-generated random UUID that exists only to dedupe tabs —
// it is never linked to a session or an author, so presence stays anonymous
// by construction (the limiter keys on a hash of the IP, never the address).
// No auth: watching who's around is part of the read-only experience.
import { NextResponse } from 'next/server';
import { PRESENCE_ID_RE } from '@/lib/guestbook/anonId';
import { heartbeat, presenceCount } from '@/lib/guestbook/presence';
import { checkPresenceRateLimit } from '@/lib/guestbook/ratelimit';

export const dynamic = 'force-dynamic';

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

export async function GET() {
  return NextResponse.json(await presenceCount());
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  // PRESENCE_ID_RE is shared with the client that mints ids (anonId.js), so a
  // fallback id minted over plain http can never be one the server rejects.
  if (typeof body?.id !== 'string' || !PRESENCE_ID_RE.test(body.id)) {
    return NextResponse.json({ error: 'Invalid presence id' }, { status: 400 });
  }
  // Validate first, meter second: a malformed flood costs no Redis and no
  // budget; a well-formed one is metered before anything is written.
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
