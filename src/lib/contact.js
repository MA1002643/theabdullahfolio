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

// Write `value` into an <input>/<textarea> through the prototype's value setter,
// NOT `el.value = ...`. React tracks a node's value internally; assigning
// `.value` directly is invisible to React, so the subsequent `input` event would
// be ignored by react-hook-form. Going through the native setter updates React's
// tracker too, so dispatching `input` afterwards drives BOTH react-hook-form's
// onChange AND the FireInput/FireTextarea overlay's own input listener — the one
// mechanism that keeps the model and the painted gradient text in sync.
export function setNativeValue(el, value) {
  if (!el) return;
  const proto =
    typeof window !== 'undefined' && el instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// POST a contact message. Returns a discriminated result instead of toasting so
// callers (the live form vs. the background queue flush) can react differently:
//   { ok: true }                     — delivered
//   { ok: false, errors: [...] }     — server rejected it (validation etc.)
//   { ok: false, network: true }     — the request never reached the server
//                                      (offline / DNS / connection reset) → queue
//   { ok: false, aborted: true }     — caller aborted the request
export async function postContactMessage(params, signal) {
  try {
    const res = await fetch('/api/send-mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (res.ok && data?.success) return { ok: true };
    const errors = data?.errors ?? (data?.error ? [data.error] : ['Failed to send message']);
    return { ok: false, errors };
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, aborted: true };
    // A thrown fetch means the request never completed at the transport layer —
    // offline, connection dropped, etc. Distinct from a server error response.
    return { ok: false, network: true };
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
