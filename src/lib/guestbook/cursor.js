// Opaque page cursors for GET /api/guestbook — SERVER-ONLY (Buffer). A cursor
// is a paging.js position, { t: createdAt ms, id }, of the last message on
// the page just served: "continue from strictly older than this". It goes to
// the client as base64url so it reads as a token rather than a number to do
// arithmetic on, and comes back through decodeCursor, which validates every
// field — a truncated, tampered or hand-built cursor is a 400 from the route,
// never an argument that reaches Redis.

// Message ids are `msg_<ms>_<8 hex>` today; the shape below is deliberately a
// little wider (word chars + dash, bounded) so a future id scheme needs no
// cursor migration, while still refusing anything that isn't an id.
const ID_RE = /^[\w-]{1,80}$/;
const TIME_RE = /^\d{1,16}$/;
const CURSOR_RE = /^[A-Za-z0-9_-]{1,200}$/;

export function encodeCursor(pos) {
  return Buffer.from(`${pos.t}:${pos.id}`, 'utf8').toString('base64url');
}

// → { t, id } or null when the string is not a cursor this server minted.
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
