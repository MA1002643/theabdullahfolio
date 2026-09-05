// Opaque page cursors for GET /api/guestbook — SERVER-ONLY (Buffer). A cursor
// is a paging.js position, { t: createdAt ms, id }, of the last message on
// the page just served: "continue from strictly older than this". It goes to
// the client as base64url so it reads as a token rather than a number to do
// arithmetic on, and comes back through decodeCursor, which validates its
// SHAPE — a truncated, malformed or over-long cursor is a 400 from the route,
// never an argument that reaches Redis.
//
// Shape is the whole contract: cursors are NOT authenticated. (Code review —
// base64url is an encoding, not a signature, and this header once claimed
// the decoder proved the server had minted a cursor. It cannot, and it need
// not.) A cursor is a position into a PUBLIC, newest-first wall: a hand-built
// one reaches nothing that following nextCursor would not, and it costs the
// same bounded commands, because both drivers consume it as a plain
// comparison bound — the Redis driver uses `t` as a numeric score bound and
// compares `id` in JS, never inside a command, so no id string can change
// what the index is asked (ID_RE admits no range syntax anyway). Signing
// (an HMAC) would buy back no privilege and would cost a secret on a public
// read path, cursors bound to a key — every deploy or rotation turning
// in-flight walks into 400s — and one more variable for the hermetic e2e
// server. So: opaque by convention, exact by construction, public by design.

// Message ids are `msg_<ms>_<8 hex>` today; the shape below is deliberately a
// little wider (word chars + dash, bounded) so a future id scheme needs no
// cursor migration, while still refusing anything that isn't an id.
const ID_RE = /^[\w-]{1,80}$/;
const TIME_RE = /^\d{1,16}$/;
const CURSOR_RE = /^[A-Za-z0-9_-]{1,200}$/;

export function encodeCursor(pos) {
  return Buffer.from(`${pos.t}:${pos.id}`, 'utf8').toString('base64url');
}

// → { t, id } when the string is a well-formed cursor, else null. Well-formed
// is all this checks — see the header for why that is the right contract.
export function decodeCursor(raw) {
  if (typeof raw !== 'string' || !CURSOR_RE.test(raw)) return null;
  const text = Buffer.from(raw, 'base64url').toString('utf8');
  const sep = text.indexOf(':');
  if (sep <= 0) return null;
  const time = text.slice(0, sep);
  const id = text.slice(sep + 1);
  if (!TIME_RE.test(time) || !ID_RE.test(id)) return null;
  const t = Number(time);
  if (!Number.isSafeInteger(t)) return null;
  return { t, id };
}
