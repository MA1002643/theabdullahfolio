// The guestbook message's length band — the ONE constant the client and the
// server must agree on (the compose field's counter, the sign-in prompt's
// copy, the refine mode's budget, and the validator's gate all read it).
//
// Kept apart from validate.js on purpose: the validator pulls in the Public
// Suffix List (tldts) for its no-links check, and client components that only
// need the number must never drag that list into the browser bundle. Import
// from here in client code; validate.js re-exports these for its server-side
// callers.
export const MESSAGE_MIN = 2;
export const MESSAGE_MAX = 150;
