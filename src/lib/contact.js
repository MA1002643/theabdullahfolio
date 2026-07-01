// Shared contact-form logic used by both the live form and the offline-queue
// flush: the network call, the localStorage keys/helpers for the autosaved draft
// and the offline send queue, and the DOM helper that writes a value into an
// uncontrolled field the way the Fire overlays can see.

export const DRAFT_KEY = 'contact:draft:v1';
export const QUEUE_KEY = 'contact:queue:v1';
// Drafts older than this are ignored on restore — a week-old half-message is
// almost certainly abandoned, and silently repopulating it would be surprising.
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const DRAFT_FIELDS = ['name', 'email', 'subject', 'message'];

// Hard ceiling on a single send. Without it, a stalled /api/send-mail leaves the
// live form spinning and the offline-queue flush blocked indefinitely. A timeout
// is treated like a transport failure below (→ network: true) so the message is
// queued for retry rather than lost.
const REQUEST_TIMEOUT_MS = 15000;

// Write `value` into an <input>/<textarea> through the prototype's value setter,
// NOT `el.value = ...`. React tracks a node's value internally; assigning
// `.value` directly is invisible to React, so the subsequent `input` event would
// be ignored by react-hook-form. Going through the native setter updates React's
// tracker too, so dispatching `input` afterwards drives BOTH react-hook-form's
// onChange AND the FireInput/FireTextarea overlay's own input listener — the one
// mechanism that keeps the model and the painted gradient text in sync.
export function setNativeValue(el, value) {
  // No DOM (SSR/tests) → nothing to write and nothing to dispatch into, so the
  // whole helper is a no-op. This also guards the `window.HTMLInputElement`
  // fallback below, which would otherwise throw when `window` is undefined.
  if (!el || typeof window === 'undefined') return;
  const proto =
    el instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// A stable per-message idempotency key. Generated ONCE when a message is first
// composed and persisted with the queued item, so the live send and every
// offline retry of that same message carry the SAME key. That lets the server
// recognise a retry of an already-delivered message — one whose success response
// was lost to a timeout or a dropped connection — and skip mailing it twice.
// Prefer the crypto UUID; fall back for older browsers / non-secure contexts
// where `crypto.randomUUID` is unavailable.
export function newIdempotencyKey() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the manual fallback */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// POST a contact message. Returns a discriminated result instead of toasting so
// callers (the live form vs. the background queue flush) can react differently:
//   { ok: true }                     — delivered
//   { ok: false, errors: [...] }     — server rejected it (validation etc.)
//   { ok: false, network: true }     — transient: the request never reached the
//                                      server (offline / DNS / connection reset),
//                                      OR the server is mid-send for this key and
//                                      asked us to retry → queue
//   { ok: false, aborted: true }     — caller aborted the request
export async function postContactMessage(params, signal) {
  // Compose the caller's signal (if any) with our own timeout-driven abort so
  // BOTH callers — the live form and the queue flush — get the same bounded
  // request without each having to wire a timeout. Manual composition (rather
  // than AbortSignal.any/.timeout) keeps this working on older browsers.
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onCallerAbort, { once: true });
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  // The idempotency key rides alongside the message fields in `params` (so it's
  // persisted with the queued item and reused on every retry), but it travels in
  // a header rather than the body: the server reads it to dedupe, while the body
  // stays exactly the validated message payload.
  const { idempotencyKey, ...fields } = params;
  try {
    const res = await fetch('/api/send-mail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(fields),
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (res.ok && data?.success) return { ok: true };
    // The server holds a PENDING claim for this idempotency key — another attempt
    // is still in flight. The message is NOT delivered yet, so treat this like a
    // transport failure (keep it queued and retry) rather than a hard rejection
    // that would drop it. Reuses the `network` path both callers already re-queue.
    if (!res.ok && data?.retryable) return { ok: false, network: true };
    // Any 5xx is a transient server-side failure (e.g. the SMTP send threw). The
    // route releases the idempotency claim on such failures specifically so a
    // retry can re-send, so honour that here: queue and retry rather than drop.
    // 4xx stays a hard rejection below (validation etc. fails the same on retry).
    if (res.status >= 500) return { ok: false, network: true };
    const errors = data?.errors ?? (data?.error ? [data.error] : ['Failed to send message']);
    return { ok: false, errors };
  } catch (err) {
    if (err?.name === 'AbortError') {
      // Our timeout fired → treat it as a transport failure so it gets queued
      // and retried later. A genuine caller-initiated abort stays `aborted`.
      if (timedOut) return { ok: false, network: true };
      return { ok: false, aborted: true };
    }
    // A thrown fetch means the request never completed at the transport layer —
    // offline, connection dropped, etc. Distinct from a server error response.
    return { ok: false, network: true };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onCallerAbort);
  }
}

export function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — nothing we can do, fail silently */
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
