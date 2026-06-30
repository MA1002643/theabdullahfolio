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
// covers an SMTP send while bounding that self-heal window to two minutes.
const PENDING_TTL_SECONDS = 120;

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
  const idempotencyKey = req.headers.get('idempotency-key');
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
      // deduped into a lost message. Best-effort: the key's TTL is the backstop.
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
    // dedupe to success. Best-effort: the email is already out, so a store blip
    // here must not fail the request — the short PENDING TTL is the backstop (a
    // retry within it gets a retryable response and stays queued; after it
    // expires a retry could re-send, an acceptable fail-open duplicate).
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
