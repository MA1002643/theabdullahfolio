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

//
// `email` is 254 on both sides: the longest address SMTP can carry (RFC 5321).
// It had no cap at all, only the route's 16 KB body ceiling, and the address
// reaches nodemailer's address parser as the reply-to, where GHSA-v53p-9fqp-m79j
// (2026-09-29) is a quadratic backtrack. nodemailer 10 fixes that parser
// (2026-10-11); the cap stays, because a real address is never longer and a
// bounded input keeps the next parser defect bounded too.

export const CONTACT_CLIENT_LIMITS = Object.freeze({
  name: { min: 3, max: 100 },
  email: { max: 254 },
  subject: { max: 175 },
  message: { min: 50, max: 500 },
});

export const CONTACT_SERVER_LIMITS = Object.freeze({
  name: { max: 100 },
  email: { max: 254 },
  subject: { max: 175 },
  message: { max: 2000 },
});
