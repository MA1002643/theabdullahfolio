/**
 * Shared "is this Node allowed to run our toolchain, and if not, where's one
 * that is" logic. Extracted from dev.mjs so every entry point enforces the
 * SAME range rather than dev alone.
 *
 * Why this exists at all: Homebrew's `node` is v25 (odd-numbered, non-LTS,
 * auto-bumped by brew) and crashes Next 14 with silent exits via a V8 bug in
 * webpack's cache serialization. The repo declares `engines: ^22.3.0 ||
 * ^24.0.0` and `.npmrc` sets engine-strict, but that pair only guards INSTALL
 * time — nothing stops an already-installed repo from being LAUNCHED on v25.
 * dev.mjs closed that for `next dev`; this module lets `next build` / `start`
 * / `lint` close it too, since a build runs the very cache serialization the
 * bug lives in.
 */
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// A runtime is supported when it's one of the LTS majors that don't crash Next
// on this machine (22, 24) AND clears the 22.3.0 floor — the same range
// package.json declares. Keep ENGINE_FLOOR in sync with `engines.node`.
const ENGINE_FLOOR = [22, 3, 0];

export const isSupportedNode = (version) => {
  const [major, minor = 0, patch = 0] = version.split(".").map(Number);
  if (major !== 22 && major !== 24) return false;
  return (
    (major - ENGINE_FLOOR[0] ||
      minor - ENGINE_FLOOR[1] ||
      patch - ENGINE_FLOOR[2]) >= 0
  );
};

/**
 * Absolute path to a Node binary that satisfies the engines range.
 *
 * Returns `process.execPath` unchanged when the invoking runtime is already
 * fine — which is the case on Vercel and CI, where the platform honours
 * `engines` — so this costs nothing and touches no filesystem there.
 *
 * @param {object}  opts
 * @param {string}  opts.tag       log prefix, e.g. "dev" or "build"
 * @param {string}  opts.what      human phrase for the error, e.g. "dev server"
 * @param {boolean} opts.required  true  → exit(1) when no supported Node exists
 *                                 false → warn and return the current one
 *
 * `required` is the important knob. `dev` fails closed because a corrupted
 * dist dir is worse than not starting. `build` deliberately does NOT: a
 * machine with no nvm (a fresh clone, a CI image that somehow reports an odd
 * major) should still get today's behaviour — a build that runs — rather than
 * a hard failure this launcher newly invented. Warn, then proceed.
 */
export function resolveSupportedNodeBin({ tag, what, required }) {
  const current = process.versions.node;
  if (isSupportedNode(current)) return process.execPath;

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
    const detail =
      `node ${current} is outside the supported range for this repo's ${what}` +
      ` (LTS 22.x >= 22.3.0, or 24.x), and no usable build was found in ${nvmDir}.`;
    if (required) {
      console.error(`[${tag}] ${detail}`);
      console.error(`[${tag}] install one with: nvm install 22`);
      process.exit(1);
    }
    console.warn(`[${tag}] ${detail}`);
    console.warn(`[${tag}] continuing on node ${current} — expect flakiness.`);
    return process.execPath;
  }

  console.log(
    `[${tag}] node ${current} is unsupported here — running Next with ${best} from nvm`,
  );
  return path.join(nvmDir, best, "bin/node");
}
