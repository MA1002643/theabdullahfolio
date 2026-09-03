// Server-side posting rate limit: 1 message per user per 5 minutes (issue #40
// §4). Two implementations behind one call, chosen the same way the store
// picks its driver:
//
//   redis available → @upstash/ratelimit sliding window, keyed by username
//                     under guestbook:rl: — survives serverless cold starts
//                     and concurrent instances, which an in-memory map can't.
//   json (dev) mode → scan the stored messages for the user's newest entry;
//                     good enough for a single local process.
//
// Returns { ok: true } or { ok: false, retryAfterSeconds } — the route turns
// the latter into a 429 the client can phrase honestly ("try again in 3m").
import { Ratelimit } from '@upstash/ratelimit';
import { redis, redisAvailable } from './redisDriver';
import { getMessages } from './store';

export const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

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

export async function checkRateLimit(username, now = Date.now()) {
  if (limiter && process.env.GUESTBOOK_DRIVER !== 'json') {
    const { success, reset } = await limiter.limit(username);
    if (success) return { ok: true };
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((reset - now) / 1000)),
    };
  }

  const latest = latestPostTime(await getMessages(), username);
  if (latest === null || now - latest >= RATE_LIMIT_WINDOW_MS) {
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
