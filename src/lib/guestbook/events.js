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
export function arrivalAnnouncement(arrivals) {
  if (!arrivals.length) return '';
  const line = (m) => `${m.author?.name || 'Someone'}: ${m.message}`;
  if (arrivals.length === 1) return `New message from ${line(arrivals[0])}`;
  return `${arrivals.length} new messages. ${arrivals.map(line).join('. ')}`;
}
