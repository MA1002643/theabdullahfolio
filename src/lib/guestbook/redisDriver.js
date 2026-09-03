// Production storage driver: Upstash Redis over REST, the same instance and
// client idiom the live-location footer already uses (src/utils/liveLocation.js)
// — KV_REST_API_* names are what the Vercel/Upstash integration injects, the
// UPSTASH_* names are the fallback for a direct setup. Everything lives under
// the `guestbook:` namespace so it can never collide with the footer keys.
//
// Data model:
//   guestbook:ids        ZSET  score = createdAt (ms), member = message id
//   guestbook:msg:<id>   JSON  the full message object (client auto-serialises)
//
// The ZSET is the index: a reverse range walk is "newest first" for free, and
// ZREM + DEL is a clean two-step delete.
import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Null when unconfigured (e.g. a preview without KV linked). Every method
// below dereferences it unguarded, so the invariant lives in store.js: it
// auto-selects this driver only when the env is present, and REFUSES TO LOAD
// (a named-variable error, not a fallback) when GUESTBOOK_DRIVER=redis forces
// it without credentials. `redisAvailable` lets the rate limiter and presence
// make the same call without re-deriving the env.
export const redis = url && token ? new Redis({ url, token }) : null;
export const redisAvailable = Boolean(redis);

const IDS_KEY = 'guestbook:ids';
const msgKey = (id) => `guestbook:msg:${id}`;
const reactionsKey = (id) => `guestbook:reactions:${id}`;

export const redisDriver = {
  async getMessages() {
    const ids = await redis.zrange(IDS_KEY, 0, -1, { rev: true });
    if (!ids.length) return [];
    const rows = await redis.mget(...ids.map(msgKey));
    // A row can be null if a delete raced the index read; drop those rather
    // than surfacing holes to the wall.
    return rows.filter(Boolean);
  },

  async addMessage(message) {
    const score = new Date(message.createdAt).getTime();
    const p = redis.pipeline();
    p.set(msgKey(message.id), message);
    p.zadd(IDS_KEY, { score, member: message.id });
    await p.exec();
    return message;
  },

  async deleteMessage(id) {
    const removed = await redis.zrem(IDS_KEY, id);
    await redis.del(msgKey(id), reactionsKey(id));
    return removed > 0;
  },

  // Reactions: one HASH per message, field = username, value = reaction key —
  // HSET/HDEL make "one reaction per user per message" a property of the data
  // structure, not bookkeeping.
  async getReactions(ids) {
    if (!ids.length) return {};
    const p = redis.pipeline();
    for (const id of ids) p.hgetall(reactionsKey(id));
    const rows = await p.exec();
    const byId = {};
    ids.forEach((id, i) => {
      byId[id] = rows[i] || {};
    });
    return byId;
  },

  async setReaction(id, username, key) {
    // Guard against reacting to a deleted/never-existent message — the
    // reactions hash must not outlive (or precede) its message.
    const exists = await redis.exists(msgKey(id));
    if (!exists) return null;
    if (key === null) await redis.hdel(reactionsKey(id), username);
    else await redis.hset(reactionsKey(id), { [username]: key });
    return (await redis.hgetall(reactionsKey(id))) || {};
  },
};
