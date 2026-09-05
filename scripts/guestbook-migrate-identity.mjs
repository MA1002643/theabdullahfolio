#!/usr/bin/env node
// Guestbook legacy-identity migration (issue #40, code-review follow-up).
// Backfills `author.key` on rows written before identity keys existed and
// folds bare-login reaction fields under the account's key — the plan and the
// rules live in src/lib/guestbook/legacyIdentity.js; this is the operator's
// hand-run entry point. DRY RUN by default: it prints every change it would
// make and writes nothing until --apply.
//
//   node --env-file=.env.local scripts/guestbook-migrate-identity.mjs [options]
//
//   --apply             write the plan (default: report only)
//   --derive            adopt the login → id pairs the wall itself recorded:
//                       a legacy author's avatar id, and the key beside the
//                       login on keyed rows (always REPORTED; adopted only
//                       with this flag)
//   --map login=id      an explicit pair (repeatable); wins over --derive
//   --mapping file.json an explicit { "login": "id" } object; same precedence
//   --json [path]       migrate the dev file store instead of redis
//                       (default path: $GUESTBOOK_JSON_PATH or data/guestbook.json)
//   --help
//
// Redis credentials come from the environment only — KV_REST_API_URL +
// KV_REST_API_TOKEN (the Vercel/Upstash names) or UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN — never from an argument, and never printed. Run
// it from the repo root: it imports the guestbook modules by relative path.
//
// A login the mapping does not cover is reported and left exactly as it was:
// the row stays owned by nobody, the reaction field stays under the login.
// The one thing this script will never do is treat the login as the key.
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Redis } from '@upstash/redis';

// The guestbook modules are .js files in a package with no "type" field, so
// Node (≥22.7) detects their ESM syntax and warns once that it had to. That
// is expected here and would only bury the report, so that ONE warning code
// is filtered — every other warning still prints — and the module is imported
// dynamically so the filter is in place before the detection runs.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w?.code === 'MODULE_TYPELESS_PACKAGE_JSON') return;
  console.warn(`${w?.name ?? 'Warning'}: ${w?.message ?? w}`);
});
const {
  applyReactionMoves,
  deriveMapping,
  mergeMappings,
  migrationScriptArgs,
  MIGRATE_IDENTITY_LUA,
  normaliseMapping,
  planMessage,
  readMigrationReply,
} = await import('../src/lib/guestbook/legacyIdentity.js');

const IDS_KEY = 'guestbook:ids';
const msgKey = (id) => `guestbook:msg:${id}`;
const reactionsKey = (id) => `guestbook:reactions:${id}`;
const CHUNK = 100;

// ── arguments ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { apply: false, derive: false, map: {}, mappingFile: null, json: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--derive') opts.derive = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--map') {
      const pair = argv[++i] ?? '';
      const eq = pair.indexOf('=');
      if (eq <= 0) throw new Error(`--map expects login=id, got "${pair}"`);
      opts.map[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else if (arg === '--mapping') {
      opts.mappingFile = argv[++i];
      if (!opts.mappingFile) throw new Error('--mapping expects a file path');
    } else if (arg === '--json') {
      const next = argv[i + 1];
      opts.json =
        next && !next.startsWith('--')
          ? argv[++i]
          : process.env.GUESTBOOK_JSON_PATH || 'data/guestbook.json';
    } else throw new Error(`unknown argument "${arg}" (try --help)`);
  }
  return opts;
}

async function explicitMapping(opts) {
  let fromFile = {};
  if (opts.mappingFile) {
    const parsed = JSON.parse(await fs.readFile(resolve(opts.mappingFile), 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`--mapping ${opts.mappingFile}: expected a { "login": "id" } object`);
    }
    fromFile = parsed;
  }
  // --map after the file so a command-line pair overrides the file's.
  return normaliseMapping({ ...fromFile, ...opts.map });
}

// ── stores ──────────────────────────────────────────────────────────────────
// Both read to the same shape — [{ id, stored, raw, reactions }] — so the plan
// and the report are store-agnostic; only the write differs.
async function readRedis(raw) {
  const ids = (await raw.zrange(IDS_KEY, 0, -1)).map(String);
  const rows = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const [rawRows, hashes] = await Promise.all([
      raw.mget(...slice.map(msgKey)),
      (async () => {
        const p = raw.pipeline();
        for (const id of slice) p.hgetall(reactionsKey(id));
        return p.exec();
      })(),
    ]);
    slice.forEach((id, j) => {
      const rawRow = rawRows[j];
      if (rawRow === null || rawRow === undefined) return; // deleted since ZRANGE
      const text = typeof rawRow === 'string' ? rawRow : JSON.stringify(rawRow);
      let stored;
      try {
        stored = JSON.parse(text);
      } catch {
        console.warn(`  ! ${id}: row is not JSON — skipped`);
        return;
      }
      rows.push({ id, stored, raw: text, reactions: hashToMap(hashes[j]) });
    });
  }
  return rows;
}

// HGETALL arrives flat ([field, value, …]) on a client with automatic
// deserialisation off; tolerate the object form too.
function hashToMap(reply) {
  if (!reply) return {};
  if (!Array.isArray(reply)) return reply;
  const map = {};
  for (let i = 0; i + 1 < reply.length; i += 2) map[String(reply[i])] = String(reply[i + 1]);
  return map;
}

async function readJson(path) {
  let text;
  try {
    text = await fs.readFile(path, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return { messages: [], rows: [] };
    throw err;
  }
  const messages = text.trim() ? JSON.parse(text) : [];
  if (!Array.isArray(messages)) throw new Error(`${path} does not hold a JSON array`);
  return {
    messages,
    rows: messages.map((m) => ({ id: m.id, stored: m, raw: null, reactions: m.reactions || {} })),
  };
}

// ── report ──────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);

function printPlan(plans, { derived, conflicts, adoptedDerived }) {
  const authors = plans.filter((p) => p.author.kind.startsWith('legacy'));
  const withReactions = plans.filter(
    (p) => p.reactions.moves.length || p.reactions.unmapped.length,
  );

  console.log('\nauthors');
  if (!authors.length) console.log('  (no legacy authors)');
  for (const p of authors) {
    const a = p.author;
    if (a.kind === 'legacy-keyed') {
      console.log(`  ${pad(p.id, 30)} ${pad(a.next.key, 28)} key backfilled from username`);
      continue;
    }
    const target = a.next ? a.next.key : 'UNMAPPED';
    let note = a.next ? 'from mapping' : '';
    if (a.avatarId) {
      const hint = `avatar says ${a.avatarId}`;
      if (a.conflict) note = `from mapping — CONFLICT: ${hint}`;
      else if (!a.next) note = `${hint} (adopt with --derive, or --map ${a.login}=${a.avatarId})`;
    } else if (!a.next) note = `no avatar id — needs --map ${a.login}=<account id>`;
    console.log(`  ${pad(p.id, 30)} @${pad(a.login, 27)} → ${pad(target, 22)} ${note}`);
  }

  console.log('\nreactions');
  if (!withReactions.length) console.log('  (no legacy reaction fields)');
  for (const p of withReactions) {
    for (const m of p.reactions.moves) {
      console.log(`  ${pad(p.id, 30)} ${pad(m.from, 28)} → ${pad(m.to, 22)} ${m.action}`);
    }
    for (const login of p.reactions.unmapped) {
      console.log(`  ${pad(p.id, 30)} ${pad(login, 28)} → UNMAPPED`);
    }
  }

  if (derived.size) {
    console.log(
      `\nderived from the wall (${adoptedDerived ? 'ADOPTED via --derive' : 'not adopted — pass --derive'})`,
    );
    for (const [login, id] of derived) console.log(`  ${pad(login, 30)} → github:${id}`);
  }
  for (const c of conflicts.derived) {
    console.log(`  ! ${c.login}: the wall recorded two ids (${c.ids.join(', ')}) — not derived`);
  }
  for (const c of conflicts.merge) {
    console.log(`  ! ${c.login}: explicit ${c.kept} overrides derived ${c.dropped}`);
  }

  const n = {
    backfill: authors.filter((p) => p.author.next).length,
    unmappedAuthors: authors.filter((p) => !p.author.next).length,
    move: plans.reduce((s, p) => s + p.reactions.moves.filter((m) => m.action === 'move').length, 0),
    merge: plans.reduce((s, p) => s + p.reactions.moves.filter((m) => m.action === 'merge').length, 0),
    unmappedFields: plans.reduce((s, p) => s + p.reactions.unmapped.length, 0),
  };
  console.log(
    `\nsummary: ${n.backfill} author key${n.backfill === 1 ? '' : 's'} to backfill, ` +
      `${n.unmappedAuthors} unmapped; ${n.move} reaction field${n.move === 1 ? '' : 's'} to move, ` +
      `${n.merge} to merge, ${n.unmappedFields} unmapped`,
  );
  return n;
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      'usage: node --env-file=.env.local scripts/guestbook-migrate-identity.mjs ' +
        '[--apply] [--derive] [--map login=id]... [--mapping file.json] [--json [path]]',
    );
    return;
  }

  let raw = null;
  let jsonPath = null;
  let rows;
  let jsonMessages;
  if (opts.json) {
    jsonPath = resolve(opts.json);
    ({ messages: jsonMessages, rows } = await readJson(jsonPath));
  } else {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error(
        'no Redis credentials in the environment — set KV_REST_API_URL + ' +
          'KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN), ' +
          'e.g. `node --env-file=.env.local …`, or pass --json for the dev file store',
      );
    }
    // Deserialisation OFF: rows come back as the exact stored string (the
    // compare-and-set needs it verbatim) and hash fields stay strings, so a
    // numeric-looking login is not turned into a number on the way in.
    raw = new Redis({ url, token, automaticDeserialization: false });
    rows = await readRedis(raw);
  }

  console.log(
    `guestbook identity migration — ${opts.apply ? 'APPLY' : 'DRY RUN (pass --apply to write)'}`,
  );
  console.log(
    `store: ${jsonPath ? `json ${jsonPath}` : 'redis (guestbook:*)'}, ${rows.length} message${rows.length === 1 ? '' : 's'}`,
  );

  const explicit = await explicitMapping(opts);
  const { mapping: derived, conflicts: derivedConflicts } = deriveMapping(
    rows.map((r) => r.stored?.author),
  );
  const { mapping, conflicts: mergeConflicts } = opts.derive
    ? mergeMappings(explicit, derived)
    : { mapping: explicit, conflicts: [] };
  console.log(`mapping: ${explicit.size} explicit, ${derived.size} derived from the wall`);

  const plans = rows.map((r) => ({ row: r, ...planMessage(r.stored, r.reactions, mapping) }));
  printPlan(plans, {
    derived,
    conflicts: { derived: derivedConflicts, merge: mergeConflicts },
    adoptedDerived: opts.derive,
  });

  const todo = plans.filter((p) => p.changes);
  if (!opts.apply) {
    console.log(todo.length ? '\nnothing written (dry run)' : '\nnothing to do');
    return;
  }
  if (!todo.length) {
    console.log('\nnothing to do');
    return;
  }

  if (jsonPath) {
    // The dev file store: rewrite in memory, land by temp file + rename — the
    // same atomic-replace shape jsonDriver.js uses.
    const byId = new Map(todo.map((p) => [p.id, p]));
    const next = jsonMessages.map((m) => {
      const p = byId.get(m.id);
      if (!p) return m;
      const out = { ...m };
      if (p.author.next) out.author = p.author.next;
      if (p.reactions.moves.length) {
        out.reactions = applyReactionMoves(m.reactions, p.reactions.moves);
      }
      return out;
    });
    const tmp = `${jsonPath}.${process.pid}.migrate.tmp`;
    await fs.mkdir(dirname(jsonPath), { recursive: true });
    await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, jsonPath);
    console.log(`\nwritten: ${todo.length} message${todo.length === 1 ? '' : 's'} → ${jsonPath}`);
    return;
  }

  // Redis: one atomic script per message (compare-and-set on the row, field
  // moves on the hash), reported one line each.
  const script = raw.createScript(MIGRATE_IDENTITY_LUA);
  const totals = { written: 0, skipped: 0, gone: 0, moved: 0, merged: 0 };
  console.log('');
  for (const p of todo) {
    const args = migrationScriptArgs({
      expectedRow: p.author.next ? p.row.raw : null,
      nextRow: p.author.next ? JSON.stringify({ ...p.row.stored, author: p.author.next }) : null,
      moves: p.reactions.moves,
    });
    const reply = readMigrationReply(
      await script.exec([msgKey(p.id), reactionsKey(p.id)], args),
    );
    if (!reply) {
      totals.gone += 1;
      console.log(`  ${pad(p.id, 30)} message gone — nothing written`);
      continue;
    }
    if (reply.row === 'written') totals.written += 1;
    if (reply.row === 'skipped') totals.skipped += 1;
    totals.moved += reply.moved;
    totals.merged += reply.merged;
    const parts = [];
    if (reply.row === 'written') parts.push('author key written');
    if (reply.row === 'skipped') parts.push('row CHANGED underneath — author left alone (re-run)');
    if (reply.moved) parts.push(`${reply.moved} reaction field${reply.moved === 1 ? '' : 's'} moved`);
    if (reply.merged) parts.push(`${reply.merged} merged`);
    console.log(`  ${pad(p.id, 30)} ${parts.join(', ') || 'no change'}`);
  }
  console.log(
    `\nwritten: ${totals.written} author key${totals.written === 1 ? '' : 's'}, ` +
      `${totals.moved} reaction field${totals.moved === 1 ? '' : 's'} moved, ${totals.merged} merged; ` +
      `${totals.skipped} row${totals.skipped === 1 ? '' : 's'} skipped (changed underneath), ` +
      `${totals.gone} gone`,
  );
  if (totals.skipped) process.exitCode = 2;
}

main().catch((err) => {
  console.error(`guestbook-migrate-identity: ${err?.message ?? err}`);
  process.exitCode = 1;
});
