// Client-side event names for guestbook cross-component signals. A window
// CustomEvent keeps the wall and the headline decoupled — the title replays
// its decode without the page threading state between siblings.
export const NEW_MESSAGE_EVENT = 'guestbook:new-message';
