// Storage facade for the guestbook (issue #40, Phase 0 correction). The API
// routes import ONLY this module; which backend actually holds the messages is
// a deployment decision, not a code path:
//
//   GUESTBOOK_DRIVER=json    → data/guestbook.json (local dev only — Vercel's
//                              filesystem is read-only/ephemeral in production)
//   GUESTBOOK_DRIVER=redis   → Upstash Redis (KV_REST_API_* / UPSTASH_*)
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

function resolveDriver() {
  const requested = process.env.GUESTBOOK_DRIVER;
  if (requested === 'json') return jsonDriver;
  if (requested === 'redis') return redisDriver;
  return redisAvailable ? redisDriver : jsonDriver;
}

const driver = resolveDriver();

export const getMessages = () => driver.getMessages();
export const addMessage = (message) => driver.addMessage(message);
export const deleteMessage = (id) => driver.deleteMessage(id);
export const getReactions = (ids) => driver.getReactions(ids);
export const setReaction = (id, username, key) =>
  driver.setReaction(id, username, key);
