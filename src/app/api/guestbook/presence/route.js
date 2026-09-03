// Guestbook presence endpoint (issue #40 Phase 4).
//   POST { id } → registers a heartbeat for that anonymous id and returns
//                 { count } — the poll and the register are one round-trip.
//   GET        → { count } read-only (nothing to register).
//
// The id is a client-generated random UUID that exists only to dedupe tabs —
// it is never linked to a session or an author, so presence stays anonymous
// by construction. No auth: watching who's around is part of the read-only
// experience.
import { NextResponse } from 'next/server';
import { heartbeat, presenceCount } from '@/lib/guestbook/presence';

export const dynamic = 'force-dynamic';

const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

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
  if (typeof body?.id !== 'string' || !ID_RE.test(body.id)) {
    return NextResponse.json({ error: 'Invalid presence id' }, { status: 400 });
  }
  return NextResponse.json(await heartbeat(body.id));
}
