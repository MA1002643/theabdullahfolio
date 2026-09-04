// Local-development storage driver: one JSON file at data/guestbook.json.
// This is the ONLY module in the guestbook tree allowed to touch `fs` — the
// API route goes through store.js, which picks a driver (issue #40, Phase 0
// correction: Vercel's filesystem is ephemeral, so production always uses the
// redis driver; this one exists so `npm run dev` works with zero services).
//
// Two invariants, both for the single Node process this driver is scoped to:
//   • MUTATIONS ARE SERIALISED. Every write path is read-modify-write over the
//     whole array; run two of them concurrently and the later write silently
//     drops the earlier one's change — a lost post, an undone delete, a
//     vanished reaction. So addMessage / deleteMessage / setReaction all go
//     through one promise queue (`serialize`), strictly one at a time.
//   • WRITES ARE ATOMIC. writeAll lands the new contents in a sibling temp
//     file and rename()s it over the real one (atomic on POSIX; Node's rename
//     replaces on Windows too), so a reader — the wall's GET, the rate
//     limiter's scan — sees either the old file or the new one, never a torn
//     half-written JSON. That is also why reads need no lock.
//   • A FILE THAT CANNOT BE READ IS NEVER AN EMPTY WALL. Only a missing file
//     means "no messages yet"; an I/O error or unparseable content makes the
//     read — and so any mutation behind it — fail, rather than being written
//     over with a one-record wall (see readAll).
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { compareNewest, isOlderThan, positionOf } from './paging';

// Overridable for the unit tests (they point this at a temp dir so a test
// run never touches the real dev data file). Resolved per call, not at
// import, so a test can set the env var after importing the module.
const dataPath = () =>
  process.env.GUESTBOOK_JSON_PATH ||
  join(process.cwd(), 'data', 'guestbook.json');

// The mutation queue: each task starts only when the previous one has
// settled. A REJECTED task must not wedge everything behind it, so the chain
// always continues from a resolved promise — the caller still gets the
// rejection through the returned `run`.
let queue = Promise.resolve();
function serialize(task) {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// The read side of every operation. ONLY a missing file is an empty wall —
// the first run, before anything was ever written (the first write creates
// it). Every other failure propagates. An I/O error (permissions, a path
// that is a directory, a disk fault) or a file that does not parse as a JSON
// array used to be swallowed into `[]` too — and since every mutation below
// is read-modify-write, the next post or reaction would then have written
// back ONLY its own record: a transient error or a corrupted file turned
// into silent loss of the whole wall. Now the read throws, the mutation
// rejects before its temp-file write ever starts, the route answers 500, and
// the file on disk stays exactly as it was, for someone to inspect or
// restore. An empty or whitespace-only file is the one lenient case: it
// holds nothing a write could lose.
async function readAll() {
  const path = dataPath();
  let raw;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }
  if (!raw.trim()) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[guestbook] ${path} is not valid JSON — refusing to read it (and so ` +
        'to overwrite it); repair or remove the file',
      { cause: err },
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `[guestbook] ${path} does not hold a JSON array of messages — refusing ` +
        'to read it (and so to overwrite it); repair or remove the file',
    );
  }
  return parsed;
}

async function writeAll(messages) {
  const path = dataPath();
  await fs.mkdir(dirname(path), { recursive: true });
  // Sibling temp file (same directory ⇒ same filesystem ⇒ rename is a pure
  // metadata swap). Unique per attempt so a crash mid-write can never collide
  // with the next one; a failed attempt cleans up after itself.
  const tmp = `${path}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2, 8)}.tmp`;
  try {
    await fs.writeFile(tmp, `${JSON.stringify(messages, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, path);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

export const jsonDriver = {
  // FULL SCAN — dev/test only (the json rate limiter's "when did this user
  // last post" walk, and the contract suite). The wall's GET never calls it:
  // it pages through listMessages, the same contract the redis driver honours
  // with bounded index reads.
  async getMessages() {
    return readAll();
  },

  // Cursor-paged read: newest first (paging.js order), at most `limit`, from
  // strictly after position `after` (null = from the top). `next` is the
  // position to continue from, or null once the page reached the oldest
  // message. Still one file read here — this driver is single-process and
  // dev-only by contract — but the SHAPE is the route's contract, and the
  // contract suite pins both drivers to it.
  async listMessages({ limit, after = null }) {
    const sorted = (await readAll()).sort(compareNewest);
    const from = after
      ? sorted.filter((m) => isOlderThan(positionOf(m), after))
      : sorted;
    const page = from.slice(0, limit);
    return {
      messages: page,
      next: from.length > limit ? positionOf(page[page.length - 1]) : null,
    };
  },

  async countMessages() {
    return (await readAll()).length;
  },

  async getMessage(id) {
    return (await readAll()).find((m) => m.id === id) ?? null;
  },

  addMessage(message) {
    return serialize(async () => {
      const messages = await readAll();
      messages.push(message);
      await writeAll(messages);
      return message;
    });
  },

  deleteMessage(id) {
    return serialize(async () => {
      const messages = await readAll();
      const next = messages.filter((m) => m.id !== id);
      if (next.length === messages.length) return false;
      await writeAll(next);
      return true;
    });
  },

  // Reactions ride inside each stored message as a private `{ username: key }`
  // map (the route collapses it to counts before anything leaves the server).
  async getReactions(ids) {
    const messages = await readAll();
    const byId = {};
    for (const m of messages) {
      if (ids.includes(m.id)) byId[m.id] = m.reactions || {};
    }
    return byId;
  },

  // key = a reaction key to set, null to clear. Returns the updated map, or
  // null when the message doesn't exist.
  setReaction(id, username, key) {
    return serialize(async () => {
      const messages = await readAll();
      const msg = messages.find((m) => m.id === id);
      if (!msg) return null;
      const map = { ...(msg.reactions || {}) };
      if (key === null) delete map[username];
      else map[username] = key;
      msg.reactions = map;
      await writeAll(messages);
      return map;
    });
  },
};
