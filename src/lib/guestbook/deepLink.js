// Deep-link hash → message id (issue #40, recruiter-legibility pass). The
// copy-link button writes `/guestbook#msg_…` verbatim — ids are ASCII — so the
// decode only exists for hashes a browser or chat app percent-encoded on the
// way. A hash that will not decode (`#%zz`, a truncated `%`) cannot name a
// message, so it is a no-op: decodeURIComponent throws URIError there, and an
// effect that throws takes the whole wall down with it instead of ignoring
// one bad link.
//
// The decoded value is then checked against the message-id SHAPE
// (messageId.js) before it is returned (code review). The wall hands
// whatever this answers to loadUntil(), which walks older pages until the
// mark appears — up to ten 50-message fetches — and the page defines
// ordinary anchors of its own (`#guestbook`, the title), so an unvalidated
// fragment turned a plain in-page link into a crawl for a mark that could
// not exist. Anything that is not `msg_<ms>_<8 hex>` is an anchor, not a
// message: no id, no walk. Pure and window-free so it can be pinned by a
// unit test.
import { isMessageId } from './messageId';

export function messageIdFromHash(hash) {
  if (typeof hash !== 'string') return '';
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return '';
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return '';
  }
  return isMessageId(decoded) ? decoded : '';
}
