// Guestbook reactions (issue #40 Phase 4).
//   POST { id, key }              → set the caller's reaction to `key`
//   POST { id, key, clear: true } → remove the caller's reaction
// The client sends the DESIRED end state (it knows the current one), so a
// toggle is always one storage write. One reaction per user per message is
// enforced by the storage shape itself — a hash field per identity key can
// only hold one value — not by client behaviour. Auth required: reactions are
// as identity-bound as messages, and the key comes from the session only
// (identity.js: the provider account id, so a GitHub rename neither loses a
// person's reactions nor lets them react twice).
// Metered per user (REACTIONS_PER_MINUTE, ratelimit.js): every accepted call
// is a Redis script, so a session toggling in a loop meets a 429 with
// Retry-After rather than the store — checked after validation, so a
// malformed body never spends budget, and before the write, so a refused
// call costs nothing. Validation covers the id's SHAPE too (isMessageId): an
// id the API could not have minted is a 400 before the limiter or the store
// is touched. Returns { reactions: counts, viewerReaction } for the
// message; who reacted never leaves the server, only totals do.
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { setReaction } from '@/lib/guestbook/store';
import { viewerFromSession } from '@/lib/guestbook/identity';
import { isMessageId } from '@/lib/guestbook/messageId';
import { checkReactionRateLimit } from '@/lib/guestbook/ratelimit';
import { REACTION_KEYS, toReactionCounts } from '@/lib/guestbook/reactions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const viewer = viewerFromSession(await auth());
  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // The id must be SHAPED like a message id (messageId.js — the same check
  // the deep link makes) before anything downstream sees it: a malformed or
  // very large string used to reach the limiter (spending the caller's
  // budget) and then Redis as a key and a script argument, only to answer
  // 404. Now it is a 400 with no storage work at all (code review).
  const { id, key, clear } = body ?? {};
  if (!isMessageId(id) || !REACTION_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Invalid reaction' }, { status: 400 });
  }

  const limit = await checkReactionRateLimit(viewer.key);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `Too many reactions — try again in ${limit.retryAfterSeconds}s`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      },
    );
  }

  const nextValue = clear === true ? null : key;
  const map = await setReaction(id, viewer.key, nextValue);
  if (map === null) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  return NextResponse.json({
    reactions: toReactionCounts(map),
    viewerReaction: map[viewer.key] ?? null,
  });
}
