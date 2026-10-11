import { describe, expect, it } from 'vitest';

import { read, stripComments, walk } from '../support/source.js';

// Route segment config must be declared in the file that uses it (Next 15).
//
// Next reads `dynamicParams`, `revalidate` and the rest statically from each
// route module's own source. A value re-exported from a sibling
// (`export { dynamicParams } from './opengraph-image'`) is NOT read: the build
// prints one warning and quietly applies the default. Both `twitter-image.js`
// files did exactly that after the Next 15 upgrade (2026-10-11), so their param
// sets reopened (`dynamicParams` back to `true`) while the build stayed green.
// A warning in a long build log is easy to miss, so this reads the source.

const SEGMENT_CONFIG = [
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
];

const reExportBlocks = (code) => [...code.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)];

describe('route segment config is declared, never re-exported', () => {
  const files = walk('src/app');

  it('finds the app directory', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s', (file) => {
    const reExported = reExportBlocks(stripComments(read(file))).flatMap((m) =>
      m[1]
        .split(',')
        .map((name) => name.trim().split(/\s+as\s+/).pop())
        .filter((name) => SEGMENT_CONFIG.includes(name)),
    );
    expect(
      reExported,
      `${file} re-exports route segment config; Next ignores it and uses the default. Declare it here instead.`,
    ).toEqual([]);
  });
});
