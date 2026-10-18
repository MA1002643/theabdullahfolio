#!/usr/bin/env node
/**
 * Render the visual-regression baselines in CI's own Linux image (issue #92).
 *
 *   npm run test:visual:update
 *
 * A screenshot baseline is only comparable with a screenshot from the same
 * rasteriser: macOS and Linux anti-alias glyphs differently, and even arm64
 * and amd64 Linux can disagree by a pixel. So baselines are never rendered on
 * a Mac directly. This runs the official Playwright image, pinned to the
 * @playwright/test version in package.json and to linux/amd64 (what GitHub's
 * runners are), inside Docker:
 *
 *   1. the repository is copied IN, minus node_modules (native binaries such
 *      as sharp are per-platform), the build output (it must not clobber your
 *      local build), .git, and every .env*.local (baselines never see real
 *      credentials);
 *   2. it empties the copied snapshot tree, then installs, builds and runs
 *      `--project=visual --update-snapshots=all` against the same stub
 *      environment CI uses;
 *   3. only after that succeeds is tests/visual/__screenshots__/ emptied and
 *      refilled with the fresh render, so a view whose test was removed or
 *      renamed loses its old baseline instead of keeping it forever.
 *
 * Emulating amd64 on Apple silicon is slow (the build dominates); set
 * VISUAL_PLATFORM=linux/arm64 for a quick look, but commit amd64 renders.
 * Without Docker, run the "Visual baselines" workflow from the Actions tab.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.devDependencies['@playwright/test'].replace(/^[^\d]*/, '');
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const platform = process.env.VISUAL_PLATFORM || 'linux/amd64';
const out = path.join(root, 'tests/visual/__screenshots__');
mkdirSync(out, { recursive: true });

// The same non-secret stubs as ci.yml. None is a credential.
const env = {
  CI: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_GITHUB_USERNAME: 'MA1002643',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'ci@example.com',
  SMTP_PASS: 'placeholder',
  RECEIVER_EMAIL: 'ci@example.com',
  AUTH_GITHUB_ID: 'ci-placeholder',
  AUTH_GITHUB_SECRET: 'ci-placeholder',
  AUTH_GOOGLE_ID: 'ci-placeholder',
  AUTH_GOOGLE_SECRET: 'ci-placeholder',
};

const inside = [
  'set -e',
  'mkdir -p /work',
  "tar -C /src --exclude=./node_modules --exclude=./.next --exclude=./.next.nosync --exclude=./.git --exclude='./.env*.local' --exclude=./.stryker-tmp -cf - . | tar -C /work -xf -",
  'cd /work',
  // Render into an EMPTY snapshot tree: Playwright never deletes a snapshot a
  // removed or renamed test left behind, so the copied-in baselines would
  // survive as orphans.
  'rm -rf tests/visual/__screenshots__',
  'npm ci --no-audit --no-fund',
  'npm run build',
  'npx playwright test --project=visual --update-snapshots=all --reporter=list',
  // Reached only if every step above succeeded (set -e): only now is the old
  // set cleared, so a failed run leaves the existing baselines untouched.
  'find /out -mindepth 1 -delete',
  'cp -r tests/visual/__screenshots__/. /out/',
].join(' && ');

console.log(`[visual-baselines] ${image} on ${platform}`);
const result = spawnSync(
  'docker',
  [
    'run', '--rm', '--platform', platform, '--ipc=host',
    '-v', `${root}:/src:ro`,
    '-v', `${out}:/out`,
    ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
    image, 'bash', '-lc', inside,
  ],
  { stdio: 'inherit' },
);
if (result.status === 0) {
  console.log('[visual-baselines] done. Review every changed PNG in the diff before committing it.');
}
process.exit(result.status ?? 1);
