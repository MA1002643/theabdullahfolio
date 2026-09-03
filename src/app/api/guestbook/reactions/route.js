// Guestbook reactions (issue #40 Phase 4).
//   POST { id, key }              → set the caller's reaction to `key`
//   POST { id, key, clear: true } → remove the caller's reaction
// The client sends the DESIRED end state (it knows the current one), so a
// toggle is always one storage write. One reaction per user per message is
// enforced by the storage shape itself — a hash field per username can only
// hold one value — not by client behaviour. Auth required: reactions are as
// identity-bound as messages, and the username comes from the session only.
// Returns { reactions: counts, viewerReaction } for the message; who reacted
// never leaves the server, only totals do.
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { setReaction } from '@/lib/guestbook/store';
import { REACTION_KEYS, toReactionCounts } from '@/lib/guestbook/reactions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { id, key, clear } = body ?? {};
  if (typeof id !== 'string' || !id || !REACTION_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Invalid reaction' }, { status: 400 });
  }

  const nextValue = clear === true ? null : key;
  const map = await setReaction(id, username, nextValue);
  if (map === null) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  return NextResponse.json({
    reactions: toReactionCounts(map),
    viewerReaction: map[username] ?? null,
  });
}
