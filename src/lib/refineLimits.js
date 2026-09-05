// The contact surface's refine floor — the ONE constant the client and the
// server must agree on: MessageRefine's default show-the-affordance floor and
// REFINE_MODES.contact.minLen (below which /api/refine-message answers 400
// too_short) both read it, so the affordance can never offer a request the
// API refuses, and the two cannot drift apart unnoticed (they had: 24 in the
// component, 20 in the contract).
//
// Kept apart from refineModes.js on purpose, the way guestbook/limits.js is
// kept apart from validate.js: the mode table carries the system prompts, and
// a client component that only needs the number must never pull those into
// the browser bundle. The guestbook composer's floor is its own, deliberately
// ABOVE its mode's minLen (MessageInput's REFINE_MIN_LEN, pinned in
// refineModes.test.js), so it does not live here.
export const CONTACT_REFINE_MIN_LEN = 20;
