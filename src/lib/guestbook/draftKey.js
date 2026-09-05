// Where the guestbook composer's autosaved draft lives in localStorage — ONE
// slot per signed-in ACCOUNT, never one per browser (code review).
//
// The first cut used a single key for the whole browser. localStorage is
// per-origin, not per-person: a visitor who left an unsent message and signed
// out handed it to whoever signed in next on the same browser — the composer
// restored the first account's private text into the second account's field.
// So the slot is namespaced by the session's stable identity key
// (identity.js — `github:<id>` / `google:<sub>`, the one field that names the
// account and survives a rename), and a session without a key (one minted
// before keys existed) gets no slot at all: nothing is saved for it rather
// than something saved for the wrong person.
//
// This is the one place the wall's client code reads `session.user.key`, and
// for a purely local purpose — the key never leaves the browser through it.
//
// The old unscoped slot is NEVER read again. Whatever it holds belongs to an
// unknown account; migrating it into the current one would be exactly the
// leak in a different order, so the composer removes it on mount instead.
export const LEGACY_DRAFT_KEY = 'guestbook:draft:v1';
const DRAFT_KEY_PREFIX = 'guestbook:draft:v2:';

export function draftKeyFor(user) {
  const key = user?.key;
  return typeof key === 'string' && key.length > 0 ? `${DRAFT_KEY_PREFIX}${key}` : null;
}
