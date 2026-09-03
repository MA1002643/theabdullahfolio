// Server-side rate limits for the guestbook (issue #40 §4). Two limits, each
// with two implementations behind one call, chosen the same way the store
// picks its driver:
//
//   POSTING — 1 message per user per 5 minutes, keyed by username.
//     redis available → @upstash/ratelimit sliding window under guestbook:rl:
//                       — survives serverless cold starts and concurrent
//                       instances, which an in-memory map can't.
//     json (dev) mode  → scan the stored messages for the user's newest entry,
//                       and RESERVE the slot in memory on admission (see
//                       checkRateLimit) so two concurrent posts by one user
//                       cannot both pass the check before either is written.
//                       Single-process by design, like the json driver itself.
//
//   PRESENCE HEARTBEATS — PRESENCE_BEATS_PER_MINUTE per client IP (hashed),
//     because /api/guestbook/presence is unauthenticated by design and every
//     unique id it accepts is a Redis write: without a ceiling, one script
//     looping over random ids could inflate "N here now" without bound and
//     keep Redis busy for as long as it liked. A legitimate tab beats every
//     15s (4/min, plus one on each return to the tab), so the budget fits a
//     handful of tabs per household and caps an attacker's phantom presence
//     at the budget per IP per minute.
//     redis available → the same sliding window under guestbook:rl:presence:,
//                       with the library's in-process cache of denied keys so
//                       a flood costs Redis nothing after its first denial.
//     otherwise        → a module-scoped sliding window (mirrors presence.js's
//                       own dev fallback).
//
// Both return { ok: true } or { ok: false, retryAfterSeconds } — the routes
// turn the latter into a 429 the client can phrase honestly ("try again in
// 3m") or, for presence, simply skip until the next beat.
import { createHash } from 'node:crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { redis, redisAvailable } from './redisDriver';
import { getMessages } from './store';

export const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
export const PRESENCE_BEATS_PER_MINUTE = 30;
export const PRESENCE_LIMIT_WINDOW_MS = 60 * 1000;

const limiter = redisAvailable
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1, '5 m'),
      prefix: 'guestbook:rl',
    })
  : null;

// Pure helper (exported for unit tests): given the stored messages, when did
// `username` last post, in ms since epoch — or null if they never have.
export function latestPostTime(messages, username) {
  let latest = null;
  for (const m of messages) {
    if (m?.author?.username !== username) continue;
    const t = new Date(m.createdAt).getTime();
    if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
  }
  return latest;
}

// JSON path reservations: username → the `now` at which a check ADMITTED them.
// The stored messages are the source of truth, but two requests can both read
// them before either writes — a classic check-then-act race that would let one
// user land two messages inside the window. So an admitted check also reserves
// the slot here, and the check-and-reserve below runs in ONE synchronous
// section after the file read (no await between the read resolving and the
// set): on a single Node process — the only shape the json driver is coherent
// in — that is atomic, so the second of two concurrent posts always sees the
// first's reservation. This mirrors the Redis limiter, whose limit() consumes
// the token at check time; like it, an admission whose insert then fails
// still holds the slot (fail closed). Reservations age out with the window.
const jsonReservations = new Map();

export async function checkRateLimit(username, now = Date.now()) {
  if (limiter && process.env.GUESTBOOK_DRIVER !== 'json') {
    const { success, reset } = await limiter.limit(username);
    if (success) return { ok: true };
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((reset - now) / 1000)),
    };
  }

  const stored = latestPostTime(await getMessages(), username);
  // ── synchronous from here to the return: check + reserve, no await ──
  for (const [user, at] of jsonReservations) {
    if (now - at >= RATE_LIMIT_WINDOW_MS) jsonReservations.delete(user);
  }
  const reserved = jsonReservations.get(username) ?? null;
  const latest =
    stored === null ? reserved : reserved === null ? stored : Math.max(stored, reserved);
  if (latest === null || now - latest >= RATE_LIMIT_WINDOW_MS) {
    jsonReservations.set(username, now);
    return { ok: true };
  }
  return {
    ok: false,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((latest + RATE_LIMIT_WINDOW_MS - now) / 1000),
    ),
  };
}

// Follows presence.js (redisAvailable alone, not GUESTBOOK_DRIVER): the
// limiter must live in the same backend as the presence set it guards.
const presenceLimiter = redisAvailable
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(PRESENCE_BEATS_PER_MINUTE, '1 m'),
      prefix: 'guestbook:rl:presence',
      ephemeralCache: new Map(),
    })
  : null;

// Dev fallback: key → ascending beat timestamps still inside the window.
const presenceMemory = new Map();
const PRESENCE_MEMORY_SWEEP_AT = 500;

// Presence is anonymous by construction (see the route), so the limiter never
// stores a raw address either: the key is a truncated SHA-256 of the IP —
// stable within the window, meaningless outside it.
export function presenceLimitKey(ip) {
  return createHash('sha256')
    .update(String(ip || 'unknown'))
    .digest('base64url')
    .slice(0, 22);
}

export async function checkPresenceRateLimit(ip, now = Date.now()) {
  const key = presenceLimitKey(ip);

  if (presenceLimiter) {
    const { success, reset } = await presenceLimiter.limit(key);
    if (success) return { ok: true };
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((reset - now) / 1000)),
    };
  }

  if (presenceMemory.size > PRESENCE_MEMORY_SWEEP_AT) {
    for (const [k, beats] of presenceMemory) {
      if (now - beats[beats.length - 1] >= PRESENCE_LIMIT_WINDOW_MS) {
        presenceMemory.delete(k);
      }
    }
  }

  const beats = (presenceMemory.get(key) || []).filter(
    (t) => now - t < PRESENCE_LIMIT_WINDOW_MS,
  );
  if (beats.length >= PRESENCE_BEATS_PER_MINUTE) {
    presenceMemory.set(key, beats);
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((beats[0] + PRESENCE_LIMIT_WINDOW_MS - now) / 1000),
      ),
    };
  }
  beats.push(now);
  presenceMemory.set(key, beats);
  return { ok: true };
}
