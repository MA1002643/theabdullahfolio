#!/usr/bin/env node
/**
 * First-load JavaScript budget per route (issue #92, L8). Run after
 * `next build`:
 *
 *   node scripts/check-bundle-budget.mjs            check against bundle-budget.json
 *   node scripts/check-bundle-budget.mjs --update   re-measure and rewrite the budget
 *
 * "First load" is what a visitor downloads to open a route cold: every
 * `<script src>` in the route's prerendered HTML, which is the runtime chunks
 * every page shares, every layout on the route's path, and the page's own
 * chunks. Each file is gzipped (level 9, which is close to what a CDN serves)
 * and the total compared with the committed budget. `noModule` polyfills are
 * left out: a browser that runs this site's modules never fetches them.
 *
 * Read from the HTML since Next 16, which no longer writes the
 * app-build-manifest.json this used to read. The HTML is also what the browser
 * actually receives, and it reads the same under webpack or Turbopack. A
 * dynamic template (`/projects/[id]`) is measured on every prerendered page
 * (`prerender-manifest.json` maps each one back) and budgeted at the largest.
 *
 * The budget is the MEASURED size plus 10% headroom, not an aspiration: an
 * aspirational number fails on the first build and is disabled within a week
 * (lighthouserc.json's own reasoning). 10% absorbs dependency patch churn;
 * a feature that adds a library to a page crosses it and must say so in review
 * by running --update, which puts the new number in the diff.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const BUDGET_FILE = path.join(root, 'bundle-budget.json');
const HEADROOM = 0.1;
const update = process.argv.includes('--update');

const distDir = [process.env.NEXT_DIST_DIR, '.next.nosync', '.next']
  .filter(Boolean)
  .find((d) => existsSync(path.join(root, d, 'prerender-manifest.json')));
if (!distDir) {
  console.error('[bundle-budget] no build output found; run `npm run build` first.');
  process.exit(2);
}

const prerendered = JSON.parse(readFileSync(path.join(root, distDir, 'prerender-manifest.json'), 'utf8')).routes;
const appDir = path.join(root, distDir, 'server', 'app');

const gz = new Map();
const sizeOf = (file) => {
  if (!gz.has(file)) gz.set(file, gzipSync(readFileSync(path.join(root, distDir, file)), { level: 9 }).length);
  return gz.get(file);
};

const htmlFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });

// Module scripts only: `noModule` polyfills load in no browser this site runs in.
const SCRIPT = /<script(?![^>]*\bnoModule\b)[^>]*\bsrc="\/_next\/(static\/[^"?]+\.js)"/g;

const measured = {};
for (const file of htmlFiles(appDir)) {
  // "(sub pages)/projects/1.html" → "/projects/1"; route groups vanish from URLs.
  const url = `/${path.relative(appDir, file).replace(/\.html$/, '')}`.replace(/\/\([^)]+\)/g, '').replace(/^\/index$/, '/');
  const route = prerendered[url]?.srcRoute ?? url;
  // URLs are percent-encoded: "(sub pages)" arrives as "(sub%20pages)".
  const js = new Set([...readFileSync(file, 'utf8').matchAll(SCRIPT)].map((m) => decodeURIComponent(m[1])));
  const bytes = [...js].reduce((sum, f) => sum + sizeOf(f), 0);
  measured[route] = Math.max(measured[route] ?? 0, bytes);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

if (update) {
  const routes = Object.fromEntries(
    Object.entries(measured)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([route, bytes]) => [route, Math.ceil((bytes * (1 + HEADROOM)) / 1024) * 1024]),
  );
  writeFileSync(
    BUDGET_FILE,
    `${JSON.stringify(
      {
        $comment:
          'First-load JS per route, gzipped bytes: measured + 10% headroom. Regenerate with `npm run test:bundle:update` and explain the change in review. See scripts/check-bundle-budget.mjs.',
        routes,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[bundle-budget] wrote ${Object.keys(routes).length} route budgets to bundle-budget.json`);
  process.exit(0);
}

if (!existsSync(BUDGET_FILE)) {
  console.error('[bundle-budget] bundle-budget.json is missing; run with --update to create it.');
  process.exit(2);
}
const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8')).routes;

const rows = [];
const failures = [];
for (const route of Object.keys({ ...budget, ...measured }).sort()) {
  const size = measured[route];
  const limit = budget[route];
  if (size === undefined) {
    failures.push(`${route}: in the budget but no longer built (remove it with --update)`);
    rows.push(`| \`${route}\` | — | ${kb(limit)} | ❌ gone |`);
  } else if (limit === undefined) {
    failures.push(`${route}: new route with no budget (add one with --update)`);
    rows.push(`| \`${route}\` | ${kb(size)} | — | ❌ unbudgeted |`);
  } else {
    const ok = size <= limit;
    if (!ok) failures.push(`${route}: ${kb(size)} exceeds its ${kb(limit)} budget`);
    rows.push(`| \`${route}\` | ${kb(size)} | ${kb(limit)} | ${ok ? '✅' : '❌ over'} ${Math.round((size / limit) * 100)}% |`);
  }
}

const summary = [
  '### First-load JS budget',
  '',
  '| Route | First load (gzip) | Budget | |',
  '|---|---:|---:|---|',
  ...rows,
  '',
  failures.length ? `❌ ${failures.length} over budget:\n\n${failures.map((f) => `- ${f}`).join('\n')}` : '✅ Every route is within budget.',
  '',
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
process.exit(failures.length ? 1 : 0);
