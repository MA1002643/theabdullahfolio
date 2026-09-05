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
// it can — so a numeric-looking field ("123", "1e5") would come back as a
// number, and be a different key by the time it became an object property.
// Fields are identity keys now (`github:<id>`, never numeric-looking), but
// hashes written before keys existed carry bare logins, which can be — until
// the identity migration (legacyIdentity.js, run by
// scripts/guestbook-migrate-identity.mjs) folds them under the account's key.
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
// read-back. KEYS = [message key, reactions hash]; ARGV = [the viewer's
// identity key, reaction key — or '' to clear]. Replies nil when the message
// is gone, else the hash as HGETALL's flat array.
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
// a delete raced the index read; drop those rather than surfacing holes (the
// paged read below then scans on — see listMessages).
async function rowsFor(ids) {
  if (!ids.length) return [];
  const rows = await redis.mget(...ids.map(msgKey));
  return rows.filter(Boolean);
}

// WITHSCORES answers flat — [member, score, member, score, …] — and the data
// client's auto-deserialiser turns the numeric score strings into numbers;
// Number() covers both. Each entry is a paging.js position: the ZSET score IS
// a message's `t` (addMessage scores by createdAt), so a position can be
// minted from the index alone, for an id whose row is already gone.
function positions(flat) {
  const out = [];
  for (let i = 0; i + 1 < (flat?.length ?? 0); i += 2) {
    out.push({ id: String(flat[i]), t: Number(flat[i + 1]) });
  }
  return out;
}

// Walk the index: up to `want` positions strictly after `after` (null = the
// top), newest first. The two-query shape under a cursor is deliberate: REV
// order is score desc, then member desc, so "strictly after the cursor" is
// (a) the members that SHARE its score and sort below its id, then (b) every
// member with a lower score — two index reads in one pipeline. (a) is
// non-empty only when two people posted in the same millisecond — rare, but
// an exclusive score bound alone would skip those messages on every page
// boundary, forever. Under REV the client forwards the bounds positionally,
// so they go (max, min). Score-bounded, never rank-offset: a rank shifts the
// moment a member ahead of it is deleted, and a continuation by rank would
// skip the live member that slid into the vacated rank.
async function indexAfter(after, want) {
  if (!after) {
    return positions(
      await redis.zrange(IDS_KEY, 0, want - 1, { rev: true, withScores: true }),
    );
  }
  const p = redis.pipeline();
  p.zrange(IDS_KEY, after.t, after.t, {
    byScore: true,
    rev: true,
    withScores: true,
  });
  p.zrange(IDS_KEY, `(${after.t}`, '-inf', {
    byScore: true,
    rev: true,
    offset: 0,
    count: want,
    withScores: true,
  });
  const [ties, older] = await p.exec();
  return [
    ...positions(ties).filter((e) => e.id < after.id),
    ...positions(older),
  ].slice(0, want);
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
  // a handful of bounded commands whatever the wall's size: an index walk of
  // limit + 1 positions and one MGET of `limit` rows per round — never the
  // whole set.
  //
  // The index and the rows are read in two steps, and a delete (ZREM + DEL
  // in one MULTI) can land between them: MGET then hands back null for an id
  // the walk returned. Dropping the null is right — but a page built ONLY
  // from what MGET kept could come back short, or empty, while the walk's
  // extra position proved older messages exist; answering `next: null` there
  // told the client the wall was exhausted, and it could never page past the
  // gap. So the read is a loop over the INDEX: while the page is short and
  // the walk says more exists, scan on from the last indexed position — the
  // deleted id's own (score, id), which is all a position is, so no live row
  // is needed to continue — until the page is full or the index itself is
  // exhausted. Each round advances strictly, so it ends, and the extra rounds
  // cost only what the race deleted. Two invariants fall out, and the client
  // leans on both: a SHORT page means the index is exhausted (`next` is
  // null), and a FULL page's `next` is its last row's position — every id the
  // walk saw after it was deleted, so the next page re-covers nothing live.
  async listMessages({ limit, after = null }) {
    const messages = [];
    let from = after;
    for (;;) {
      const need = limit - messages.length;
      // One position beyond what the page still needs: its presence is the
      // "more exists" signal, so `next` needs no extra command.
      const scanned = await indexAfter(from, need + 1);
      const more = scanned.length > need;
      const slice = scanned.slice(0, need);
      if (slice.length) {
        messages.push(...(await rowsFor(slice.map((e) => e.id))));
      }
      if (!more) return { messages, next: null };
      if (messages.length === limit) {
        return { messages, next: positionOf(messages[messages.length - 1]) };
      }
      from = slice[slice.length - 1];
    }
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

  // Reactions: one HASH per message, field = the reactor's identity key
  // (identity.js), value = reaction key — HSET/HDEL make "one reaction per
  // user per message" a property of the data structure, not bookkeeping, and
  // the field survives a GitHub rename because it is the account id.
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
  async setReaction(id, userKey, key) {
    const reply = await setReactionScript.exec(
      [msgKey(id), reactionsKey(id)],
      [userKey, key ?? ''],
    );
    if (reply === null || reply === undefined) return null;
    return hashFromFlat(Array.isArray(reply) ? reply : []);
  },
};
