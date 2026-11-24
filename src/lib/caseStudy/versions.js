// Versions for the "Built with" chapter, read at build (issue #31, owner
// review 2026-11-15).
//
// A stack item never TYPES a version. It names the package (`pkg`) and this
// reads the version the build actually installs from package-lock.json, the
// same source the /uses bill of materials uses (src/lib/uses/buildFacts.js),
// falling back to the manifest range with its operator stripped when the
// lockfile lacks the entry. `derive: 'node'` reads the runtime major from
// `engines.node` through the same resolver /uses publishes. So the chapter
// cannot drift from the thing it describes (CLAUDE.md §2).
//
// Server-only: it reads the filesystem. Every project page is prerendered,
// so this runs at build and never per request.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveVercelNodeMajor } from '@/lib/uses/buildFacts';

const cache = new Map();

function readJson(root, file) {
  const key = `${root}:${file}`;
  if (!cache.has(key)) {
    let value = null;
    try {
      value = JSON.parse(readFileSync(join(root, file), 'utf8'));
    } catch {
      value = null;
    }
    cache.set(key, value);
  }
  return cache.get(key);
}

/** `^16.4.6` → `16.4.6`; `~5.9.3` → `5.9.3`; a range we cannot read → null. */
const plainVersion = (range) => {
  const m = typeof range === 'string' ? range.match(/\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?/) : null;
  return m ? m[0] : null;
};

/**
 * The version string a stack item shows, or null when it has no package and
 * nothing to derive (a language, a service).
 *
 * @param {{ pkg?: string, derive?: 'node' }} item
 * @param {{ root?: string }} [options]
 * @returns {string | null}
 */
export function resolveStackVersion(item, { root = process.cwd() } = {}) {
  if (item.derive === 'node') {
    const pkg = readJson(root, 'package.json');
    const major = resolveVercelNodeMajor(pkg?.engines?.node ?? '');
    return major ? String(major) : null;
  }
  if (!item.pkg) return null;
  const lock = readJson(root, 'package-lock.json');
  const installed = lock?.packages?.[`node_modules/${item.pkg}`]?.version;
  if (typeof installed === 'string') return installed;
  const pkg = readJson(root, 'package.json');
  const range = pkg?.dependencies?.[item.pkg] ?? pkg?.devDependencies?.[item.pkg];
  if (!range) throw new Error(`caseStudy stack: "${item.pkg}" is not a dependency in package.json`);
  return plainVersion(range);
}

/** For tests: forget what was read. */
export function resetVersionCache() {
  cache.clear();
}
