// The palette's "Recent" group (issue #41): the ids of the last few commands a
// visitor ran, newest first, kept on their own device.
//
// Ids only. Never a label (it would freeze in the language it was run in),
// never a URL, never a query. An id that no longer resolves, such as a /uses
// plate jump remembered while on /journey, is simply not shown: the palette
// looks each id up in the live action list (see recentActions).
//
// Every storage access is guarded. Storage can be absent (SSR), blocked
// (Safari private mode, a privacy extension) or full, and a recents list is a
// convenience: losing it must never break running a command.
//
// The calls name `window.localStorage` literally, on purpose: that is the
// shape tests/unit/privacyInventory.test.js finds and checks against the
// disclosed keys (STORAGE_KEYS in src/lib/privacy/inventory.js). An injected
// store would hide this key from that guard.

export const RECENTS_KEY = 'palette:recent:v1';
export const RECENTS_MAX = 5;
// The longest id accepted back out of storage: a tampered or corrupt entry is
// dropped rather than rendered into a DOM id.
const ID_MAX = 80;

/** Cleans a parsed value into at most RECENTS_MAX distinct, sane ids. */
export function sanitiseRecents(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const id of value) {
    if (typeof id !== 'string' || !id || id.length > ID_MAX || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length === RECENTS_MAX) break;
  }
  return out;
}

/** The stored ids; anything missing, blocked or malformed reads as none. */
export function readRecents() {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    return raw ? sanitiseRecents(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** Moves `id` to the front, keeps RECENTS_MAX, and returns the new list. */
export function pushRecent(id) {
  if (typeof id !== 'string' || !id || id.length > ID_MAX) return readRecents();
  const next = [id, ...readRecents().filter((x) => x !== id)].slice(0, RECENTS_MAX);
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Quota or a blocked store: the list just isn't remembered this time.
  }
  return next;
}

/**
 * Resolves stored ids against the live actions, in recency order, as copies
 * with a distinct id (`recent:<id>`) so the same command can sit in Recent and
 * in its own group without two DOM nodes sharing an id.
 */
export function recentActions(ids, actions, section) {
  const byId = new Map(actions.map((a) => [a.id, a]));
  return ids
    .map((id) => byId.get(id))
    .filter((a) => a && !a.always && !a.noRecent)
    .map((a) => ({ ...a, id: `recent:${a.id}`, recentOf: a.id, section }));
}
