import { Output, hasToolCall, isStepCount, streamText } from 'ai';
import { journeyData, projectsData } from '@/app/data';
import { createTranslator } from 'next-intl';
import { dataTranslator, localizeJourneyEntry } from '@/i18n/data';
import { loadMessages } from '@/i18n/messages';
import { LOCALE_CODES } from '@/i18n/locales';
import { FACTS, FIT_INSTRUCTIONS, INSTRUCTIONS, fitTurn, historyMessages, userTurn } from '@/lib/ask/corpus';
import {
  ASK_LIMITS,
  FIT_LIMITS,
  askable,
  normaliseJob,
  normaliseQuestion,
  sanitiseHistory,
} from '@/lib/ask/limits';
import { createLiveTools, suggestFollowups } from '@/lib/ask/liveTools';
import { encodeEvent } from '@/lib/ask/protocol';
import { FIT_ROW, askEvents, fitEvents } from '@/lib/ask/stream';
import { checkAskRateLimit, checkDailyBudget } from '@/lib/ask/ratelimit';
import { PAYLOAD_TOO_LARGE, readJsonBody } from '@/lib/guestbook/body';

// Pin the Node.js runtime, matching the repo's other API routes (the AI SDK +
// gateway stack targets Node ≥22, and node:crypto hashes the rate-limit key).
export const runtime = 'nodejs';

// ── /api/ask ─────────────────────────────────────────────────────────────────
// The ⌘K palette's research assistant (issue #41 §4), in two modes:
//
//   ask  A question, answered by a small AGENT: Claude reads the site's citable
//        facts (src/lib/ask/corpus.js), calls LIVE tools for anything that
//        changes daily (GitHub activity, project completion, current work —
//        src/lib/ask/liveTools.js), writes a cited answer, and offers
//        follow-ups. The visitor watches each step happen.
//   fit  A pasted job description, assessed requirement by requirement as
//        STRUCTURED output (strong / partial / gap, evidence, cited facts),
//        each row streamed the moment it is complete.
//
// Both stream NDJSON (src/lib/ask/protocol.js). What the client renders as a
// link always comes from the fact registry, never from the model: citations
// are ids validated against it, and fit rows may only name ids its schema
// enumerates.
//
// The shape follows /api/refine-message, whose details it keeps: routing
// through the Vercel AI Gateway by "provider/model" string; a quiet 503 when
// the gateway is not configured; the body read under a byte ceiling before
// anything parses it; the model stream drained to its first visible output
// BEFORE the 200 is committed, so an early failure is a real status code; and
// logs that carry structural fields only — never the question, the job text
// or a raw provider error, which can echo either.
//
// Cost controls: a per-visitor sliding window on a hashed IP and a global
// daily breaker (a fit check counts three); an Anthropic cache breakpoint on
// the byte-identical instructions; no thinking (measured: it more than
// doubled output tokens for a 120-word answer); at most four agent steps.
const MODEL = process.env.ASK_MODEL || 'anthropic/claude-haiku-5.5';

// A fit check's job text is up to 6,000 characters — 18 KB in three-byte
// scripts — plus a small wrapper. 24 KB rejects anything no palette sends.
export const MAX_BODY_BYTES = 24 * 1024;

const ASK_MAX_OUTPUT_TOKENS = 700;
const FIT_MAX_OUTPUT_TOKENS = 1400;
const MAX_STEPS = 4;
const PATH_MAX = 200;

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

const cachedInstructions = (content) => ({
  role: 'system',
  content,
  // The cache breakpoint: everything up to and including this message is
  // cached by Anthropic and re-read at a fraction of the input price.
  // Ignored by any non-Anthropic model ASK_MODEL names. Measured 2026-11-09:
  // the second question read 6,454 of 6,553 input tokens from cache.
  providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
});

// ── Sources ─────────────────────────────────────────────────────────────────
// The first time an answer cites a fact, the client is told what it is: its
// kind and the page it links to, from the registry. Projects carry their name
// (a proper noun) and journey entries their title in the visitor's language;
// pages, tools and live sources are worded by the client's own catalogue.
// The `Data` catalogue is read through the plain message loader and the core
// translator, not next-intl's server API: that needs Next's request context,
// which a route handler only partly has and a test has not at all.
async function sourceLabeller(locale) {
  const messages = await loadMessages(locale);
  const t = dataTranslator(createTranslator({ locale, messages, namespace: 'Data' }), locale);
  return (fact) => {
    if (fact.kind === 'project') return projectsData.find((p) => p.id === fact.projectId)?.name;
    if (fact.kind === 'journey') {
      const entry = journeyData.find((j) => j.id === fact.journeyId);
      return entry ? localizeJourneyEntry(entry, t, locale).title : undefined;
    }
    return undefined;
  };
}

// ── Commit on first output ──────────────────────────────────────────────────
// Pull the first event before committing the status line: up to then a
// failure is still ours to report as JSON with a real status. The prelude
// (our own `meta`) is sent once the model has produced something.
async function respond(events, req, prelude) {
  const first = await events.next();
  // `done` as the FIRST event means the model produced nothing at all: that
  // is a failure, and must not be committed as an empty 200.
  if (first.done || first.value?.type === 'done') {
    const err = new Error('model stream ended before any output');
    err.name = 'EmptyStreamError';
    throw err;
  }
  const encoder = new TextEncoder();
  const send = (controller, event) => controller.enqueue(encoder.encode(encodeEvent(event)));
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of prelude) send(controller, event);
        send(controller, first.value);
      },
      async pull(controller) {
        try {
          const next = await events.next();
          if (next.done) return controller.close();
          send(controller, next.value);
        } catch (err) {
          // After the 200 the only honest signal left is a terminal event.
          if (!req.signal.aborted) {
            console.error('ask stream failed', { name: err?.name, statusCode: err?.statusCode });
            send(controller, { type: 'error', code: 'failed' });
          }
          controller.close();
        }
      },
      cancel() {
        return events.return?.();
      },
    }),
    {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}

function failure(err, req) {
  if (err?.name === 'AbortError' || req.signal.aborted) {
    return json({ error: 'aborted', message: 'Request cancelled.' }, 499);
  }
  const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : undefined;
  if (statusCode === 429) {
    return json({ error: 'rate_limited', message: 'Too many questions — try again in a moment.' }, 429);
  }
  if (statusCode === 402) return json({ error: 'budget', message: 'Ask is resting for today.' }, 429);
  // Structural fields only: AI SDK errors can carry the provider's request
  // body in `.message`, and that body holds the visitor's text.
  console.error('ask failed', { name: err?.name, statusCode });
  if (statusCode === 401 || statusCode === 403) {
    return json({ error: 'unavailable', message: 'Ask is not available right now.' }, 503);
  }
  return json({ error: 'failed', message: 'Could not answer. Please try again.' }, 500);
}

export async function POST(req) {
  // On Vercel the OIDC token arrives per request, so VERCEL=1 counts as
  // configured; locally either a key or a pulled OIDC token is needed.
  const gatewayConfigured =
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL === '1';
  if (!gatewayConfigured) {
    return json({ error: 'unconfigured', message: 'Ask is not available right now.' }, 503);
  }

  // Throttle before reading the body or touching the model.
  const visitor = await checkAskRateLimit(clientIp(req));
  if (!visitor.ok) {
    return json(
      { error: 'rate_limited', message: 'Too many questions — try again in a moment.' },
      429,
      { 'Retry-After': String(visitor.retryAfterSeconds) },
    );
  }

  const read = await readJsonBody(req, { maxBytes: MAX_BODY_BYTES });
  if (!read.ok) {
    return read.status === PAYLOAD_TOO_LARGE
      ? json({ error: 'too_large', message: 'Request is too large.' }, 413)
      : json({ error: 'bad_request', message: 'Invalid request.' }, 400);
  }
  const { body } = read;
  const mode = body?.mode === 'fit' ? 'fit' : 'ask';
  const locale = LOCALE_CODES.includes(body?.locale) ? body.locale : 'en';

  let input;
  if (mode === 'fit') {
    const job = normaliseJob(body?.job);
    if (job.length < FIT_LIMITS.minLen || job.length > FIT_LIMITS.maxLen) {
      return json(
        { error: job.length > FIT_LIMITS.maxLen ? 'too_long' : 'too_short', message: 'That job description cannot be checked.' },
        400,
      );
    }
    input = { job };
  } else {
    const question = normaliseQuestion(body?.question);
    if (!askable(question)) {
      return json(
        { error: question.length > ASK_LIMITS.maxLen ? 'too_long' : 'too_short', message: 'That question cannot be asked.' },
        400,
      );
    }
    const path = typeof body?.path === 'string' && body.path.length <= PATH_MAX ? body.path : null;
    input = { question, path, history: sanitiseHistory(body?.history) };
  }

  // The daily breaker is checked only for valid input, so a malformed flood
  // spends the per-visitor window but not everyone's daily budget.
  const budget = await checkDailyBudget(Date.now(), undefined, mode === 'fit' ? FIT_LIMITS.budgetWeight : 1);
  if (!budget.ok) {
    return json(
      { error: 'budget', message: 'Ask is resting for today.' },
      429,
      { 'Retry-After': String(budget.retryAfterSeconds) },
    );
  }

  try {
    const label = await sourceLabeller(locale);
    const prelude = [{ type: 'meta', facts: FACTS.length, model: MODEL }];

    if (mode === 'fit') {
      const result = streamText({
        model: MODEL,
        instructions: cachedInstructions(FIT_INSTRUCTIONS),
        prompt: fitTurn({ job: input.job, locale }),
        output: Output.array({ element: FIT_ROW, maxItems: FIT_LIMITS.maxRows }),
        reasoning: 'none',
        maxOutputTokens: FIT_MAX_OUTPUT_TOKENS,
        abortSignal: req.signal,
        providerOptions: { gateway: { tags: ['feature:ask-fit'] } },
      });
      return await respond(fitEvents(result.elementStream, { label }), req, prelude);
    }

    const result = streamText({
      model: MODEL,
      instructions: cachedInstructions(INSTRUCTIONS),
      messages: [
        ...historyMessages(input.history),
        { role: 'user', content: userTurn({ question: input.question, locale, path: input.path }) },
      ],
      tools: { ...createLiveTools(), suggest_followups: suggestFollowups },
      toolChoice: 'auto',
      // The loop ends when the follow-ups are offered (the instructions make
      // that the last act), or after MAX_STEPS model calls whatever happens.
      stopWhen: [isStepCount(MAX_STEPS), hasToolCall('suggest_followups')],
      // No thinking before a short, grounded answer. Measured against the
      // gateway (2026-11-09, claude-haiku-5.5, same question): the provider
      // default spent 217 output tokens, mostly reasoning the visitor never
      // sees; 'none' spent 92. No `temperature`: this model ignores it and
      // warns on every call.
      reasoning: 'none',
      maxOutputTokens: ASK_MAX_OUTPUT_TOKENS,
      abortSignal: req.signal,
      providerOptions: { gateway: { tags: ['feature:ask'] } },
    });
    return await respond(askEvents(result.stream, { label }), req, prelude);
  } catch (err) {
    return failure(err, req);
  }
}
