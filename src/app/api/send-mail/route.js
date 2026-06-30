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

// How long a delivered message's key is remembered. Must comfortably outlast any
// retry the offline queue could make — it retries on reconnect, which can be far
// later — so 24h is generous headroom for a personal contact form.
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

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
    // send. A retry of an already-sent message (whose success response was lost
    // to a timeout or a dropped connection) finds the key already taken and
    // returns success WITHOUT mailing again. The claim is atomic (SET NX) so two
    // concurrent retries can't both pass it. If the store is unreachable we fail
    // OPEN — better an unlikely duplicate than a dropped message.
    if (idempotencyKey && redis) {
      let claimed;
      try {
        claimed = await redis.set(idempotencyKey, '1', {
          nx: true,
          ex: IDEMPOTENCY_TTL_SECONDS,
        });
      } catch (storeErr) {
        console.warn('idempotency store unavailable; sending without dedupe', {
          name: storeErr?.name,
        });
        claimed = 'OK';
      }
      if (claimed !== 'OK') {
        return new Response(
          JSON.stringify({ success: true, message: 'Email already sent.', deduped: true }),
          { status: 200 },
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
          await redis.del(idempotencyKey);
        } catch {
          /* ignore — the TTL will expire the stale claim */
        }
      }
      throw sendErr; // surfaces as the 500 below
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
