// Cost and abuse controls for /api/ask (issue #41 §4.5). Two independent gates:
//
//   PER VISITOR — ASK_PER_MINUTE questions per minute per client IP, HASHED:
//     the key is a truncated SHA-256 of the address, stable inside the window
//     and meaningless outside it, so no raw IP is ever written anywhere.
//     redis available → @upstash/ratelimit sliding window under ask:rl:, with
//                       the in-process cache of denied keys, so a flood costs
//                       Redis nothing after its first denial;
//     otherwise        → a module-scoped sliding window (dev, tests).
//
//   GLOBAL, PER DAY — a circuit breaker on total spend. One anonymous counter
//     per UTC day (`ask:day:YYYY-MM-DD`, INCR + a 2-day TTL), refused past
//     ASK_DAILY_LIMIT. A per-IP limit alone cannot bound cost: a botnet has as
//     many IPs as it likes. This can, whatever the traffic looks like.
//     redis available → the shared counter; otherwise an in-memory one.
//
// The in-memory fallbacks are for `next dev` and the test runner ONLY. On a
// serverless deployment every instance has its own module scope and loses it
// on a cold start, so an in-memory "daily" counter is really a per-instance,
// per-boot counter: scaling out or restarting multiplies ASK_DAILY_LIMIT, and
// the breaker no longer bounds spend at all. Anywhere else, with no Redis,
// both gates FAIL CLOSED (reason 'unconfigured'), and /api/ask refuses before
// reading the body (`askLimitsEnforceable`). Same rule, same reason, as the
// guestbook's refusal of its file store in production (guestbook/store.js).
//
// Both answer { ok: true } or { ok: false, reason, retryAfterSeconds? }.
// Disclosed in src/lib/privacy/inventory.js (SERVER_DATA, rate-limit row).
import { createHash } from 'node:crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { redis, redisAvailable } from '@/lib/guestbook/redisDriver';

export const ASK_PER_MINUTE = 6;
export const ASK_WINDOW_MS = 60 * 1000;
export const DEFAULT_DAILY_LIMIT = 300;

/** The configured daily ceiling: ASK_DAILY_LIMIT, or the default. */
export function dailyLimit(env = process.env) {
  const n = Number.parseInt(env.ASK_DAILY_LIMIT ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
}

/**
 * Whether process-local counters may stand in for Redis: only under
 * `next dev` (NODE_ENV=development) and the test runner (NODE_ENV=test).
 * Anything else, including an unset NODE_ENV, counts as deployed: fail closed.
 */
export function inMemoryLimitsAllowed(env = process.env) {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
}

/**
 * Whether the Ask limits can actually hold here: shared storage, or an
 * environment where per-process counting is acceptable. Read per call, not at
 * module load, so `next build` (which evaluates the route module under
 * NODE_ENV=production, with no credentials in CI) is unaffected.
 */
export function askLimitsEnforceable(env = process.env, shared = redisAvailable) {
  return shared || inMemoryLimitsAllowed(env);
}

const UNCONFIGURED = Object.freeze({ ok: false, reason: 'unconfigured' });

export function askLimitKey(ip) {
  return createHash('sha256')
    .update(`ask:${ip || 'unknown'}`)
    .digest('base64url')
    .slice(0, 22);
}

const limiter = redisAvailable
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ASK_PER_MINUTE, '1 m'),
      prefix: 'ask:rl',
      ephemeralCache: new Map(),
    })
  : null;

const memory = new Map();

function memoryWindow(key, now) {
  if (memory.size > 500) {
    for (const [k, hits] of memory) {
      if (now - hits[hits.length - 1] >= ASK_WINDOW_MS) memory.delete(k);
    }
  }
  const hits = (memory.get(key) || []).filter((t) => now - t < ASK_WINDOW_MS);
  if (hits.length >= ASK_PER_MINUTE) {
    memory.set(key, hits);
    return {
      ok: false,
      reason: 'rate_limited',
      retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + ASK_WINDOW_MS - now) / 1000)),
    };
  }
  hits.push(now);
  memory.set(key, hits);
  return { ok: true };
}

export async function checkAskRateLimit(ip, now = Date.now()) {
  const key = askLimitKey(ip);
  if (limiter) {
    const { success, reset } = await limiter.limit(key);
    if (success) return { ok: true };
    return {
      ok: false,
      reason: 'rate_limited',
      retryAfterSeconds: Math.max(1, Math.ceil((reset - now) / 1000)),
    };
  }
  if (!inMemoryLimitsAllowed()) return UNCONFIGURED;
  return memoryWindow(key, now);
}

const dayKey = (now) => `ask:day:${new Date(now).toISOString().slice(0, 10)}`;
const secondsToUtcMidnight = (now) => {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now) / 1000));
};

let memoryDay = { key: '', count: 0 };

/**
 * Counts one question (a fit check counts `weight` of them) against today's
 * budget and says whether it fits. The
 * count is taken BEFORE the model is called, so a refused question is still
 * counted: a flood keeps the breaker open rather than probing it.
 */
export async function checkDailyBudget(now = Date.now(), limit = dailyLimit(), weight = 1) {
  const key = dayKey(now);
  const units = Number.isInteger(weight) && weight > 0 ? weight : 1;
  let count;
  if (redisAvailable) {
    count = await redis.incrby(key, units);
    // Two days, not one: the key must outlive the whole of its own UTC day
    // wherever in it the first question landed.
    if (count === units) await redis.expire(key, 2 * 24 * 60 * 60);
  } else {
    // A per-instance count would not cap the deployment's spend (see the
    // module note), so outside dev and tests there is no budget to grant.
    if (!inMemoryLimitsAllowed()) return UNCONFIGURED;
    if (memoryDay.key !== key) memoryDay = { key, count: 0 };
    memoryDay.count += units;
    count = memoryDay.count;
  }
  if (count <= limit) return { ok: true };
  return { ok: false, reason: 'budget', retryAfterSeconds: secondsToUtcMidnight(now) };
}

/** Test seam. */
export function resetAskLimits() {
  memory.clear();
  memoryDay = { key: '', count: 0 };
}
