#!/usr/bin/env node
/**
 * Render every visual-regression view and file it under tests/visual/__latest__/
 * (issue #92). Run by .github/workflows/visual-baselines.yml on every push;
 * needs a production build and Playwright's Chromium, like any browser run.
 *
 *   VISUAL=1 node scripts/render-visual-latest.mjs            render → __latest__
 *   VISUAL=1 PROMOTE=1 node scripts/render-visual-latest.mjs  …and adopt as baselines
 *
 * Playwright can only write screenshots to the snapshot path the tests compare
 * against (tests/visual/__screenshots__/), so the script renders THERE, moves
 * the result to __latest__, and puts the reviewed baselines back. Baselines are
 * replaced only when none exist yet (the first render arms the visual layer) or
 * when PROMOTE=1 asks for it. Then it writes __latest__/README.md: every view,
 * its image, and whether it differs from the baseline, so the diff that needs
 * review is listed rather than discovered.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const BASE = path.join(root, 'tests/visual/__screenshots__');
const LATEST = path.join(root, 'tests/visual/__latest__');
const promote = process.env.PROMOTE === '1';

const pngs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true })
        .map(String)
        .filter((f) => f.endsWith('.png'))
        .sort()
    : [];

// 1. Set the reviewed baselines aside.
const hadBaselines = pngs(BASE).length > 0;
const backup = mkdtempSync(path.join(tmpdir(), 'visual-baselines-'));
if (hadBaselines) cpSync(BASE, backup, { recursive: true });

// 2. Render every view into the snapshot path.
const run = spawnSync('npx', ['playwright', 'test', '--project=visual', '--update-snapshots=all', '--reporter=list'], {
  stdio: 'inherit',
  env: { ...process.env, VISUAL: '1' },
});
if (run.status !== 0) {
  console.error('[visual] the render run failed; nothing filed.');
  if (hadBaselines) {
    rmSync(BASE, { recursive: true, force: true });
    cpSync(backup, BASE, { recursive: true });
  }
  process.exit(run.status ?? 1);
}

// 3. The fresh render becomes __latest__.
rmSync(LATEST, { recursive: true, force: true });
cpSync(BASE, LATEST, { recursive: true });

// 4. Baselines: restore the reviewed set, unless seeding or promoting.
const adopted = !hadBaselines || promote;
if (!adopted) {
  rmSync(BASE, { recursive: true, force: true });
  cpSync(backup, BASE, { recursive: true });
}
rmSync(backup, { recursive: true, force: true });

// 5. The gallery.
const rows = pngs(LATEST).map((rel) => {
  const latest = readFileSync(path.join(LATEST, rel));
  const basePath = path.join(BASE, rel);
  const status = !existsSync(basePath)
    ? '🆕 no baseline'
    : Buffer.compare(latest, readFileSync(basePath)) === 0
      ? '✅ matches baseline'
      : '⚠️ differs from baseline';
  return { rel, status, kb: (statSync(path.join(LATEST, rel)).size / 1024).toFixed(0) };
});
const changed = rows.filter((r) => r.status.startsWith('⚠️')).length;
const sha = (process.env.GITHUB_SHA || '').slice(0, 7);
const readme = [
  '# Latest visual render',
  '',
  `Rendered${sha ? ` for \`${sha}\`` : ''} by \`.github/workflows/visual-baselines.yml\` on every push (issue #92).`,
  'These are the CURRENT screenshots. The reviewed baselines CI compares against live in',
  '`../__screenshots__/`; promote a render to baseline by running the workflow with `promote: true`.',
  '',
  adopted
    ? hadBaselines
      ? '**This render was promoted to the baselines.**'
      : '**No baselines existed, so this render seeded them** (the visual layer is now armed in CI).'
    : changed
      ? `**${changed} view(s) differ from their baseline.** Review them, then promote or fix.`
      : 'Every view matches its baseline.',
  '',
  '| View | Status | Size |',
  '|---|---|---:|',
  ...rows.map((r) => `| \`${r.rel}\` | ${r.status} | ${r.kb} kB |`),
  '',
  ...rows.flatMap((r) => [`### ${r.rel}`, '', `![${r.rel}](${r.rel.split(path.sep).map(encodeURIComponent).join('/')})`, '']),
].join('\n');
writeFileSync(path.join(LATEST, 'README.md'), `${readme}\n`);
console.log(readme);
