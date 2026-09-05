// The guestbook's reaction vocabulary (issue #40 Phase 4) — one source shared
// by the API (validating keys) and the client (rendering emoji). Storage and
// wire format use the KEYS; the emoji themselves never travel or persist, so
// a future glyph swap is presentational only.
export const REACTIONS = [
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'rocket', emoji: '🚀', label: 'Rocket' },
  { key: 'heart', emoji: '❤️', label: 'Heart' },
];

export const REACTION_KEYS = REACTIONS.map((r) => r.key);

export function emptyReactionCounts() {
  const counts = {};
  for (const key of REACTION_KEYS) counts[key] = 0;
  return counts;
}

// Membership is decided by the vocabulary, never by a lookup on the counts
// object: a plain object answers `counts.toString` / `counts.constructor`
// with inherited functions, so a stored value spelling an inherited name
// would have passed a `!== undefined` check — `+= 1` on a function writes a
// garbage string onto the public counts, and on `__proto__` reaches the
// setter. The map is data back from storage, so it is held to these keys.
const KNOWN_KEYS = new Set(REACTION_KEYS);

// Collapse a stored { username: key } map into public counts. Only counts
// leave the server — WHO reacted stays private to the store.
export function toReactionCounts(map) {
  const counts = emptyReactionCounts();
  for (const key of Object.values(map || {})) {
    if (KNOWN_KEYS.has(key)) counts[key] += 1;
  }
  return counts;
}
