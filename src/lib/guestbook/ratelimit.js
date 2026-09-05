// Server-side rate limits for the guestbook (issue #40 §4). Three limits, each
// with two implementations behind one call, chosen the same way the store
// picks its driver:
//
//   POSTING — 1 message per user per 5 minutes, keyed by the session's
//     identity key (identity.js: the provider account id — never the login,
//     which a rename would turn into a fresh, empty budget).
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
//   REACTIONS — REACTIONS_PER_MINUTE per user (the session's identity key), because
//     /api/guestbook/reactions is an authenticated mutation that costs a Redis
//     script per call and, unlike posting and presence, was unmetered: one
//     valid session toggling a reaction in a loop could generate unbounded
//     Redis and server traffic. A person clicking through the wall reacts a
//     few times a minute; the budget is generous for that and a hard ceiling
//     for a script. Checked AFTER validation (a malformed body spends nothing)
//     and BEFORE the write (a denied call costs the store nothing).
//     redis available → the same sliding window under guestbook:rl:reactions:,
//                       with the in-process denied-key cache — unless the data
//                       is pinned to the json driver, in which case the
//                       limiter stays in memory beside it (the posting rule).
//     otherwise        → a module-scoped sliding window, like presence.
//
// All three return { ok: true } or { ok: false, retryAfterSeconds } — the
// routes turn the latter into a 429 the client can phrase honestly ("try
// again in 3m") or, for presence, simply skip until the next beat.
import { createHash } from 'node:crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { redis, redisAvailable } from './redisDriver';
import { getMessages } from './store';
import { authorKey } from './identity';

export const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
export const PRESENCE_BEATS_PER_MINUTE = 30;
export const PRESENCE_LIMIT_WINDOW_MS = 60 * 1000;
export const REACTIONS_PER_MINUTE = 30;
export const REACTION_LIMIT_WINDOW_MS = 60 * 1000;

const limiter = redisAvailable
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1, '5 m'),
      prefix: 'guestbook:rl',
    })
  : null;

// Pure helper (exported for unit tests): given the stored messages, when did
// the author keyed `userKey` last post, in ms since epoch — or null if they
// never have. Compared on the stored author's KEY (authorKey — the legacy
// Google form included), never on the login beside it.
export function latestPostTime(messages, userKey) {
  let latest = null;
  for (const m of messages) {
    if (authorKey(m?.author) !== userKey) continue;
    const t = new Date(m.createdAt).getTime();
    if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
  }
  return latest;
}

// JSON path reservations: user key → the `now` at which a check ADMITTED them.
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

export async function checkRateLimit(userKey, now = Date.now()) {
  if (limiter && process.env.GUESTBOOK_DRIVER !== 'json') {
    const { success, reset } = await limiter.limit(userKey);
    if (success) return { ok: true };
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((reset - now) / 1000)),
    };
  }

  const stored = latestPostTime(await getMessages(), userKey);
  // ── synchronous from here to the return: check + reserve, no await ──
  for (const [user, at] of jsonReservations) {
    if (now - at >= RATE_LIMIT_WINDOW_MS) jsonReservations.delete(user);
  }
  const reserved = jsonReservations.get(userKey) ?? null;
  const latest =
    stored === null ? reserved : reserved === null ? stored : Math.max(stored, reserved);
  if (latest === null || now - latest >= RATE_LIMIT_WINDOW_MS) {
    jsonReservations.set(userKey, now);
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

// Dev fallback for the per-minute windows: key → ascending hit timestamps
// still inside the window. ONE helper behind both in-memory limiters
// (presence, reactions) so their semantics cannot drift: over budget is a
// refusal with the seconds until the OLDEST hit ages out; an admitted hit is
// recorded; a store that has grown past the sweep mark drops keys whose last
// hit is already outside the window.
const MEMORY_SWEEP_AT = 500;

function memoryWindow(store, key, { limit, windowMs, now }) {
  if (store.size > MEMORY_SWEEP_AT) {
    for (const [k, hits] of store) {
      if (now - hits[hits.length - 1] >= windowMs) store.delete(k);
    }
  }
  const hits = (store.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    store.set(key, hits);
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((hits[0] + windowMs - now) / 1000),
      ),
    };
  }
  hits.push(now);
  store.set(key, hits);
  return { ok: true };
}

const presenceMemory = new Map();

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

  return memoryWindow(presenceMemory, key, {
    limit: PRESENCE_BEATS_PER_MINUTE,
    windowMs: PRESENCE_LIMIT_WINDOW_MS,
    now,
  });
}

// Reactions: keyed by the session's identity key — the identity the write
// itself is bound to — so a budget follows the person, not the address (and
// not the login, which a rename would reset).
const reactionLimiter = redisAvailable
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(REACTIONS_PER_MINUTE, '1 m'),
      prefix: 'guestbook:rl:reactions',
      ephemeralCache: new Map(),
    })
  : null;

const reactionMemory = new Map();

export async function checkReactionRateLimit(userKey, now = Date.now()) {
  // The posting rule, not the presence one: the limiter lives where the
  // reactions do, so an explicit json driver (the e2e's hermetic server)
  // keeps it in memory even when Redis credentials happen to be present.
  if (reactionLimiter && process.env.GUESTBOOK_DRIVER !== 'json') {
    const { success, reset } = await reactionLimiter.limit(userKey);
    if (success) return { ok: true };
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((reset - now) / 1000)),
    };
  }

  return memoryWindow(reactionMemory, userKey, {
    limit: REACTIONS_PER_MINUTE,
    windowMs: REACTION_LIMIT_WINDOW_MS,
    now,
  });
}
