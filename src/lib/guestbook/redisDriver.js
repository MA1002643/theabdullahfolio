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
// The ZSET is the index: a reverse range walk is "newest first" for free
// (score desc, then member desc — the order paging.js defines), a score-bounded
// walk is a cursor page in O(log N + limit), ZCARD is the count in O(1), and
// ZREM + DEL is a clean two-step delete.
import { Redis } from '@upstash/redis';
import { positionOf } from './paging';

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

// A second client over the same credentials with the auto-deserialiser OFF,
// for the reaction script only. The script answers with HGETALL's flat
// field/value array, and the default client JSON-parses every array element
// it can — so a numeric-looking login ("123", "1e5") would come back as a
// number, and be a different key by the time it became an object property.
// Raw strings in, raw strings out; the driver builds the map itself.
const rawRedis =
  url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;

const IDS_KEY = 'guestbook:ids';
const msgKey = (id) => `guestbook:msg:${id}`;
const reactionsKey = (id) => `guestbook:reactions:${id}`;

// The reaction check-and-write as ONE server-side step. EXISTS and HSET used
// to be separate round trips, so a concurrent delete could remove the message
// between them and the HSET would recreate an orphan reactions hash — the
// very invariant the check claimed to enforce. Redis runs a script atomically:
// nothing interleaves between the existence check, the write and the
// read-back. KEYS = [message key, reactions hash]; ARGV = [username, reaction
// key — or '' to clear]. Replies nil when the message is gone, else the hash
// as HGETALL's flat array.
const SET_REACTION_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return nil
end
if ARGV[2] == '' then
  redis.call('HDEL', KEYS[2], ARGV[1])
else
  redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
end
return redis.call('HGETALL', KEYS[2])
`;

// EVALSHA first, EVAL on a NOSCRIPT miss — the client's Script handles that.
const setReactionScript = rawRedis
  ? rawRedis.createScript(SET_REACTION_LUA)
  : null;

// HGETALL's [field, value, field, value, …] → { field: value }.
function hashFromFlat(flat) {
  const map = {};
  for (let i = 0; i + 1 < flat.length; i += 2) {
    map[String(flat[i])] = String(flat[i + 1]);
  }
  return map;
}

// Fetch the JSON rows for a list of ids, in that order. A row can be null if
// a delete raced the index read; drop those rather than surfacing holes.
async function rowsFor(ids) {
  if (!ids.length) return [];
  const rows = await redis.mget(...ids.map(msgKey));
  return rows.filter(Boolean);
}

export const redisDriver = {
  // FULL SCAN — kept for the driver contract only; no route calls it (the
  // wall's GET pages through listMessages, the rate limiter uses
  // @upstash/ratelimit on this backend). Every read here is unbounded in the
  // wall's size, which is exactly what the paged read exists to avoid.
  async getMessages() {
    const ids = await redis.zrange(IDS_KEY, 0, -1, { rev: true });
    return rowsFor(ids);
  },

  // Cursor-paged read (the wall's GET): newest first, at most `limit`, from
  // strictly after position `after` (paging.js; null = from the top). Costs
  // two or three bounded commands whatever the wall's size: the index walk,
  // one MGET of `limit` rows — never the whole set.
  async listMessages({ limit, after = null }) {
    // Ask the index for one id beyond the page: its presence is the "more
    // exists" signal, so `next` needs no extra command.
    const want = limit + 1;
    let ids;
    if (!after) {
      ids = await redis.zrange(IDS_KEY, 0, want - 1, { rev: true });
    } else {
      // REV order is score desc, then member desc, so "strictly after the
      // cursor" is (a) the members that SHARE its score and sort below its
      // id, then (b) every member with a lower score. Two index reads in one
      // pipeline. (a) is non-empty only when two people posted in the same
      // millisecond — rare, but an exclusive score bound alone would skip
      // those messages on every page boundary, forever. Under REV the client
      // forwards the bounds positionally, so they go (max, min).
      const p = redis.pipeline();
      p.zrange(IDS_KEY, after.t, after.t, { byScore: true, rev: true });
      p.zrange(IDS_KEY, `(${after.t}`, '-inf', {
        byScore: true,
        rev: true,
        offset: 0,
        count: want,
      });
      const [ties, older] = await p.exec();
      ids = [...ties.filter((id) => id < after.id), ...older].slice(0, want);
    }
    const messages = await rowsFor(ids.slice(0, limit));
    // Continue from the last row actually served: if the index's last id lost
    // a race with a delete, the next page simply re-covers a gap of deleted
    // ids, which MGET drops again — never a skipped live message.
    const next =
      ids.length > limit && messages.length
        ? positionOf(messages[messages.length - 1])
        : null;
    return { messages, next };
  },

  async countMessages() {
    return redis.zcard(IDS_KEY);
  },

  async getMessage(id) {
    return (await redis.get(msgKey(id))) ?? null;
  },

  // Row and index land together (MULTI/EXEC, not a plain pipeline), so a page
  // walk never meets an indexed id whose row is not yet written.
  async addMessage(message) {
    const score = new Date(message.createdAt).getTime();
    const tx = redis.multi();
    tx.set(msgKey(message.id), message);
    tx.zadd(IDS_KEY, { score, member: message.id });
    await tx.exec();
    return message;
  },

  // ZREM + DEL as one transaction, so no reader — the reaction script's EXISTS
  // included — can observe the message half-deleted: out of the index but
  // still readable, or the reverse. Together with the atomic script that
  // closes the orphan-hash race from both sides: a reaction either lands
  // before the whole delete (and the DEL takes it with the message) or finds
  // no message at all.
  async deleteMessage(id) {
    const tx = redis.multi();
    tx.zrem(IDS_KEY, id);
    tx.del(msgKey(id), reactionsKey(id));
    const [removed] = await tx.exec();
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

  // Guard against reacting to a deleted/never-existent message — the
  // reactions hash must not outlive (or precede) its message. The guard and
  // the write are one atomic script (SET_REACTION_LUA), one round trip.
  async setReaction(id, username, key) {
    const reply = await setReactionScript.exec(
      [msgKey(id), reactionsKey(id)],
      [username, key ?? ''],
    );
    if (reply === null || reply === undefined) return null;
    return hashFromFlat(Array.isArray(reply) ? reply : []);
  },
};
