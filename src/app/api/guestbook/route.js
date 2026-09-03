// Guestbook API (issue #40).
//   GET    → { messages, count }, newest first. Public.
//   POST   → create a message. Requires a signed-in session (GitHub or
//            Google); author identity is taken ONLY from that session, never
//            from the body; body text runs the full validate.js gauntlet;
//            1 post / user / 5 min server-side.
//   DELETE → ?id=… own-or-admin. The session username must match the STORED
//            author (case-insensitive — an author may always remove their own
//            message) or be GUESTBOOK_ADMIN (env, via admin.js) — the owner's
//            fast path for removing anything unpleasant from a
//            recruiter-facing wall. Both checks are re-derived server-side
//            from the session; the client never nominates an author.
//
// Messages are plain text end-to-end: stored as JSON strings, rendered as React
// text nodes (never dangerouslySetInnerHTML), so nothing here needs to
// HTML-escape — it needs to *stay* text, which validate.js enforces.
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  addMessage,
  deleteMessage,
  getMessages,
  getReactions,
} from '@/lib/guestbook/store';
import { isAdminUsername } from '@/lib/guestbook/admin';
import { checkRateLimit } from '@/lib/guestbook/ratelimit';
import { validateMessage } from '@/lib/guestbook/validate';
import { isValidSignaturePath } from '@/lib/guestbook/signature';
import {
  emptyReactionCounts,
  toReactionCounts,
} from '@/lib/guestbook/reactions';

// Live data behind auth — never prerendered, never cached by the framework.
export const dynamic = 'force-dynamic';

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

export async function GET() {
  // The viewer may be anonymous — the session only personalises
  // `viewerReaction`, it never gates reading.
  const session = await auth();
  const viewer = session?.user?.username || null;

  const stored = (await getMessages()).sort(byNewest);
  const maps = await getReactions(stored.map((m) => m.id));

  // Strip the private { username: reactionKey } map (the json driver stores
  // it inline on the message) — only aggregate counts and the caller's own
  // choice leave the server.
  const messages = stored.map(({ reactions: _private, ...msg }) => {
    const map = maps[msg.id] || {};
    return {
      ...msg,
      reactions: toReactionCounts(map),
      viewerReaction: viewer ? (map[viewer] ?? null) : null,
    };
  });

  return NextResponse.json({ messages, count: messages.length });
}

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

  const checked = validateMessage(body?.message);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  // Optional ink signature — an SVG path string that must match the strict
  // grammar in signature.js (commands M/L/Q/C/Z, numbers 0–100, ≤4KB) BEFORE
  // storage. Anything else is rejected outright, not sanitised: this string
  // is rendered into the DOM later, so "almost valid" is not a category.
  let signature = null;
  if (body?.signature !== undefined && body?.signature !== null) {
    if (!isValidSignaturePath(body.signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    signature = body.signature.trim();
  }

  const limit = await checkRateLimit(username);
  if (!limit.ok) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return NextResponse.json(
      {
        error: `One message every 5 minutes — try again in ${minutes} minute${minutes === 1 ? '' : 's'}`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      },
    );
  }

  const message = {
    id: `msg_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    author: {
      // Session-only identity — a forged author in the body is simply ignored.
      // `provider` decides how the card presents the author: github handles
      // are public and linkable; google usernames are internal ids, so the
      // card shows the display name and links nowhere.
      name: session.user.name || username,
      username,
      avatar: session.user.image || null,
      provider: session.user.provider || 'github',
    },
    message: checked.value,
    ...(signature ? { signature } : {}),
    createdAt: new Date().toISOString(),
  };

  await addMessage(message);
  // Same enriched shape GET serves, so the client can swap its optimistic
  // card for this object without special-casing a fresh message.
  return NextResponse.json(
    { ...message, reactions: emptyReactionCounts(), viewerReaction: null },
    { status: 201 },
  );
}

export async function DELETE(request) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Message id is required' }, { status: 400 });
  }

  // Own-or-admin (owner-directed): an author may always remove their own
  // message — the bin button on their card — while GUESTBOOK_ADMIN keeps
  // delete-any for moderation. Ownership compares the SESSION username to
  // the STORED author (both server-derived; the client never nominates an
  // author here any more than it does on POST). Case-insensitive because
  // GitHub logins are; Google's google:<sub> ids are digits, unaffected.
  const target = (await getMessages()).find((m) => m.id === id);
  if (!target) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }
  const isAdmin = isAdminUsername(username);
  const isOwn =
    (target.author?.username || '').toLowerCase() === username.toLowerCase();
  if (!isAdmin && !isOwn) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const removed = await deleteMessage(id);
  if (!removed) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
