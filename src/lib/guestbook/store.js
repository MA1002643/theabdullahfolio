// Storage facade for the guestbook (issue #40, Phase 0 correction). The API
// routes import ONLY this module; which backend actually holds the messages is
// a deployment decision, not a code path:
//
//   GUESTBOOK_DRIVER=json    → data/guestbook.json (local dev only — Vercel's
//                              filesystem is read-only/ephemeral in production)
//   GUESTBOOK_DRIVER=redis   → Upstash Redis (KV_REST_API_* / UPSTASH_*) —
//                              REFUSES TO LOAD if those credentials are absent
//                              (see resolveDriver) rather than falling back
//   unset                    → redis whenever its env is present, else json
//
// Both drivers implement the same contract, which is what the driver unit
// tests assert:
//   getMessages() → Message[]
//   addMessage(msg) → msg
//   deleteMessage(id) → boolean (whether anything was removed)
//   getReactions(ids) → { [id]: { username: reactionKey } }
//   setReaction(id, username, key | null) → updated map, or null if no message
import { jsonDriver } from './jsonDriver';
import { redisDriver, redisAvailable } from './redisDriver';

// The json driver is dev-only by contract: one process, one file, ephemeral on
// Vercel — and its rate limit reserves slots in process memory, so a second
// instance would not see the first's. Nothing stops a self-hoster from putting
// a public `next start` on it, so say so once, loudly, in the log. A warning
// rather than a throw: the e2e suite legitimately boots a production server on
// the json driver.
function warnIfProduction(driver) {
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[guestbook] json storage driver active under NODE_ENV=production — it is ' +
        'single-process and non-durable (dev/e2e only). For a public deployment ' +
        'set GUESTBOOK_DRIVER=redis with KV_REST_API_URL + KV_REST_API_TOKEN.',
    );
  }
  return driver;
}

function resolveDriver() {
  const requested = process.env.GUESTBOOK_DRIVER;
  if (requested === 'json') return warnIfProduction(jsonDriver);
  if (requested === 'redis') {
    // An EXPLICIT redis request that cannot be honoured must fail loudly, at
    // load, naming the variables — not on the first request as a null
    // dereference inside redisDriver (its client is null when unconfigured).
    // Silently downgrading to the json driver would be worse than either: on
    // Vercel the filesystem is ephemeral, so the wall would accept messages
    // and lose them on the next cold start while the operator believed they
    // were in Redis.
    if (!redisAvailable) {
      throw new Error(
        'GUESTBOOK_DRIVER=redis but no Redis credentials are set — provide ' +
          'KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL + ' +
          'UPSTASH_REDIS_REST_TOKEN), or unset GUESTBOOK_DRIVER to auto-select.',
      );
    }
    return redisDriver;
  }
  return redisAvailable ? redisDriver : warnIfProduction(jsonDriver);
}

const driver = resolveDriver();

export const getMessages = () => driver.getMessages();
export const addMessage = (message) => driver.addMessage(message);
export const deleteMessage = (id) => driver.deleteMessage(id);
export const getReactions = (ids) => driver.getReactions(ids);
export const setReaction = (id, username, key) =>
  driver.setReaction(id, username, key);
