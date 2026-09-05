// Legacy-identity migration (issue #40, code-review follow-up). The wall and
// its `guestbook:*` Redis namespace predate identity keys (identity.js), so a
// deployed store can hold rows written under the OLD model, where the GitHub
// login WAS the identity:
//
//   • a legacy GitHub message: `author = { name, username: <login>, avatar }`
//     and no `key`. authorKey() answers null for it, so ownsMessage() refuses
//     the actual author — `isOwn: false`, DELETE 403 — and only the moderator
//     can remove it;
//   • a legacy reaction field: the reactions hash (redis) or inline map (json)
//     keyed by the bare login. When the same person reacts again their write
//     lands under `github:<id>`, the login field stays beside it, the count
//     includes both, and `viewerReaction` reads null until they react again.
//
// This module PLANS the repair as pure functions over stored shapes, so the
// rules are unit-tested and shared by both drivers; the operator script
// (scripts/guestbook-migrate-identity.mjs) reads the store, plans every
// message with these, prints the plan, and — only under --apply — writes it.
//
// The one rule that must survive the migration: a login never becomes a key
// by itself. A legacy row is repaired ONLY through an authoritative
// login → account-id mapping, and stays owned by nobody until it has one.
// Two sources qualify, and both are things the wall recorded at write time
// about the account that actually wrote — never a lookup of who holds the
// login today, which is the rename hazard identity.js rules out:
//   • the operator's explicit mapping (--map / --mapping): they know who
//     signed the wall;
//   • what the rows themselves recorded (--derive): a legacy author's avatar
//     is the OAuth profile's `avatar_url`, `…githubusercontent.com/u/<id>`,
//     the poster's numeric id captured at POST time; and a keyed GitHub row
//     stores `key` and `username` side by side, a login → id pair from its
//     own sign-in. The script always REPORTS what it derived; adopting it is
//     the operator's decision, hence the flag.
// Where the two disagree the explicit mapping wins and the conflict is
// reported. Where neither maps a login, nothing is written for it.
//
// Reaction fields fold by identity: the login's value moves under the key,
// and where the key already holds a value — the person reacted again after
// keys arrived — the keyed value is their CURRENT choice and the legacy field
// is simply dropped, so the count is one per person again.
import { authorKey } from './identity.js';

const nonEmptyString = (v) => typeof v === 'string' && v.length > 0;

// Identity keys are `provider:id`; a GitHub login can never contain ':'. The
// same discriminator authorKey() uses.
const isIdentityKey = (v) => nonEmptyString(v) && v.includes(':');

// GitHub's own login grammar: alphanumerics and single hyphens, ≤39 chars.
// Applied to OPERATOR input only (a typo must not silently map nobody);
// stored usernames are looked up as they are.
const GITHUB_LOGIN_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

// Logins are case-insensitive on GitHub; the mapping folds them.
const normaliseLogin = (login) =>
  nonEmptyString(login) && !login.includes(':') ? login.trim().toLowerCase() : null;

// "583231", 583231 and "github:583231" all name the same account.
function normaliseAccountId(raw) {
  const s = String(raw ?? '').trim().replace(/^github:/, '');
  return /^\d+$/.test(s) ? s : null;
}

// The OAuth profile's avatar_url: https://avatars.githubusercontent.com/u/583231?v=4
// (older rows may carry a numbered subdomain, avatars0…). The `u/<id>` path
// segment is the account's numeric id as GitHub served it when the row was
// written. Anything else — a login-form avatar, another host — derives nothing.
const GITHUB_AVATAR_RE =
  /^https?:\/\/avatars\d*\.githubusercontent\.com\/u\/(\d+)(?:[/?#]|$)/i;

export function githubIdFromAvatar(url) {
  if (!nonEmptyString(url)) return null;
  const m = GITHUB_AVATAR_RE.exec(url.trim());
  return m ? m[1] : null;
}

// { login: id } → Map<lowercase login, id digits>. Throws on anything that is
// not a login → GitHub id pair, or on one login given two ids: operator
// input is validated, never coerced into mapping the wrong person.
export function normaliseMapping(entries = {}) {
  const map = new Map();
  for (const [rawLogin, rawId] of Object.entries(entries)) {
    const login = normaliseLogin(rawLogin);
    if (!login || !GITHUB_LOGIN_RE.test(login)) {
      throw new Error(`mapping: "${rawLogin}" is not a GitHub login`);
    }
    const id = normaliseAccountId(rawId);
    if (!id) {
      throw new Error(
        `mapping: "${rawLogin}" → "${rawId}" is not a GitHub account id ` +
          '(digits, optionally github:-prefixed)',
      );
    }
    const prior = map.get(login);
    if (prior && prior !== id) {
      throw new Error(`mapping: "${rawLogin}" is given two ids (${prior}, ${id})`);
    }
    map.set(login, id);
  }
  return map;
}

// Merge mappings left to right; an earlier entry wins a conflict (so callers
// pass the explicit mapping first and the derived one after it). Conflicts
// are returned, not thrown — they are for the report.
export function mergeMappings(...maps) {
  const merged = new Map();
  const conflicts = [];
  for (const map of maps) {
    for (const [login, id] of map) {
      const prior = merged.get(login);
      if (prior === undefined) merged.set(login, id);
      else if (prior !== id) conflicts.push({ login, kept: prior, dropped: id });
    }
  }
  return { mapping: merged, conflicts };
}

export function keyForLogin(mapping, login) {
  const id = mapping.get(normaliseLogin(login) ?? '');
  return id ? `github:${id}` : null;
}

// What kind of stored author this is, by the fields it carries:
//   keyed          — has `key`; nothing to do
//   legacy-keyed   — no `key`, but the username IS a key (`google:<sub>`, the
//                    pre-key Google form authorKey() already reads); backfill
//                    is a field move
//   legacy-github  — no `key`, a bare login for a username, provider github
//                    or absent (the pre-key GitHub form); needs a mapping
//   anonymous      — no `key`, no username: owned by nobody, nothing to map
//   unknown        — a bare login under a non-GitHub provider; left alone
export function classifyAuthor(author) {
  if (nonEmptyString(author?.key)) return 'keyed';
  const username = author?.username;
  if (!nonEmptyString(username)) return 'anonymous';
  if (isIdentityKey(username)) return 'legacy-keyed';
  const provider = author.provider;
  if (provider === undefined || provider === null || provider === 'github') {
    return 'legacy-github';
  }
  return 'unknown';
}

// Login → id pairs a KEYED GitHub row recorded at its own sign-in: `key` and
// `username` were minted together, so the pair is the account that posted.
// Null for every other shape.
export function pairFromKeyedAuthor(author) {
  if (classifyAuthor(author) !== 'keyed') return null;
  const key = authorKey(author);
  if (!key.startsWith('github:')) return null;
  const login = normaliseLogin(author.username);
  const id = normaliseAccountId(key);
  return login && id ? { login, id } : null;
}

// Login → id pair a LEGACY GitHub row recorded through its avatar, or null.
export function pairFromLegacyAvatar(author) {
  if (classifyAuthor(author) !== 'legacy-github') return null;
  const id = githubIdFromAvatar(author.avatar);
  const login = normaliseLogin(author.username);
  return login && id ? { login, id } : null;
}

// Everything the wall itself recorded about login → id, as a mapping plus
// the pairs that disagree with each other (two rows, same login, different
// ids — a reclaimed login, exactly the case a rename hazard is about; neither
// is adopted).
export function deriveMapping(authors) {
  const seen = new Map();
  const conflicts = [];
  for (const author of authors) {
    const pair = pairFromKeyedAuthor(author) ?? pairFromLegacyAvatar(author);
    if (!pair) continue;
    const prior = seen.get(pair.login);
    if (prior === undefined) seen.set(pair.login, pair.id);
    else if (prior !== pair.id) conflicts.push({ login: pair.login, ids: [prior, pair.id] });
  }
  const mapping = new Map();
  const disputed = new Set(conflicts.map((c) => c.login));
  for (const [login, id] of seen) if (!disputed.has(login)) mapping.set(login, id);
  return { mapping, conflicts };
}

// The author half of one message's plan. `next` is the repaired author or
// null when nothing is to be written; `kind` says why.
//   legacy-keyed  → { …rest, provider, key: username } — the username was the
//                   key, and a Google author carries no username in the
//                   current shape (route.js strips a ':' username anyway).
//   legacy-github → key from the mapping, or null (unmapped) — the avatar's
//                   id rides along as `avatarId` for the report, and
//                   `conflict` flags a mapping that disagrees with it.
export function planAuthor(author, mapping) {
  const kind = classifyAuthor(author);
  if (kind === 'legacy-keyed') {
    const { username, ...rest } = author;
    return {
      kind,
      next: {
        ...rest,
        provider: nonEmptyString(rest.provider) ? rest.provider : username.split(':')[0],
        key: username,
      },
      source: 'username',
    };
  }
  if (kind !== 'legacy-github') return { kind, next: null };
  const login = author.username;
  const key = keyForLogin(mapping, login);
  const avatarId = githubIdFromAvatar(author.avatar);
  return {
    kind,
    login,
    avatarId,
    conflict: Boolean(key && avatarId && key !== `github:${avatarId}`),
    next: key ? { ...author, provider: 'github', key } : null,
    source: key ? 'mapping' : null,
  };
}

// The reactions half: which bare-login fields move where. `merge` means the
// key already holds this person's (newer) reaction, so the legacy field is
// dropped rather than moved. Unmapped logins are listed and left in place.
export function planReactionFields(map, mapping) {
  const moves = [];
  const unmapped = [];
  const taken = new Set(Object.keys(map || {}).filter(isIdentityKey));
  for (const field of Object.keys(map || {})) {
    if (isIdentityKey(field)) continue;
    const to = keyForLogin(mapping, field);
    if (!to) {
      unmapped.push(field);
      continue;
    }
    moves.push({ from: field, to, action: taken.has(to) ? 'merge' : 'move' });
    taken.add(to);
  }
  return { moves, unmapped };
}

// The map after the moves — what the json driver writes, and what the Lua
// below does field by field on redis: move where the key is free, keep the
// keyed value where it is not, drop the legacy field either way.
export function applyReactionMoves(map, moves) {
  const next = { ...(map || {}) };
  for (const { from, to } of moves) {
    if (next[to] === undefined && next[from] !== undefined) next[to] = next[from];
    delete next[from];
  }
  return next;
}

// One message's whole plan. `reactions` is the driver's { userKey: reaction }
// map for the message (the redis hash, or the json row's inline map).
export function planMessage(stored, reactions, mapping) {
  const author = planAuthor(stored?.author, mapping);
  const reactionPlan = planReactionFields(reactions, mapping);
  return {
    id: stored?.id,
    author,
    reactions: reactionPlan,
    changes: author.next !== null || reactionPlan.moves.length > 0,
  };
}

// ── The redis write, as ONE atomic script per message ──────────────────────
// KEYS = [message key, reactions hash]; ARGV = [expected row JSON or '' to
// leave the row alone, replacement row JSON, then (legacy field, key) pairs].
// The row rewrite is a compare-and-set: the row is written only if it still
// reads exactly as it did when the plan was made, so a concurrent DELETE (or
// anything else touching the row) makes this a no-op rather than a
// resurrection — and nothing here touches a message that is gone (the same
// EXISTS guard as the reaction script, so a reactions hash never outlives its
// message). Reply: nil when the message is gone; else
// { row: 1 written | 0 not requested | -1 skipped (changed underneath),
//   moved, merged } as a flat Lua array.
export const MIGRATE_IDENTITY_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return nil
end
local row = 0
if ARGV[1] ~= '' then
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    redis.call('SET', KEYS[1], ARGV[2])
    row = 1
  else
    row = -1
  end
end
local moved = 0
local merged = 0
for i = 3, #ARGV, 2 do
  local from = ARGV[i]
  local to = ARGV[i + 1]
  local value = redis.call('HGET', KEYS[2], from)
  if value then
    if redis.call('HEXISTS', KEYS[2], to) == 1 then
      merged = merged + 1
    else
      redis.call('HSET', KEYS[2], to, value)
      moved = moved + 1
    end
    redis.call('HDEL', KEYS[2], from)
  end
end
return { row, moved, merged }
`;

// ARGV for the script above, from a plan and the row's raw JSON as read (the
// exact string, for the compare-and-set) and the replacement to write.
export function migrationScriptArgs({ expectedRow, nextRow, moves }) {
  const rewrite = typeof expectedRow === 'string' && typeof nextRow === 'string';
  return [
    rewrite ? expectedRow : '',
    rewrite ? nextRow : '',
    ...(moves || []).flatMap(({ from, to }) => [from, to]),
  ];
}

export function readMigrationReply(reply) {
  if (reply === null || reply === undefined) return null;
  const [row, moved, merged] = Array.isArray(reply) ? reply.map(Number) : [];
  return {
    row: row === 1 ? 'written' : row === -1 ? 'skipped' : 'unchanged',
    moved: moved || 0,
    merged: merged || 0,
  };
}
