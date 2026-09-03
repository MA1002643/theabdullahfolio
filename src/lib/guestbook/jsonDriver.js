// Local-development storage driver: one JSON file at data/guestbook.json.
// This is the ONLY module in the guestbook tree allowed to touch `fs` — the
// API route goes through store.js, which picks a driver (issue #40, Phase 0
// correction: Vercel's filesystem is ephemeral, so production always uses the
// redis driver; this one exists so `npm run dev` works with zero services).
import { promises as fs } from 'fs';
import { dirname, join } from 'path';

// Overridable for the unit tests (they point this at a temp dir so a test
// run never touches the real dev data file). Resolved per call, not at
// import, so a test can set the env var after importing the module.
const dataPath = () =>
  process.env.GUESTBOOK_JSON_PATH ||
  join(process.cwd(), 'data', 'guestbook.json');

async function readAll() {
  try {
    const raw = await fs.readFile(dataPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Missing file / bad JSON both mean "no messages yet" — the file is
    // re-created on the next write.
    return [];
  }
}

async function writeAll(messages) {
  const path = dataPath();
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, `${JSON.stringify(messages, null, 2)}\n`, 'utf8');
}

export const jsonDriver = {
  async getMessages() {
    return readAll();
  },

  async addMessage(message) {
    const messages = await readAll();
    messages.push(message);
    await writeAll(messages);
    return message;
  },

  async deleteMessage(id) {
    const messages = await readAll();
    const next = messages.filter((m) => m.id !== id);
    if (next.length === messages.length) return false;
    await writeAll(next);
    return true;
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
  async setReaction(id, username, key) {
    const messages = await readAll();
    const msg = messages.find((m) => m.id === id);
    if (!msg) return null;
    const map = { ...(msg.reactions || {}) };
    if (key === null) delete map[username];
    else map[username] = key;
    msg.reactions = map;
    await writeAll(messages);
    return map;
  },
};
