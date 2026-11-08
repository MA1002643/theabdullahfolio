import { describe, expect, it } from 'vitest';

import { read, walk } from '../support/source.js';

// `npm ci` in CI must not download a binary nothing in CI uses.
//
// ffmpeg-static, a devDependency for the local asset scripts in scripts/scene/,
// fetches a ~70 MB ffmpeg build from GitHub Releases in its install step. On
// 2026-11-08 Releases answered 504 and `npm ci` failed in every job of the run,
// although no CI step runs ffmpeg. Its installer skips the download when
// FFMPEG_BIN names an existing file, so every workflow that installs
// dependencies sets it at the workflow level. A new workflow that forgets it
// fails here instead of on the next Releases outage.

const WORKFLOWS = walk('.github/workflows', /\.ya?ml$/);
const INSTALLS = /^\s*(?:-\s*)?run:\s*npm (?:ci|install)\b/m;

// FFMPEG_BIN inside the TOP-LEVEL `env:` block: the lines after `env:` up to
// the next unindented key.
const topLevelEnv = (yaml) => {
  const match = /^env:\n((?:(?:[ \t].*)?\n)*)/m.exec(yaml);
  return match ? match[1] : '';
};

describe('CI installs are hermetic', () => {
  it('finds the workflows that install dependencies', () => {
    expect(WORKFLOWS.filter((f) => INSTALLS.test(read(f))).length).toBeGreaterThan(0);
  });

  it('every workflow that runs npm ci / npm install skips the ffmpeg-static download', () => {
    const offenders = WORKFLOWS.filter((file) => {
      const yaml = read(file);
      return INSTALLS.test(yaml) && !/^ {2}FFMPEG_BIN: \/usr\/bin\/true\s*$/m.test(topLevelEnv(yaml));
    });
    expect(
      offenders,
      'Set `FFMPEG_BIN: /usr/bin/true` in the workflow-level env: ffmpeg-static downloads from GitHub Releases on install, and CI never runs ffmpeg.',
    ).toEqual([]);
  });
});
