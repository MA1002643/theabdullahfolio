import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ENGINE_FLOORS, isSupportedNode } from '../../scripts/supported-node.mjs';

// One supported Node range, stated in three places that must agree.
//
// `engines.node` is what npm enforces (`.npmrc` sets engine-strict),
// `ENGINE_FLOORS` is what the dev/build launchers enforce, and `.nvmrc` is the
// version a contributor actually gets. They drifted once: `.nvmrc` pinned
// 22.14.0 after the lockfile's Babel 8 had already raised the floor to 22.18.0,
// so a strict install on the pinned version failed (2026-10-11).

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const nvmrc = readFileSync('.nvmrc', 'utf8').trim();

// `^22.18.0 || ^24.11.0` → { 22: [22, 18, 0], 24: [24, 11, 0] }
const enginesFloors = Object.fromEntries(
  pkg.engines.node.split('||').map((part) => {
    const match = part.trim().match(/^\^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) throw new Error(`engines.node part "${part.trim()}" is not a caret range`);
    const version = match.slice(1).map(Number);
    return [version[0], version];
  }),
);

describe('supported Node range', () => {
  it('the launchers enforce exactly the engines range', () => {
    expect(ENGINE_FLOORS).toEqual(enginesFloors);
  });

  it('.nvmrc pins a version inside it', () => {
    expect(isSupportedNode(nvmrc), `.nvmrc ${nvmrc} is outside engines ${pkg.engines.node}`).toBe(true);
  });

  it.each([
    ['22.18.0', true],
    ['22.23.3', true],
    ['22.17.9', false],
    ['24.11.0', true],
    ['24.10.9', false],
    ['25.0.0', false],
    ['23.11.0', false],
    ['20.19.0', false],
  ])('%s → %s', (version, expected) => {
    expect(isSupportedNode(version)).toBe(expected);
  });
});
