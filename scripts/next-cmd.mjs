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
import path from "node:path";
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
child.on("exit", (code, signal) => {
  if (signal) console.error(`[${subcommand}] killed with ${signal}`);
  process.exit(code ?? 0);
});
