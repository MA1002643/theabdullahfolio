// Anonymous presence ids (issue #40 Phase 4) — the ONE definition of what a
// valid id looks like, shared by the client that mints them (usePresence) and
// the route that checks them (/api/guestbook/presence), so the two can never
// drift. Pure and window-free so the generator can be pinned by a unit test
// against the very regex the server enforces.
export const PRESENCE_ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

// Mint an id that satisfies PRESENCE_ID_RE and NEVER throws. Three tiers:
//   1. crypto.randomUUID — but it is a secure-context API: absent over plain
//      http on a LAN address, which is exactly how this dev server is viewed
//      from a real phone (and where the first cut threw from BOTH branches of
//      its try/catch, taking the whole wall down with a decorative counter).
//   2. crypto.getRandomValues — not secure-context gated; 16 bytes → 32 hex.
//   3. time + Math.random (the contact form's idempotency-key fallback idiom) —
//      presence only needs to dedupe one tab from the next, not be
//      unguessable.
// `cryptoLike` is injectable for the tests; production passes nothing.
export function randomAnonId(cryptoLike = globalThis.crypto) {
  try {
    if (cryptoLike && typeof cryptoLike.randomUUID === 'function') {
      return cryptoLike.randomUUID();
    }
  } catch {
    /* fall through */
  }
  try {
    if (cryptoLike && typeof cryptoLike.getRandomValues === 'function') {
      const bytes = cryptoLike.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
