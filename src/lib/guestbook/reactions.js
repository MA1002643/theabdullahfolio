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

// Collapse a stored { username: key } map into public counts. Only counts
// leave the server — WHO reacted stays private to the store.
export function toReactionCounts(map) {
  const counts = emptyReactionCounts();
  for (const key of Object.values(map || {})) {
    if (counts[key] !== undefined) counts[key] += 1;
  }
  return counts;
}
