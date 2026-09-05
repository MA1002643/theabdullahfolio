// Storage facade for the guestbook (issue #40, Phase 0 correction). The API
// routes import ONLY this module; which backend actually holds the messages is
// a deployment decision, not a code path:
//
//   GUESTBOOK_DRIVER=json    → data/guestbook.json (local dev only — Vercel's
//                              filesystem is read-only/ephemeral in production;
//                              a served production REFUSES TO LOAD it unless
//                              the e2e-only hatch below is ALSO set)
//   GUESTBOOK_DRIVER=redis   → Upstash Redis (KV_REST_API_* / UPSTASH_*) —
//                              REFUSES TO LOAD if those credentials are absent
//                              (see resolveDriver) rather than falling back
//   unset                    → redis whenever its env is present; otherwise
//                              json in development, and a REFUSAL TO LOAD in
//                              a served production (see resolveDriver — the
//                              file store is ephemeral on Vercel, so a silent
//                              fallback would accept posts and lose them)
//
// The e2e-only hatch: GUESTBOOK_ALLOW_JSON_IN_PRODUCTION=e2e-non-durable, a
// SECOND, separately named variable whose required VALUE spells the
// consequence, so no "1"/"true"/typo unlocks it. The Playwright config sets it
// for its hermetic, disposable `next start`; nothing else should, and it must
// never be set on Vercel.
//
// Both drivers implement the same contract, which is what the driver unit
// tests assert:
//   listMessages({ limit, after }) → { messages: Message[], next }
//                       newest first (paging.js order), at most `limit`, from
//                       strictly after position `after` (null = the top);
//                       `next` = position to continue from, or null at the end.
//                       THE read path: bounded by `limit` on every backend.
//   countMessages() → number (an O(1) ZCARD on redis; the file length on json)
//   getMessage(id) → Message | null
//   getMessages() → Message[]   FULL SCAN — dev/test only (the json rate
//                       limiter's last-post walk, the contract suite). Routes
//                       must never call it: it is unbounded in the wall's size.
//   addMessage(msg) → msg
//   deleteMessage(id) → boolean (whether anything was removed)
//   getReactions(ids) → { [id]: { userKey: reactionKey } }   (identity.js keys)
//   setReaction(id, userKey, key | null) → updated map, or null if no message
import { jsonDriver } from './jsonDriver';
import { redisDriver, redisAvailable } from './redisDriver';

// SERVING under NODE_ENV=production — as opposed to `next build`, which also
// evaluates route modules under that NODE_ENV (once per worker) but serves
// nothing, so the driver chosen there is irrelevant: a warning would be noise
// and a throw would break a credential-free CI build. Next marks that phase
// in NEXT_PHASE. Both production guards below key on this.
const servingProduction = () =>
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build';

// The json driver is dev-only by contract: one process, one file, ephemeral on
// Vercel — and its rate limit reserves slots in process memory, so a second
// instance would not see the first's. Asked for EXPLICITLY under a served
// production it used to serve with a warning, because the e2e suite boots a
// production server on it. A warning does not protect data (code review): one
// GUESTBOOK_DRIVER typo on Vercel and every successful write is non-durable
// and differs per instance. So it FAILS CLOSED, like the other two production
// refusals, and the e2e suite comes through a hatch of its own — a separately
// named variable whose value must spell the consequence — which still logs
// once that the store is non-durable, so the condition stays visible.
export const JSON_IN_PRODUCTION_HATCH = 'GUESTBOOK_ALLOW_JSON_IN_PRODUCTION';
export const JSON_IN_PRODUCTION_VALUE = 'e2e-non-durable';

function jsonInProduction(driver) {
  if (!servingProduction()) return driver;
  if (process.env[JSON_IN_PRODUCTION_HATCH] !== JSON_IN_PRODUCTION_VALUE) {
    throw new Error(
      'Guestbook storage: GUESTBOOK_DRIVER=json under NODE_ENV=production — ' +
        'refusing to serve the json file store: it is single-process and ' +
        'ephemeral on Vercel, so successful writes would be lost on the next ' +
        'cold start and differ between instances. Set GUESTBOOK_DRIVER=redis ' +
        'with KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL + ' +
        'UPSTASH_REDIS_REST_TOKEN). The e2e suite alone serves the file store ' +
        `in production, by ALSO setting ${JSON_IN_PRODUCTION_HATCH}=` +
        `${JSON_IN_PRODUCTION_VALUE} for its disposable server — never set that ` +
        'on Vercel.',
    );
  }
  console.warn(
    '[guestbook] json storage driver serving under NODE_ENV=production because ' +
      `${JSON_IN_PRODUCTION_HATCH}=${JSON_IN_PRODUCTION_VALUE} is set — single-` +
      'process and NON-DURABLE; e2e only. For a public deployment set ' +
      'GUESTBOOK_DRIVER=redis with KV_REST_API_URL + KV_REST_API_TOKEN.',
  );
  return driver;
}

function resolveDriver() {
  const requested = process.env.GUESTBOOK_DRIVER;
  if (requested === 'json') return jsonInProduction(jsonDriver);
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
  if (redisAvailable) return redisDriver;
  // AUTO-SELECTION WITH NO REDIS. Right for `npm run dev` with zero services.
  // In a SERVED production it is fatal, not a warning: the file store is
  // ephemeral on Vercel, so a deployment that lost its KV integration (or a
  // preview that never had one) would accept every post and drop it on the
  // next cold start — and a console line nobody is watching does not make
  // that safe. Refuse at load, naming the fix, exactly as the forced-redis
  // branch does. The ONLY production route onto the json driver is asking
  // for it by name (GUESTBOOK_DRIVER=json) AND opening the e2e hatch
  // (jsonInProduction above), which is what the e2e suite does.
  if (servingProduction()) {
    throw new Error(
      'Guestbook storage: production is running without Redis credentials and ' +
        'without an explicit GUESTBOOK_DRIVER — refusing to serve the json file ' +
        'store, which is ephemeral on Vercel (posts would be accepted and lost ' +
        'on the next cold start). Set KV_REST_API_URL + KV_REST_API_TOKEN (or ' +
        'UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). GUESTBOOK_DRIVER=json ' +
        'is for development; a served production accepts it only with the ' +
        `e2e-only ${JSON_IN_PRODUCTION_HATCH}=${JSON_IN_PRODUCTION_VALUE}.`,
    );
  }
  return jsonDriver;
}

const driver = resolveDriver();

export const listMessages = (opts) => driver.listMessages(opts);
export const countMessages = () => driver.countMessages();
export const getMessage = (id) => driver.getMessage(id);
export const getMessages = () => driver.getMessages();
export const addMessage = (message) => driver.addMessage(message);
export const deleteMessage = (id) => driver.deleteMessage(id);
export const getReactions = (ids) => driver.getReactions(ids);
export const setReaction = (id, userKey, key) =>
  driver.setReaction(id, userKey, key);
