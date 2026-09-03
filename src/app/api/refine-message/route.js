import { streamText, createTextStreamResponse } from 'ai';
import { resolveRefineMode } from '@/lib/refineModes';

// Pin the Node.js runtime, matching the repo's other API routes. The AI SDK +
// gateway stack targets Node >=22; pinning also prevents accidental Edge
// execution if Next's defaults ever change.
export const runtime = 'nodejs';

// ── /api/refine-message ──────────────────────────────────────────────────────
// "Polish my missive": takes the visitor's rough message and streams back a
// cleaner rewrite — token by token — which the client shows as a ghosted
// suggestion the visitor can accept or dismiss. The streaming is the point: the
// rewrite materialises live rather than popping in after a spinner, which is
// what makes the feature feel premium.
//
// Two surfaces share this endpoint via an optional `mode` in the body:
// the contact form (default — a longer, professional note to the owner) and
// the guestbook composer (a short, casual one-line public mark). Each mode
// carries its own editorial contract (system prompt), length bounds and token
// cap; everything else — rate limit, error shapes, the stream plumbing — is
// deliberately one implementation.
//
// Routing goes through the Vercel AI Gateway: a plain "provider/model" string
// passed to `streamText` is auto-routed by the AI SDK (ai@7) through the gateway
// — no provider SDK, no per-provider key. Auth resolves from AI_GATEWAY_API_KEY
// or, on Vercel / after `vercel env pull`, the auto-injected VERCEL_OIDC_TOKEN.
//
// The model is overridable via REFINE_MODEL so the slug can be bumped without a
// code change (model ids drift); the default is a fast, inexpensive model that
// is more than capable of rewriting a sub-500-character note.
const MODEL = process.env.REFINE_MODEL || 'anthropic/claude-haiku-4.5';

// Byte ceiling for the raw request body, checked before we buffer/parse it. A
// 2000-char message is at most ~6 KB of UTF-8 (plus the tiny JSON wrapper), so
// 8 KB leaves headroom for multi-byte content while still rejecting payloads no
// legitimate contact note would produce. Distinct from MAX_LEN — that's a
// character count on the parsed message; this is a fast-fail gate on wire bytes.
const MAX_BODY_BYTES = 8 * 1024;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Application-level rate limit ──────────────────────────────────────────────
// A best-effort, per-instance gate so one visitor can't spend our model budget
// by hammering this public endpoint. On Fluid Compute a warm instance is reused
// across requests, so an in-memory per-IP window curbs the common abuse (a burst
// from a single client) with no external store. It is the FIRST line of defense;
// the upstream gateway 429 mapping below remains the backstop for traffic spread
// across instances. A human polishing a contact note never approaches this rate.
const RATE_LIMIT = 10; // requests per window, per IP
const RATE_WINDOW_MS = 60_000;
const hits = new Map(); // ip -> { count, resetAt }

function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    // Opportunistic sweep so the map can't grow without bound under churn.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
    }
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

export async function POST(req) {
  // The gateway needs either a static key or an OIDC token. On Vercel
  // deployments NEITHER is an env var at runtime: the OIDC token arrives
  // per-request via the `x-vercel-oidc-token` request-context header, which
  // @vercel/oidc reads inside the AI SDK — so running on Vercel (VERCEL=1)
  // counts as configured. The env-var checks cover local dev, where we fail
  // with a clear, non-scary 503 (typically before `vercel env pull`) so the
  // client can simply hide the feature instead of erroring.
  const gatewayConfigured =
    process.env.AI_GATEWAY_API_KEY ||
    process.env.VERCEL_OIDC_TOKEN ||
    process.env.VERCEL === '1';
  if (!gatewayConfigured) {
    return json(
      { error: 'unconfigured', message: 'Message polishing is not available right now.' },
      503,
    );
  }

  // Throttle before parsing the body or touching the model — reject abuse as
  // early and cheaply as possible. Same 429 shape as the upstream-429 fallback.
  if (rateLimited(clientIp(req))) {
    return json(
      { error: 'rate_limited', message: 'Too many requests — try again in a moment.' },
      429,
    );
  }

  // Reject obviously-oversized bodies before req.json() buffers and parses them.
  // A caller within the rate limit could still POST a huge payload that the parse
  // below would fully read before the MAX_LEN check ever runs; this gate fails
  // such requests fast. Best-effort (content-length can be absent or wrong) — the
  // MAX_LEN check on the parsed message stays the authoritative cap.
  const declaredBytes = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BODY_BYTES) {
    return json({ error: 'too_large', message: 'Request is too large.' }, 413);
  }

  let message;
  let mode;
  try {
    ({ message, mode } = await req.json());
  } catch {
    return json({ error: 'bad_request', message: 'Invalid request.' }, 400);
  }

  // Unknown/absent mode falls back to the contact contract (see refineModes.js
  // — the lookup also refuses "__proto__"-style inherited keys).
  const cfg = resolveRefineMode(mode);

  message = typeof message === 'string' ? message.trim() : '';
  if (message.length < cfg.minLen) {
    return json(
      { error: 'too_short', message: 'Write a little more first, then I can polish it.' },
      400,
    );
  }
  if (message.length > cfg.maxLen) {
    return json(
      { error: 'too_long', message: 'That message is too long to polish.' },
      400,
    );
  }

  try {
    const result = streamText({
      model: MODEL,
      system: cfg.system,
      // Delimit the untrusted message so the model treats it as data, not as
      // instructions that could hijack the rewrite (prompt-injection guard).
      prompt: `Polish the message between the <message> tags:\n\n<message>\n${message}\n</message>`,
      temperature: 0.4,
      // A rewrite never needs more than its mode's cap; bounds cost on a
      // public endpoint.
      maxOutputTokens: cfg.maxOutputTokens,
      // Cancel the upstream generation if the visitor navigates away / aborts.
      abortSignal: req.signal,
      providerOptions: {
        gateway: { tags: [cfg.tag] },
      },
    });

    // `result.stream` reports model/gateway failures as `error` PARTS inside
    // the stream — only transport errors throw. The `toTextStream` helper
    // silently drops every non-text part, so piping it straight into the
    // response would turn a pre-first-token failure (gateway auth, billing
    // gate, upstream 5xx) into an empty 200 that the client can't tell from a
    // real-but-empty rewrite and that status-code monitoring can't see at all.
    // Instead, drain the stream by hand until the first text token arrives: up
    // to that point the status line is still ours, so an early failure can
    // surface as real JSON through the catch below. Only then start streaming.
    const reader = result.stream.getReader();
    let firstText;
    for (;;) {
      const { value: part, done } = await reader.read();
      if (done) {
        const err = new Error('model stream ended before any text');
        err.name = 'EmptyStreamError';
        throw err;
      }
      if (part.type === 'error') throw part.error;
      if (part.type === 'text-delta' && part.text) {
        firstText = part.text;
        break;
      }
      // start/step bookkeeping parts — keep draining.
    }

    return createTextStreamResponse({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(firstText);
        },
        async pull(controller) {
          for (;;) {
            const { value: part, done } = await reader.read();
            if (done) return controller.close();
            // Once tokens have flowed the 200 is already on the wire, so the
            // only honest signal left for a failure is terminating the body:
            // the client's read() rejects and it shows its retry copy instead
            // of presenting a half-finished rewrite as done.
            if (part.type === 'error') return controller.error(part.error);
            if (part.type === 'text-delta' && part.text) return controller.enqueue(part.text);
          }
        },
        cancel(reason) {
          return reader.cancel(reason);
        },
      }),
    });
  } catch (err) {
    // The visitor navigated away or aborted — nobody is listening; stay quiet.
    if (err?.name === 'AbortError' || req.signal.aborted) {
      return json({ error: 'aborted', message: 'Request cancelled.' }, 499);
    }
    // Gateway errors and APICallErrors both carry a numeric statusCode; read it
    // structurally so both families map without importing either error class.
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : undefined;
    if (statusCode === 429)
      return json({ error: 'rate_limited', message: 'Too many requests — try again in a moment.' }, 429);
    if (statusCode === 402)
      return json({ error: 'budget', message: 'Message polishing is paused right now.' }, 402);
    // Log only structural fields — never the raw error, and not the free-text
    // `.message`: AI SDK errors carry provider request/response bodies and can
    // surface them in their message, which may echo the visitor's authored
    // content. `name` + `statusCode` are enough to diagnose without that leak.
    console.error('refine-message failed', { name: err?.name, statusCode });
    // 401/403 are service-side configuration problems (expired gateway auth,
    // the billing gate's customer_verification_required) — retrying won't help
    // the visitor, so reuse the same quiet copy as the unconfigured 503.
    if (statusCode === 401 || statusCode === 403)
      return json({ error: 'unavailable', message: 'Message polishing is not available right now.' }, 503);
    return json({ error: 'failed', message: 'Could not polish the message. Please try again.' }, 500);
  }
}
