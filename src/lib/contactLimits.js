// The contact form's field limits, shared by the form (src/components/contact/
// Form.jsx) and the route that delivers it (src/app/api/send-mail/route.js).
//
// These used to be typed twice, held together by a "keep in sync" comment on
// each side. A comment is a promise, not a check: had the client's subject cap
// drifted above the server's, a visitor could type a subject the form accepted
// and the server then refused, and the offline queue would retry that message
// forever. Both sides now read this module, and
// tests/fitness/contactContract.test.js pins the one relationship that matters:
// the CLIENT is never looser than the SERVER, so anything the form lets through
// the server will accept.
//
// The two sides may legitimately differ (the client asks for at least 50
// characters of message to discourage empty pings; the server only requires
// "present"), which is why these are two objects rather than one.

export const CONTACT_CLIENT_LIMITS = Object.freeze({
  name: { min: 3, max: 100 },
  subject: { max: 175 },
  message: { min: 50, max: 500 },
});

export const CONTACT_SERVER_LIMITS = Object.freeze({
  name: { max: 100 },
  subject: { max: 175 },
  message: { max: 2000 },
});
