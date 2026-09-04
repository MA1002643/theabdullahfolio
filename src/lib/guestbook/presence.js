// Live presence for the guestbook (issue #40 Phase 4): "N here now", counted
// from anonymous heartbeat ids seen in the last minute. Ephemeral by nature,
// so it does NOT ride the message store's driver contract:
//   redis → ZSET guestbook:presence (member = anon id, score = last-seen ms);
//           prune-then-count keeps it self-cleaning, and the key expires
//           outright if the page goes quiet.
//   dev   → a module-scoped Map — correct for the single local process, and
//           never used in production (store.js's env logic picks redis there).
//
// The abuse ceiling lives at the route: heartbeats are rate-limited per client
// IP BEFORE heartbeat() is called (ratelimit.js → checkPresenceRateLimit), so
// this module can stay a plain register-and-count. That is its whole surface:
// the heartbeat's reply IS the read. A separate count-only read used to live
// here for the route's GET; both went together (code review — an unmetered
// Redis prune + count per call), so every Redis touch this module makes now
// sits behind the limiter.
import { redis, redisAvailable } from './redisDriver';

export const PRESENCE_WINDOW_MS = 60 * 1000;
const PRESENCE_KEY = 'guestbook:presence';

const memory = new Map(); // anonId → last-seen ms (dev fallback)

export async function heartbeat(anonId, now = Date.now()) {
  if (redisAvailable) {
    const p = redis.pipeline();
    p.zadd(PRESENCE_KEY, { score: now, member: anonId });
    p.zremrangebyscore(PRESENCE_KEY, 0, now - PRESENCE_WINDOW_MS);
    p.zcard(PRESENCE_KEY);
    p.expire(PRESENCE_KEY, Math.ceil((PRESENCE_WINDOW_MS / 1000) * 2));
    const results = await p.exec();
    return { count: Number(results[2]) || 1 };
  }

  memory.set(anonId, now);
  for (const [id, seen] of memory) {
    if (now - seen > PRESENCE_WINDOW_MS) memory.delete(id);
  }
  return { count: memory.size };
}
