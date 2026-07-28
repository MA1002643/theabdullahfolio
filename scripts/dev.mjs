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
import { homedir } from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const args = process.argv.slice(2);

const sh = (cmd) =>
  execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

// ----------------------------------------------------------- target port --
const pFlag = args.findIndex((a) => a === "-p" || a === "--port");
const port =
  pFlag !== -1 ? Number(args[pFlag + 1]) : Number(process.env.PORT) || 3000;

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

for (const pid of candidates) {
  if (pid === process.pid || pid === process.ppid) continue;
  let cwd = "";
  try {
    cwd = sh(`lsof -a -p ${pid} -d cwd -Fn | tail -1`).replace(/^n/, "");
  } catch {
    continue; // process already gone
  }
  if (cwd === repoRoot) {
    try {
      process.kill(pid, "SIGKILL");
      console.log(`[dev] killed stale dev server (pid ${pid})`);
    } catch {
      /* raced with its own exit */
    }
  }
}

// Refuse to start if the port is still taken: Next would silently fall back
// to :3001 and the two servers would corrupt each other's dist dir. Failing
// loudly here is the fix for the "second server" corruption.
try {
  const owner = sh(`lsof -nP -iTCP:${port} -sTCP:LISTEN`);
  if (owner) {
    console.error(`[dev] port ${port} is still in use by another process:`);
    console.error(owner);
    console.error(`[dev] kill it or pass a different port, then re-run.`);
    process.exit(1);
  }
} catch {
  /* lsof exits non-zero when the port is free — the good case */
}

// ------------------------------------------------------- pick a sane node --
let nodeBin = process.execPath;
const major = Number(process.versions.node.split(".")[0]);
if (major % 2 === 1 || major > 24) {
  const nvmDir = path.join(homedir(), ".nvm/versions/node");
  let installed = [];
  try {
    installed = readdirSync(nvmDir)
      .filter((v) => /^v(22|24)\./.test(v))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    /* no nvm — handled below */
  }
  const best = installed.at(-1);
  if (!best) {
    console.error(
      `[dev] node ${process.versions.node} crashes the Next dev server on this machine,` +
        ` and no LTS build was found in ${nvmDir}.`,
    );
    console.error(`[dev] install one with: nvm install 22`);
    process.exit(1);
  }
  nodeBin = path.join(nvmDir, best, "bin/node");
  console.log(
    `[dev] node ${process.versions.node} is not LTS — running Next with ${best} from nvm`,
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
