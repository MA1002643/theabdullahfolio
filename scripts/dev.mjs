#!/usr/bin/env node
/**
 * Dev-server launcher — `npm run dev` goes through here instead of a bare
 * `next dev` because localhost kept dying for three machine-specific,
 * compounding reasons:
 *
 *   1. DUPLICATE SERVERS. Concurrent editor/agent sessions each start their
 *      own `next dev` against the same working tree. The second one finds
 *      :3000 busy, silently falls back to :3001, and both servers then
 *      read/write ONE shared dist dir — manifests corrupt, routes 404-flap,
 *      and eventually a server exits. This launcher kills any dev server
 *      already running FROM THIS REPO, then refuses to start (loudly) if
 *      the port is still owned by something else. One repo, one server.
 *
 *   2. WRONG NODE. Homebrew's `node` is v25 (odd-numbered, non-LTS,
 *      auto-bumped by brew) and crashes the Next 14 dev server with silent
 *      exits. The repo's `engines: >=22.3.0` is only a floor, so v25
 *      satisfies it. When the invoking Node is not an LTS major, the
 *      launcher re-runs Next under the newest nvm-installed v22/v24.
 *
 *   3. iCLOUD CHURN. ~/Desktop is iCloud-synced and the file provider
 *      touches build artifacts mid-write (random ENOENT, silent exits).
 *      Handled in next.config.mjs by keeping local build output in
 *      `.next.nosync/` — the `.nosync` suffix is iCloud's opt-out.
 */
import { execSync, spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import net from "node:net";
import { homedir } from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const args = process.argv.slice(2);

const sh = (cmd) =>
  execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

// ----------------------------------------------------------- target port --
// Next's CLI (commander) accepts every one of `-p 3001`, `-p3001`,
// `--port 3001` and `--port=3001` (same shapes for -H/--hostname). The gate
// must recognise them all — parsing only the space-separated forms would
// probe :3000 while Next binds the REAL port, re-opening the silent-fallback
// corruption this launcher exists to stop. Scans right-to-left so a repeated
// flag resolves to its last occurrence, matching commander's last-wins rule.
const argValue = (short, long) => {
  for (let i = args.length - 1; i >= 0; i--) {
    const a = args[i];
    if (a === short || a === long) return args[i + 1];
    if (a.startsWith(`${long}=`)) return a.slice(long.length + 1);
    if (a.startsWith(short) && a.length > short.length && !a.startsWith("--"))
      return a.slice(short.length);
  }
  return undefined;
};

const port = Number(argValue("-p", "--port") ?? process.env.PORT) || 3000;

// ------------------------------------------------- kill stale dev servers --
// The [n] bracket trick stops pgrep from matching its own shell wrapper.
// Only processes whose cwd is THIS repo are killed, so dev servers of
// other projects are left alone.
let candidates = [];
try {
  candidates = sh(
    String.raw`pgrep -f "[n]ext-server|node_modules/\.bin/[n]ext dev|[n]ext/dist/bin/next dev"`,
  )
    .split("\n")
    .filter(Boolean)
    .map(Number);
} catch {
  /* pgrep exits non-zero when nothing matches — nothing to kill */
}

let killedAny = false;
for (const pid of candidates) {
  if (pid === process.pid || pid === process.ppid) continue;
  let cwd = "";
  try {
    cwd = sh(`lsof -a -p ${pid} -d cwd -Fn | tail -1`).replace(/^n/, "");
  } catch {
    continue; // process already gone (or lsof unavailable — the port gate below still protects us)
  }
  if (cwd === repoRoot) {
    try {
      process.kill(pid, "SIGKILL");
      killedAny = true;
      console.log(`[dev] killed stale dev server (pid ${pid})`);
    } catch {
      /* raced with its own exit */
    }
  }
}

// Refuse to start if the port is still taken: Next would silently fall back
// to :3001 and the two servers would corrupt each other's dist dir. Failing
// loudly here is the fix for the "second server" corruption.
//
// The source of truth is a BIND PROBE, not lsof: we attempt the exact bind
// Next itself is about to make (wildcard host unless -H was passed, so the
// same `::` dual-stack semantics), and only start if it succeeds. A probe
// can't be fooled by a missing/denied/non-POSIX lsof — any bind error fails
// CLOSED, whereas the old `try { sh("lsof …") } catch {}` gate read every
// lsof failure, including "command not found", as "port is free". lsof is
// kept below purely as best-effort diagnostics to NAME the owner.
const host = argValue("-H", "--hostname");

const probePort = () =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (err) => resolve(err));
    probe.listen({ port, host }, () => probe.close(() => resolve(null)));
  });

// SIGKILL above returns before the OS reaps the process and releases its
// socket, so when we just killed a stale server, give the port a beat to
// actually free up instead of failing on our own kill's corpse.
let bindError = await probePort();
for (let i = 0; bindError && killedAny && i < 6; i++) {
  await new Promise((r) => setTimeout(r, 250));
  bindError = await probePort();
}

if (bindError) {
  console.error(
    `[dev] cannot bind ${host ?? "*"}:${port} (${bindError.code ?? bindError.message}) — refusing to start.`,
  );
  try {
    const owner = sh(`lsof -nP -iTCP:${port} -sTCP:LISTEN`);
    if (owner) {
      console.error(`[dev] the port appears to be in use by:`);
      console.error(owner);
    }
  } catch {
    /* lsof unavailable or found nothing — diagnostics only, verdict stands */
  }
  console.error(`[dev] kill the owner or pass a different port, then re-run.`);
  process.exit(1);
}

// ------------------------------------------------------- pick a sane node --
// A runtime is supported when it's one of the LTS majors that don't crash
// the Next dev server on this machine (22, 24) AND satisfies package.json's
// `engines: >=22.3.0` floor. One predicate applied to BOTH the invoking
// runtime and the nvm candidates — previously "even major ≤ 24" let Node 20
// and 22.0–22.2 through as the invoker, and the nvm filter accepted any
// v22.x, both of which violate the declared engines contract.
const ENGINE_FLOOR = [22, 3, 0]; // keep in sync with package.json engines
const isSupportedNode = (version) => {
  const [major, minor = 0, patch = 0] = version.split(".").map(Number);
  if (major !== 22 && major !== 24) return false;
  return (
    major - ENGINE_FLOOR[0] || minor - ENGINE_FLOOR[1] || patch - ENGINE_FLOOR[2]
  ) >= 0;
};

let nodeBin = process.execPath;
if (!isSupportedNode(process.versions.node)) {
  const nvmDir = path.join(homedir(), ".nvm/versions/node");
  let installed = [];
  try {
    installed = readdirSync(nvmDir)
      .filter((v) => isSupportedNode(v.replace(/^v/, "")))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    /* no nvm — handled below */
  }
  const best = installed.at(-1);
  if (!best) {
    console.error(
      `[dev] node ${process.versions.node} is outside the supported range for this` +
        ` repo's dev server (LTS 22.x >= 22.3.0, or 24.x), and no usable build was` +
        ` found in ${nvmDir}.`,
    );
    console.error(`[dev] install one with: nvm install 22`);
    process.exit(1);
  }
  nodeBin = path.join(nvmDir, best, "bin/node");
  console.log(
    `[dev] node ${process.versions.node} is unsupported here — running Next with ${best} from nvm`,
  );
}

// ------------------------------------------------------------------ launch --
const nextBin = path.join(repoRoot, "node_modules/next/dist/bin/next");
const child = spawn(nodeBin, [nextBin, "dev", ...args], { stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => {
  if (signal) console.error(`[dev] dev server was killed with ${signal}`);
  process.exit(code ?? 0);
});
