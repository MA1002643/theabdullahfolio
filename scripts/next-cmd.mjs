#!/usr/bin/env node
/**
 * Runs a Next CLI subcommand under a SUPPORTED Node.
 *
 *   node scripts/next-cmd.mjs build   →  next build
 *   node scripts/next-cmd.mjs start   →  next start
 *   node scripts/next-cmd.mjs lint    →  next lint
 *
 * `npm run dev` has been guarded against Homebrew's Node 25 since dev.mjs
 * landed, but `npm run build` was still a bare `next build` and inherited
 * whatever Node invoked npm. That gap is not theoretical: an interactive
 * shell picks up Node 22 through the nvm wrapper, while anything spawning
 * npm WITHOUT that shell (an agent, an editor task, a bare `sh -c`) gets
 * Homebrew's v25 — and a build leans on the same webpack cache serialization
 * that the v25 V8 bug corrupts, so it is if anything more exposed than dev.
 *
 * Kept separate from dev.mjs because dev's real work is the single-server
 * port gate; these commands need none of that, only the runtime check.
 */
import { spawn } from "node:child_process";
import { constants } from "node:os";
import path from "node:path";

const { signals } = constants;
import { resolveSupportedNodeBin } from "./supported-node.mjs";

const [subcommand, ...args] = process.argv.slice(2);

if (!subcommand) {
  console.error("[next-cmd] usage: node scripts/next-cmd.mjs <build|start|lint> [args…]");
  process.exit(1);
}

// Not `required`: see resolveSupportedNodeBin. A build on an odd Node with no
// nvm available should still run — warned — rather than fail in a way plain
// `next build` never would.
const nodeBin = resolveSupportedNodeBin({
  tag: subcommand,
  what: subcommand,
  required: false,
});

const nextBin = path.join(process.cwd(), "node_modules/next/dist/bin/next");
const child = spawn(nodeBin, [nextBin, subcommand, ...args], {
  stdio: "inherit",
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));

// A spawn failure means the RUNTIME never started — most plausibly a stale nvm
// path from resolveSupportedNodeBin after that version was uninstalled. Node
// does exit non-zero on an unhandled 'error' event, but it buries "that node is
// gone" under a stack trace pointing into internal/child_process.
child.on("error", (err) => {
  console.error(`[${subcommand}] could not start ${nodeBin}: ${err.message}`);
  process.exit(1);
});

// A signal death sets code=null and signal=NAME, so the old `code ?? 0`
// reported SUCCESS for exactly the failure class this wrapper exists to catch:
// a `next build` killed by the OOM killer (SIGKILL) or by a CI runner's
// SIGTERM would leave a half-written .next behind and still let `npm run build`
// pass. Signals map to 128+n — the shell convention — so the status says WHICH
// signal rather than a flat 1.
child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[${subcommand}] killed with ${signal}`);
    process.exit(128 + (signals[signal] ?? 1));
  }
  process.exit(code ?? 1);
});
