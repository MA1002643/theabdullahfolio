// The guestbook's "arrival moment" — the two signals the wall sends when new
// marks land, one per audience.
//
// Client-side event name for the cross-component signal. A window
// CustomEvent keeps the wall and the headline decoupled — the title replays
// its decode without the page threading state between siblings.
export const NEW_MESSAGE_EVENT = 'guestbook:new-message';

// Screen-reader copy for the same moment: ONE string per batch. A poll can
// bring several marks at once, and an aria-live region announces the DOM's
// state after React commits — N setState calls in one effect collapse into
// one text change, so assistive technology would hear only the last arrival.
// The wall therefore folds every unseen arrival into a single announcement
// and updates the region once. `arrivals` is expected oldest first, so the
// newest is heard last, as it would have been had they landed one at a time.
//
// `t` (issue #82) is the wall's translator scoped to `Guestbook.announce`,
// so the sentence frame is the visitor's language while the names and the
// messages — visitor-written — pass through untouched. Without one, the
// English frame below is used (unit tests, and any caller outside a locale).
const ENGLISH = (key, v) =>
  ({
    one: `New message from ${v.name}: ${v.message}`,
    many: `${v.count} new messages. ${v.lines}`,
    line: `${v.name}: ${v.message}`,
    separator: '. ',
    someone: 'Someone',
  })[key];

export function arrivalAnnouncement(arrivals, t = ENGLISH) {
  if (!arrivals.length) return '';
  const name = (m) => m.author?.name || t('someone', {});
  if (arrivals.length === 1) {
    return t('one', { name: name(arrivals[0]), message: arrivals[0].message });
  }
  const lines = arrivals
    .map((m) => t('line', { name: name(m), message: m.message }))
    .join(t('separator', {}));
  return t('many', { count: arrivals.length, lines });
}
