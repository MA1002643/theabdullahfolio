// Paging vocabulary shared by the guestbook API route, both storage drivers and
// the client hook (issue #40 follow-up: the wall used to load, sort and ship
// EVERY message on every GET and every 30s poll, and fetch every reactions
// hash with it — payload, Redis commands and polling cost all grew with the
// wall). Pure and dependency-free on purpose: the browser bundle imports this
// module, so nothing here may touch Buffer, fs or the drivers.
//
// ORDER. "Newest first" means createdAt (ms) DESCENDING, ties broken by id
// DESCENDING — exactly how a Redis ZSET walks in REV mode (score desc, then
// member lexicographically desc). Both drivers page in this one order, so a
// position minted against either is meaningful to both, and no two messages
// ever compare equal (ids are unique) — which is what makes a cursor exact:
// "strictly older than position P" has a single answer.
//
// POSITION. { t: createdAt in ms, id }. The route encodes one as the opaque
// `nextCursor` a client hands back (cursor.js); the drivers consume it as the
// `after` argument to listMessages.

// Cards the wall renders per leaf — also the size of the poll's "newest page".
export const PAGE_SIZE = 8;

// GET /api/guestbook?limit= — the default when absent/garbage, and the hard
// ceiling: one request can never ask for more than this many messages (or
// reactions hashes), whatever the wall grows to.
export const DEFAULT_PAGE_LIMIT = PAGE_SIZE;
export const MAX_PAGE_LIMIT = 50;

// Parse the `limit` query value: an integer clamped to [1, MAX_PAGE_LIMIT];
// anything unparseable falls back to the default rather than erroring — a
// public read endpoint should be forgiving about a stray query string.
export function parseLimit(raw) {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_LIMIT;
  return Math.max(1, Math.min(MAX_PAGE_LIMIT, n));
}

function timeOf(message) {
  const t = new Date(message?.createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function positionOf(message) {
  return { t: timeOf(message), id: String(message?.id ?? '') };
}

// Array.sort comparator for the shared newest-first order.
export function compareNewest(a, b) {
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (ta !== tb) return tb - ta;
  const ia = String(a?.id ?? '');
  const ib = String(b?.id ?? '');
  return ia < ib ? 1 : ia > ib ? -1 : 0;
}

// Does position `pos` come AFTER `than` in the newest-first walk — i.e. is it
// strictly older (or the same instant with a lower id)?
export function isOlderThan(pos, than) {
  return pos.t < than.t || (pos.t === than.t && pos.id < than.id);
}

export function isNewerThan(pos, than) {
  return pos.t > than.t || (pos.t === than.t && pos.id > than.id);
}

// ── Client-side list algebra (pure, so the unit suite can pin it down) ────
//
// The hook keeps `messages` as a PREFIX of the wall: newest first, from the
// top down to wherever the visitor has read. These two helpers are the only
// ways that prefix changes shape from a fetch.

// Does a newest page (or a run of them, `page`, `limit` requested in all)
// REACH the local prefix `prev`, so mergeNewestPage can join the two without
// a hole? It does when the page is short (the server holds nothing older, so
// there is nothing to miss); when nothing confirmed lies at or below the
// page's top (nothing to join); when the two share an id; or when the page's
// oldest is no newer than the prefix's top-at-or-below-the-page — that card's
// position is inside the page's range, present or deleted since. It does NOT
// when a FULL page lies entirely above that card: more may have landed
// between two polls than one page shows, the rest would sit in the hole
// between the page and the old tail, and the prefix's continuation cursor —
// still pointing below that tail — could never recover them. Cards newer
// than the page's top (our own post, confirmed after the poll's request was
// cut) are not a join point: they sit above the page, not below it.
export function pageReachesPrefix(page, prev, limit) {
  if (page.length < limit) return true;
  const top = positionOf(page[0]);
  const below = prev.filter(
    (m) => !m.pending && !isNewerThan(positionOf(m), top),
  );
  if (!below.length) return true;
  const inPage = new Set(page.map((m) => m.id));
  if (below.some((m) => inPage.has(m.id))) return true;
  return !isNewerThan(positionOf(page[page.length - 1]), positionOf(below[0]));
}

// Merge the poll's newest page into the local prefix. The page is the
// server's truth for the window it covers, so within that window the local
// copy is REPLACED (a card deleted elsewhere leaves; reaction counts refresh;
// order is the server's); what survives around it:
//   · pending optimistic cards, always, on top;
//   · confirmed local cards NEWER than the page's first — our own post whose
//     201 landed after this poll's request was cut (they would otherwise be
//     mistaken for deletions);
//   · the local tail strictly OLDER than the page's last card — but only when
//     the page was full: a short page means the server holds nothing older,
//     so every confirmed local card outside it has been deleted.
export function mergeNewestPage(prev, page, limit) {
  const pending = prev.filter((m) => m.pending);
  if (!page.length) return pending;
  const inPage = new Set(page.map((m) => m.id));
  const newest = positionOf(page[0]);
  const oldest = positionOf(page[page.length - 1]);
  const confirmed = prev.filter((m) => !m.pending && !inPage.has(m.id));
  const newer = confirmed.filter((m) => isNewerThan(positionOf(m), newest));
  const tail =
    page.length < limit
      ? []
      : confirmed.filter((m) => isOlderThan(positionOf(m), oldest));
  return [...pending, ...newer, ...page, ...tail];
}

// Append an older page fetched from the prefix's cursor; ids already present
// (a poll that raced this fetch) are dropped rather than duplicated.
export function appendOlder(prev, page) {
  const known = new Set(prev.map((m) => m.id));
  return [...prev, ...page.filter((m) => !known.has(m.id))];
}
