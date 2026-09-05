// Guestbook API (issue #40).
//   GET    → { messages, count, nextCursor }. Public. ONE PAGE, newest first:
//            ?limit=N (default PAGE_SIZE, hard-capped at MAX_PAGE_LIMIT) and
//            ?cursor=… (the previous page's `nextCursor`) — never the whole
//            wall. `count` is the wall's total, read separately (ZCARD on
//            redis), so a client knows the size without loading it;
//            `nextCursor` is null on the last page; a MALFORMED cursor is a
//            400 — cursors are shape-validated, not authenticated: a cursor
//            is an unsigned position into public data, so a hand-built one
//            is served exactly as a minted one (cursor.js says why that is
//            the right contract). Reactions are fetched for the page's ids
//            only, so a GET costs O(limit) commands however long the wall
//            grows — the poll reads just the newest page (paging.js). Each
//            message is the PUBLIC shape (toPublicMessage): the author's
//            identity key never ships, the username (a GitHub login, display
//            data) ships only for GitHub authors, and `isOwn` says whether
//            the VIEWER wrote it.
//   POST   → create a message. Requires a signed-in session (GitHub or
//            Google); author identity is taken ONLY from that session, never
//            from the body; body text runs the full validate.js gauntlet;
//            1 post / user / 5 min server-side. Answers 201 with the public
//            message plus `count` — the wall's size read just after the
//            store — so the client settles its total from the write itself.
//   DELETE → ?id=… own-or-admin, answering { ok, count } the same way. An id
//            not shaped like a minted message id (messageId.js) is a 400
//            before any storage work. The
//            session's identity KEY must equal the STORED author's
//            (identity.js — the provider account id, so an author may always
//            remove their own message however their login has changed) or
//            the session must be GUESTBOOK_ADMIN (env, via admin.js) — the
//            owner's fast path for removing anything unpleasant from a
//            recruiter-facing wall. Both checks are re-derived server-side
//            from the session; the client never nominates an author.
//
// Identity: every write takes its author from viewerFromSession(auth()) —
// { key, provider, username, name, image } — and stores key + username
// side by side. The key is what every comparison uses; the login is never
// compared (identity.js explains the rename hazard that rules it out).
//
// Messages are plain text end-to-end: stored as JSON strings, rendered as React
// text nodes (never dangerouslySetInnerHTML), so nothing here needs to
// HTML-escape — it needs to *stay* text, which validate.js enforces.
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  addMessage,
  countMessages,
  deleteMessage,
  getMessage,
  getReactions,
  listMessages,
} from '@/lib/guestbook/store';
import { isAdminIdentity } from '@/lib/guestbook/admin';
import { ownsMessage, viewerFromSession } from '@/lib/guestbook/identity';
import { checkRateLimit } from '@/lib/guestbook/ratelimit';
import { validateMessage } from '@/lib/guestbook/validate';
import { isValidSignaturePath } from '@/lib/guestbook/signature';
import {
  emptyReactionCounts,
  toReactionCounts,
} from '@/lib/guestbook/reactions';
import { parseLimit } from '@/lib/guestbook/paging';
import { decodeCursor, encodeCursor } from '@/lib/guestbook/cursor';
import { isMessageId, mintMessageId } from '@/lib/guestbook/messageId';

// Live data behind auth — never prerendered, never cached by the framework.
export const dynamic = 'force-dynamic';

// The public shape of a stored author. The identity `key` (identity.js) is
// internal: it is what ownership and the limiters compare, and for a Google
// author it is the account's sub — so it is stripped from every message this
// route serves, the viewer's own included; nobody learns another account's
// id from the wall. (The one place a key does reach a browser is its owner's
// own session payload — sessionCallbacks.js says why that is fine.) A GitHub
// login is public by nature — the card links to the profile — so `username`
// ships for GitHub authors. Rows from before `key`
// existed stored a Google author's sub AS the username (`google:<sub>`); ':'
// is illegal in a GitHub login, so a username carrying one is internal
// whatever the provider says and is stripped too (the identity migration,
// legacyIdentity.js, moves it into `key` and drops it). Hiding in the UI is not
// hiding on the wire, and this GET is public. The one thing the client used
// identity for, "is this mine?" (the bin button), travels as the
// viewer-specific boolean `isOwn` instead.
function publicAuthor(author) {
  const { key: _key, username, ...rest } = author || {};
  const isGitHub = (rest.provider ?? 'github') === 'github';
  const isPublicLogin = typeof username === 'string' && !username.includes(':');
  return isGitHub && isPublicLogin ? { ...rest, username } : rest;
}

// One enrichment for GET and POST alike, so a freshly posted card and a
// fetched one have the same wire shape. Strips the private
// { userKey: reactionKey } map (the json driver stores it inline on the
// message) — only aggregate counts and the caller's own choice leave the
// server — and the internal author fields above. `viewer` is
// viewerFromSession's shape or null; ownership is ownsMessage, the same
// key comparison DELETE makes.
function toPublicMessage(stored, { viewer, reactions, viewerReaction }) {
  const { reactions: _private, author, ...msg } = stored;
  return {
    ...msg,
    author: publicAuthor(author),
    reactions,
    viewerReaction,
    isOwn: ownsMessage(author, viewer),
  };
}

export async function GET(request) {
  const query = new URL(request.url).searchParams;
  const limit = parseLimit(query.get('limit'));
  const rawCursor = query.get('cursor');
  const after = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !after) {
    return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
  }

  // The viewer may be anonymous — the session only personalises `isOwn` and
  // `viewerReaction`, it never gates reading.
  const viewer = viewerFromSession(await auth());

  const [{ messages: stored, next }, count] = await Promise.all([
    listMessages({ limit, after }),
    countMessages(),
  ]);
  const maps = await getReactions(stored.map((m) => m.id));

  const messages = stored.map((m) => {
    const map = maps[m.id] || {};
    return toPublicMessage(m, {
      viewer,
      reactions: toReactionCounts(map),
      viewerReaction: viewer ? (map[viewer.key] ?? null) : null,
    });
  });

  return NextResponse.json({
    messages,
    count,
    nextCursor: next ? encodeCursor(next) : null,
  });
}

export async function POST(request) {
  // No key, no write — that covers the anonymous visitor and a session
  // minted before keys existed (identity.js), which signing in again fixes.
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

  const limit = await checkRateLimit(viewer.key);
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
    // messageId.js owns the shape: the deep link recognises exactly what is
    // minted here, so an unrelated page anchor can never start a wall crawl.
    id: mintMessageId(),
    author: {
      // Session-only identity — a forged author in the body is simply ignored.
      // `key` is the stable account id every later comparison uses;
      // `username` (GitHub only) is the display handle beside it, so a rename
      // changes what the card shows and nothing about who owns the message.
      // `provider` decides how the card presents the author: github handles
      // are public and linkable; a Google author has no handle, so the card
      // shows the display name and links nowhere.
      name: viewer.name || viewer.username || 'Someone',
      ...(viewer.username ? { username: viewer.username } : {}),
      avatar: viewer.image,
      provider: viewer.provider,
      key: viewer.key,
    },
    message: checked.value,
    ...(signature ? { signature } : {}),
    createdAt: new Date().toISOString(),
  };

  await addMessage(message);
  // Same public shape GET serves, so the client can swap its optimistic card
  // for this object without special-casing a fresh message — the author is
  // the viewer, so `isOwn` is true. Plus `count`, the wall's size read just
  // after the store: a GET served while this POST was in flight may already
  // have counted the message without listing it (an older page cannot), so
  // the client settles its total from the write's own answer rather than
  // from whether a fetched page happened to contain the card.
  const count = await countMessages();
  return NextResponse.json(
    {
      ...toPublicMessage(message, {
        viewer,
        reactions: emptyReactionCounts(),
        viewerReaction: null,
      }),
      count,
    },
    { status: 201 },
  );
}

export async function DELETE(request) {
  const viewer = viewerFromSession(await auth());
  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Message id is required' }, { status: 400 });
  }
  // Shape before storage (messageId.js, the same check the deep link and the
  // reactions route make): an id the API could not have minted is a 400
  // here, not a Redis GET that answers 404 (code review).
  if (!isMessageId(id)) {
    return NextResponse.json({ error: 'Invalid message id' }, { status: 400 });
  }

  // Own-or-admin (owner-directed): an author may always remove their own
  // message — the bin button on their card — while GUESTBOOK_ADMIN keeps
  // delete-any for moderation. Ownership compares the SESSION's identity key
  // to the STORED author's (ownsMessage; both server-derived — the client
  // never nominates an author here any more than it does on POST). The login
  // is not consulted: it is display data, and a renamed author must still be
  // able to remove their own message. Admin is admin.js's call: the viewer's
  // key equal to GUESTBOOK_ADMIN — a key, never a login, for the same reason.
  const target = await getMessage(id);
  if (!target) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }
  if (!isAdminIdentity(viewer) && !ownsMessage(target.author, viewer)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const removed = await deleteMessage(id);
  if (!removed) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }
  // The mirror of POST's `count`: the wall's size just after the removal.
  return NextResponse.json({ ok: true, count: await countMessages() });
}
