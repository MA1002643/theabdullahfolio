import { describe, expect, it } from 'vitest';

import { read } from '../support/source.js';

// The Tailwind toolchain has to agree with itself. A major version is not a
// bump: v3 and v4 differ in the PostCSS plugin, the stylesheet entry point and
// where the config lives, so a dependency PR that only moves the version in
// package.json breaks every build.
//
// That happened with PR #169 (Tailwind 3 → 4, merged 2026-10-18). CI failed on
// `next build`. Vercel did not, because it restored a cached node_modules that
// still held v3, so production kept deploying v3 CSS and looked healthy. The
// next uncached deploy would have failed. This test names the mismatch
// directly, whichever way it runs.

const installed = JSON.parse(
  read('node_modules/tailwindcss/package.json'),
).version;
const declared = JSON.parse(read('package.json')).devDependencies.tailwindcss;
const major = Number(installed.split('.')[0]);

const postcss = read('postcss.config.js');
const globals = read('src/app/globals.css');

describe('tailwind toolchain — version, PostCSS plugin and entry CSS agree', () => {
  it('installs the major that package.json declares', () => {
    expect(declared.replace(/^[^\d]*/, '').split('.')[0]).toBe(String(major));
  });

  it('wires the PostCSS plugin that this major ships', () => {
    if (major >= 4) {
      expect(postcss).toMatch(/['"]@tailwindcss\/postcss['"]/);
    } else {
      expect(postcss).toMatch(/\btailwindcss\s*:/);
      expect(postcss).not.toMatch(/@tailwindcss\/postcss/);
    }
  });

  it('enters the stylesheet the way this major expects', () => {
    if (major >= 4) {
      expect(globals).toMatch(/@import\s+['"]tailwindcss['"]/);
      expect(globals).not.toMatch(/@tailwind\s+(base|components|utilities)/);
    } else {
      expect(globals).toMatch(/@tailwind\s+base/);
      expect(globals).toMatch(/@tailwind\s+utilities/);
    }
  });
});
