// Deep-link hash → message id (issue #40, recruiter-legibility pass). The
// copy-link button writes `/guestbook#msg_…` verbatim — ids are ASCII — so the
// decode only exists for hashes a browser or chat app percent-encoded on the
// way. A hash that will not decode (`#%zz`, a truncated `%`) cannot name a
// message, so it is a no-op: decodeURIComponent throws URIError there, and an
// effect that throws takes the whole wall down with it instead of ignoring
// one bad link. Pure and window-free so it can be pinned by a unit test.
export function messageIdFromHash(hash) {
  if (typeof hash !== 'string') return '';
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return '';
  }
}
