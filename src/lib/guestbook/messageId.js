// The guestbook message id — minted here, recognised here, so the two can
// never drift (issue #40, code-review follow-up).
//
//   msg_<created-at, epoch ms>_<the first 8 hex chars of a random UUID>
//
// The timestamp makes ids sort with creation (paging.js breaks same-instant
// ties on the id itself); the random tail makes a same-millisecond pair
// distinct. The ONE consumer of the shape besides the mint is the deep link
// (deepLink.js): `/guestbook#<id>` walks older pages until the mark appears,
// up to ten 50-message fetches — so a fragment that is not a message id must
// never be taken for one. The page's own anchors (`#guestbook`, the title)
// used to be: any decodable fragment was handed to the walk, and a plain
// in-page link crawled the wall for a mark that could not exist.
//
// Pure and window-free; shared by the API route (server) and the wall
// (client).
const MESSAGE_ID_RE = /^msg_\d{1,16}_[0-9a-f]{8}$/;

export function mintMessageId(now = Date.now()) {
  return `msg_${now}_${crypto.randomUUID().slice(0, 8)}`;
}

export function isMessageId(value) {
  return typeof value === 'string' && MESSAGE_ID_RE.test(value);
}
