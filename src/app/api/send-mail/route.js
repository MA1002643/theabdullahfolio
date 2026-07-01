import nodemailer from 'nodemailer';
import { Redis } from '@upstash/redis';

// Pin the Node.js runtime, matching the repo's other API routes. Required here:
// nodemailer relies on Node core modules (net/tls/stream) and cannot run on Edge.
export const runtime = 'nodejs';

// Durable idempotency store for contact-send dedupe. The Vercel↔Upstash
// Marketplace integration injects KV_REST_API_URL / KV_REST_API_TOKEN (Vercel's
// KV-compatible names); a native Upstash setup uses UPSTASH_REDIS_REST_URL /
// _TOKEN. Accept either so the store works however it was provisioned. Use the
// WRITE token — never KV_REST_API_READ_ONLY_TOKEN — since the claim does SET/DEL.
// When neither pair is present (local dev / a preview without the integration)
// we degrade to no-dedupe so the form still works — see the claim block in POST.
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

// How long a DELIVERED message's key (the SENT marker) is remembered. Must
// comfortably outlast any retry the offline queue could make — it retries on
// reconnect, which can be far later — so 24h is generous headroom for a personal
// contact form.
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

// A short-lived claim marking a send as IN PROGRESS, written before sendMail()
// and promoted to SENT only once delivery succeeds. It must outlast one
// server-side send attempt yet stay small: while a PENDING marker lingers,
// retries are told to wait, so a crashed/killed request that never promotes or
// releases would otherwise block delivery for the whole TTL. 120s comfortably
// covers an SMTP send (which we bound below) while keeping that self-heal window
// to two minutes.
const PENDING_TTL_SECONDS = 120;

// Per-attempt SMTP timeouts. Their combined worst case MUST stay well under
// PENDING_TTL_SECONDS so a send can NEVER outlive its PENDING claim: the claim
// then always survives the whole attempt, so it can't expire mid-send and let a
// concurrent retry reclaim the key. That removes the stale-attempt race at the
// root — no older attempt can promote SENT (or DELETE the key) after a retry has
// taken over, and no duplicate email goes out (only one attempt ever holds the
// claim, so only one ever sends). Budget ≈ 10 + 10 + 20 = 40s, far below 120s.
const SMTP_CONNECTION_TIMEOUT_MS = 10_000; // TCP connect
const SMTP_GREETING_TIMEOUT_MS = 10_000; // wait for the server 220 greeting
const SMTP_SOCKET_TIMEOUT_MS = 20_000; // idle-socket inactivity

// Claim states stored under the idempotency key. PENDING = an attempt is in
// flight (or recently died); SENT = the message was delivered. Only SENT dedupes
// a retry to success — a PENDING key gets a retryable response so the client
// keeps the message queued until one attempt actually completes.
const CLAIM_PENDING = 'pending';
const CLAIM_SENT = 'sent';

// Namespace for the client-supplied idempotency key. The key arrives in a request
// header and would otherwise be used verbatim against a Redis database shared with
// the rest of the app, so we never store it raw: prefixing isolates these claims
// into a dedicated keyspace (no collisions with other features) and confines a
// crafted header to reading/writing/deleting keys under this prefix only — it can
// never target arbitrary keys elsewhere in the database.
const IDEMPOTENCY_KEY_PREFIX = 'contact:idempotency:';

// The idempotency key arrives in a public, attacker-controllable request header,
// so we constrain it to the shape the client actually produces (see
// newIdempotencyKey in lib/contact.js — a UUID or a short base36 token) BEFORE it
// becomes Redis key material. This bounds key length and cardinality so malformed
// or malicious requests can't write oversized keys or flood the store with junk
// entries (each would otherwise sit under a TTL). A key that fails this is treated
// as absent → the request still sends, just without dedupe (fail open, matching
// how we already degrade when the store is unreachable). The charset is a
// deliberate superset of what the client emits; 128 is generous headroom over the
// real max of 36.
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req) {
  // Stable per-message key from the client (see lib/contact.js). Same key on the
  // first send and every offline retry of that message — the dedupe hinges on it.
  // Validate it against the expected client format before any use: a header that
  // doesn't match is treated as no key (→ no dedupe), so malformed/malicious
  // requests can't turn into oversized or unbounded Redis keys.
  const rawIdempotencyKey = req.headers.get('idempotency-key')?.trim();
  const idempotencyKey =
    rawIdempotencyKey && IDEMPOTENCY_KEY_PATTERN.test(rawIdempotencyKey)
      ? rawIdempotencyKey
      : null;
  // Namespaced key actually used against Redis — never the raw client header. See
  // IDEMPOTENCY_KEY_PREFIX above for why. Null when the client sent no key.
  const idempotencyStoreKey = idempotencyKey
    ? `${IDEMPOTENCY_KEY_PREFIX}${idempotencyKey}`
    : null;
  try {
    let { name, email, subject, message } = await req.json();
    name = typeof name === 'string' ? name.trim() : '';
    email = typeof email === 'string' ? email.trim() : '';
    subject = typeof subject === 'string' ? subject.trim() : '';
    message = typeof message === 'string' ? message.trim() : '';

    const subjectSuffix = ' (ma.codes contact form)';
    // Keep in sync with client-side maxLength in Form.jsx (subject field)
    const maxRawSubjectLength = 175;
    const maxSubjectLength = maxRawSubjectLength + subjectSuffix.length;

    const validationErrors = [];
    if (!name) validationErrors.push('Full Name is required.');
    if (!email) validationErrors.push('Email is required.');
    if (!subject) validationErrors.push('Subject is required.');
    if (!message) validationErrors.push('Message is required.');

    if (name.length > 100)
      validationErrors.push(
        'Full Name exceeds maximum allowed length (100 characters).',
      );
    if (subject.length > maxRawSubjectLength)
      validationErrors.push(
        `Subject exceeds maximum allowed length (${maxRawSubjectLength} characters).`,
      );
    if (message.length > 2000)
      validationErrors.push(
        'Message exceeds maximum allowed length (2000 characters).',
      );

    // Reject inputs containing CR/LF to prevent header injection
    if (/[\r\n]/.test(name) || /[\r\n]/.test(subject)) {
      validationErrors.push('Input contains invalid characters.');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      validationErrors.push('Invalid email format.');
    }

    // Verify email deliverability via Abstract Email Reputation API
    // Runs alongside other checks so all errors are collected together
    if (process.env.ABSTRACT_API_KEY && emailRegex.test(email)) {
      const controller = new AbortController();
      const timeoutMs = 5000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const abstractRes = await fetch(
          `https://emailreputation.abstractapi.com/v1/?api_key=${process.env.ABSTRACT_API_KEY}&email=${encodeURIComponent(email)}`,
          { signal: controller.signal, cache: 'no-store' },
        );

        if (abstractRes.ok) {
          const validation = await abstractRes.json();
          if (validation.email_deliverability?.status === 'undeliverable') {
            validationErrors.push(
              'This email address does not exist or cannot receive emails.',
            );
          }
          if (validation.email_quality?.is_disposable) {
            validationErrors.push(
              'Disposable email addresses are not allowed.',
            );
          }
        } else {
          console.warn('Abstract API non-ok:', abstractRes.status);
        }
      } catch (abstractErr) {
        console.warn('Skipping Abstract email reputation check:', abstractErr);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (validationErrors.length > 0) {
      return new Response(JSON.stringify({ errors: validationErrors }), {
        status: 400,
      });
    }

    // 🔁 Idempotency claim — the first request for a given key wins the right to
    // send by writing a PENDING marker (atomic SET NX, so two concurrent retries
    // can't both pass it). The marker is promoted to SENT only after delivery
    // actually succeeds (below), so a claimed-but-unsent key is NEVER mistaken
    // for proof of delivery. If the store is unreachable we fail OPEN — better an
    // unlikely duplicate than a dropped message.
    if (idempotencyKey && redis) {
      let claimed;
      try {
        claimed = await redis.set(idempotencyStoreKey, CLAIM_PENDING, {
          nx: true,
          ex: PENDING_TTL_SECONDS,
        });
      } catch (storeErr) {
        console.warn('idempotency store unavailable; sending without dedupe', {
          name: storeErr?.name,
        });
        claimed = 'OK';
      }
      if (claimed !== 'OK') {
        // The key already exists. Only a SENT marker proves the message was
        // delivered — dedupe THAT to success. A PENDING marker means another
        // attempt is still in flight (or recently died); return a retryable
        // response so the client keeps the message queued rather than dropping it
        // on a send that hasn't actually completed.
        let claimState = null;
        try {
          claimState = await redis.get(idempotencyStoreKey);
        } catch {
          /* unreadable status → treat as not-yet-sent → retryable */
        }
        if (claimState === CLAIM_SENT) {
          return new Response(
            JSON.stringify({ success: true, message: 'Email already sent.', deduped: true }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            retryable: true,
            message: 'A send for this message is already in progress. Please retry shortly.',
          }),
          { status: 409 },
        );
      }
    }

    // 🔒 Set up transporter using your SMTP credentials
    const smtpPort = Number(process.env.SMTP_PORT) || 587;
    const smtpSecureFromEnv = process.env.SMTP_SECURE;
    const smtpSecure =
      typeof smtpSecureFromEnv === 'string'
        ? smtpSecureFromEnv.toLowerCase() === 'true'
        : smtpPort === 465;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, // e.g. "smtp.gmail.com"
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: process.env.SMTP_USER, // your email
        pass: process.env.SMTP_PASS, // app password or SMTP password
      },
      // Bound the exchange so a send can't outlive its PENDING claim — this is
      // what closes the stale-attempt race (see the timeout constants near
      // PENDING_TTL_SECONDS). Without these, a hung SMTP server lets sendMail()
      // run to the function's max duration, long past the claim's TTL.
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    });

    // 📧 Send email
    const emailSubject = `${subject.slice(0, maxRawSubjectLength)}${subjectSuffix}`;

    try {
      await transporter.sendMail({
        from: { name: 'ma.codes Contact Form', address: process.env.SMTP_USER },
        replyTo: { name, address: email },
        to: process.env.RECEIVER_EMAIL, // your inbox
        subject: emailSubject,
        text: `From: ${name} <${email}>\nFull Name: ${name}\n\nMessage:\n${message}`,
        html: `
          <div style="font-family:Arial, sans-serif; line-height:1.6;">
            <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
            <p><strong>Full Name:</strong> ${escapeHtml(name)}</p>
            <p><strong>Message:</strong></p>
            <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
          </div>
        `,
      });
    } catch (sendErr) {
      // Send failed → release the claim so a legitimate retry isn't silently
      // deduped into a lost message. The DEL is unconditional but safe: the SMTP
      // timeouts keep this attempt within PENDING_TTL_SECONDS, so the key we clear
      // is still ours — never a newer retry's claim. TTL is the backstop.
      if (idempotencyKey && redis) {
        try {
          await redis.del(idempotencyStoreKey);
        } catch {
          /* ignore — the TTL will expire the stale claim */
        }
      }
      throw sendErr; // surfaces as the 500 below
    }

    // Delivered → promote the claim from PENDING to SENT and extend it to the
    // full retention TTL, so far-future offline retries of this same message
    // dedupe to success. The promote is unconditional but safe: the SMTP timeouts
    // keep this attempt within PENDING_TTL_SECONDS, so we still own the claim and
    // can't clobber a newer retry's state. Best-effort otherwise — the email is
    // already out, so a store blip here must not fail the request.
    if (idempotencyKey && redis) {
      try {
        await redis.set(idempotencyStoreKey, CLAIM_SENT, { ex: IDEMPOTENCY_TTL_SECONDS });
      } catch {
        /* ignore — PENDING will expire on its own */
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully!' }),
      { status: 200 },
    );
  } catch (err) {
    console.error('Error sending email:', err);
    const message = err?.responseCode
      ? `Mail server rejected the request (code ${err.responseCode}).`
      : 'Failed to send email. Please try again later.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
    });
  }
}
