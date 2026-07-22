#!/usr/bin/env node
'use strict';

/**
 * README automation script.
 *
 * Reads package.json, extracts current dependency versions, and rewrites
 * every <!-- TAG:START --> … <!-- TAG:END --> block in README.md.
 *
 * Sections managed:
 *   HERO-BADGES   — large for-the-badge stack overview row
 *   QUALITY-BADGES — flat-square meta row (includes last-synced date)
 *   STACK-CORE    — Core framework inline badges + version table
 *   STACK-3D      — 3D & Animation inline badges + version table
 *   STACK-DATA    — Data & Integration version table
 *   STACK-UI      — UI & Utilities version table
 *
 * Usage:  node .github/scripts/update-readme.js
 */

const fs = require('fs');
const path = require('path');

// ── Version helpers ───────────────────────────────────────────────────────────

/** Strip semver range operators (^, ~, >=, etc.) */
function clean(raw = '') {
  return raw.replace(/^[\^~>=<]+/, '').trim();
}

/** Return the major version number as a string */
function major(raw) {
  return clean(raw).split('.')[0];
}

/** Return "major.minor" as a string */
function minorVersion(raw) {
  const parts = clean(raw).split('.');
  return `${parts[0]}.${parts[1]}`;
}

/** Convert Three.js semver (0.162.0) to r-notation (r162) */
function threeLabel(raw) {
  return `r${clean(raw).split('.')[1]}`;
}

/** Return today's date as YYYY-MM-DD */
function today() {
  return new Date().toISOString().split('T')[0];
}

// ── File helpers ──────────────────────────────────────────────────────────────

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Replace the content between <!-- TAG:START --> and <!-- TAG:END --> markers.
 * If a marker pair is missing the function throws so CI surfaces the problem.
 */
function replaceBetween(content, tag, newBlock) {
  const start = `<!-- ${tag}:START -->`;
  const end = `<!-- ${tag}:END -->`;

  if (!content.includes(start) || !content.includes(end)) {
    throw new Error(
      `Missing markers for "${tag}". Expected:\n  ${start}\n  ${end}`
    );
  }

  // Escape special regex characters in the marker strings
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `${escapeRe(start)}[\\s\\S]*?${escapeRe(end)}`,
    'g'
  );

  return content.replace(pattern, `${start}\n${newBlock}\n${end}`);
}

// ── Load dependencies ─────────────────────────────────────────────────────────

const rootDir = path.resolve(__dirname, '..', '..');
const pkg = readJSON(path.join(rootDir, 'package.json'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

const v = {
  // Core
  next: clean(deps['next']),
  nextMajor: major(deps['next']),
  nextMinor: minorVersion(deps['next']),
  react: major(deps['react']),
  tailwind: major(deps['tailwindcss']),
  tailwindMinor: minorVersion(deps['tailwindcss']),

  // 3D & Animation
  three: clean(deps['three']),
  threeMinor: minorVersion(deps['three']),
  threeLabel: threeLabel(deps['three']),
  fiber: minorVersion(deps['@react-three/fiber']),
  drei: minorVersion(deps['@react-three/drei']),
  framer: major(deps['framer-motion']),
  framerMinor: minorVersion(deps['framer-motion']),

  // Data & Integration
  nodemailer: minorVersion(deps['nodemailer']),
  hookForm: minorVersion(deps['react-hook-form']),
  ai: minorVersion(deps['ai']),
  upstashRedis: minorVersion(deps['@upstash/redis']),
  tzLookup: minorVersion(deps['tz-lookup']),
  analytics: minorVersion(deps['@vercel/analytics']),
  speedInsights: minorVersion(deps['@vercel/speed-insights']),

  // UI & Utilities
  lucide: clean(deps['lucide-react']),
  reactIcons: minorVersion(deps['react-icons']),
  sonner: minorVersion(deps['sonner']),
  clsx: minorVersion(deps['clsx']),
  twMerge: minorVersion(deps['tailwind-merge']),
  sharp: minorVersion(deps['sharp']),

  // Meta
  nodeEngine: minorVersion(pkg.engines.node),
  syncDate: today(),
};

// ── Block templates ───────────────────────────────────────────────────────────

const HERO_BADGES = `<p align="center">
  <img src="https://img.shields.io/badge/Next.js-${v.nextMajor}-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-${v.react}-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Three.js-${v.threeLabel}-000000?style=for-the-badge&logo=threedotjs&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/Framer_Motion-${v.framer}-FF0055?style=for-the-badge&logo=framer&logoColor=white" alt="Framer Motion" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-${v.tailwind}-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Vercel-Deployed-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />
</p>`;

const QUALITY_BADGES = `<p align="center">
  <img src="https://img.shields.io/badge/license-Proprietary-ff6d05?style=flat-square" alt="Proprietary License" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" />
  <img src="https://img.shields.io/badge/code_style-prettier-F7B93E?style=flat-square&logo=prettier&logoColor=black" alt="Prettier" />
  <img src="https://img.shields.io/badge/linter-eslint-4B32C3?style=flat-square&logo=eslint" alt="ESLint" />
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A5${v.nodeEngine}-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/last_synced-${v.syncDate.replace(/-/g, '--')}-ff6d05?style=flat-square" alt="Last synced" />
</p>`;

const STACK_CORE = `<p>
  <img src="https://img.shields.io/badge/Next.js-${v.nextMinor}-black?style=flat-square&logo=next.js" alt="Next.js ${v.nextMinor}" />
  <img src="https://img.shields.io/badge/React-${v.react}-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React ${v.react}" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-${v.tailwindMinor}-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS ${v.tailwindMinor}" />
</p>

| Technology | Version | Role |
|------------|---------|------|
| [Next.js](https://nextjs.org/) | \`^${v.nextMinor}\` | App Router, server components, API routes, metadata API |
| [React](https://react.dev/) | \`^${v.react}\` | UI primitives, hooks, concurrent features |
| [Tailwind CSS](https://tailwindcss.com/) | \`^${v.tailwindMinor}\` | Utility-first styling, custom ember / amethyst / night theme |`;

const STACK_3D = `<p>
  <img src="https://img.shields.io/badge/Three.js-${v.threeLabel}-000000?style=flat-square&logo=threedotjs" alt="Three.js ${v.threeLabel}" />
  <img src="https://img.shields.io/badge/@react--three/fiber-${v.fiber}-white?style=flat-square" alt="@react-three/fiber ${v.fiber}" />
  <img src="https://img.shields.io/badge/@react--three/drei-${v.drei}-white?style=flat-square" alt="@react-three/drei ${v.drei}" />
  <img src="https://img.shields.io/badge/Framer_Motion-${v.framerMinor}-FF0055?style=flat-square&logo=framer" alt="Framer Motion ${v.framerMinor}" />
</p>

| Technology | Version | Role |
|------------|---------|------|
| [Three.js](https://threejs.org/) | \`^${v.threeMinor}\` | WebGL 3D scene rendering |
| [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) | \`^${v.fiber}\` | React reconciler for Three.js |
| [@react-three/drei](https://github.com/pmndrs/drei) | \`^${v.drei}\` | OrbitControls, Environment presets, HTML overlays |
| [Framer Motion](https://www.framer.com/motion/) | \`^${v.framerMinor}\` | AnimatePresence, scroll transforms, spring physics, stagger orchestration |`;

const STACK_DATA = `| Technology | Version | Role |
|------------|---------|------|
| GitHub GraphQL API | — | Live stats, language breakdown, contribution data |
| Spotify Web API | — | Live now-playing track for the floating widget — server-side refresh-token exchange (no secret reaches the browser) |
| [Nodemailer](https://nodemailer.com/) | \`^${v.nodemailer}\` | SMTP email delivery for the contact form |
| [react-hook-form](https://react-hook-form.com/) | \`^${v.hookForm}\` | Form state management and validation |
| [AI SDK (\`ai\`)](https://sdk.vercel.ai/) | \`^${v.ai}\` | \`streamText\` routed through the **Vercel AI Gateway** for the contact form's "Refine my message" rewrite (no provider SDK) |
| [@upstash/redis](https://upstash.com/docs/redis) | \`^${v.upstashRedis}\` | Serverless Redis backing the idempotent contact-send store + the footer's latest live-location fix |
| [tz-lookup](https://github.com/darkskyapp/tz-lookup) | \`^${v.tzLookup}\` | Offline coordinates→IANA-timezone lookup for the footer's live-location clock |
| [@vercel/analytics](https://vercel.com/analytics) | \`^${v.analytics}\` | Real-user performance monitoring |
| [@vercel/speed-insights](https://vercel.com/docs/speed-insights) | \`^${v.speedInsights}\` | Core Web Vitals tracking |`;

const STACK_UI = `| Technology | Version | Role |
|------------|---------|------|
| [Lucide React](https://lucide.dev/) | \`^${v.lucide}\` | Primary icon system |
| [React Icons](https://react-icons.github.io/react-icons/) | \`^${v.reactIcons}\` | Extended icon library |
| [Sonner](https://sonner.emilkowal.ski/) | \`^${v.sonner}\` | Toast notification system |
| [clsx](https://github.com/lukeed/clsx) | \`^${v.clsx}\` | Conditional class name utility |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge) | \`^${v.twMerge}\` | Conflict-free Tailwind class merging — the \`cn()\` helper in \`src/lib/utils.js\` |
| [Sharp](https://sharp.pixelplumbing.com/) | \`^${v.sharp}\` | Server-side image optimisation pipeline |`;

// ── Apply all replacements ────────────────────────────────────────────────────

const readmePath = path.join(rootDir, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');

const replacements = [
  ['HERO-BADGES', HERO_BADGES],
  ['QUALITY-BADGES', QUALITY_BADGES],
  ['STACK-CORE', STACK_CORE],
  ['STACK-3D', STACK_3D],
  ['STACK-DATA', STACK_DATA],
  ['STACK-UI', STACK_UI],
];

let updated = 0;
for (const [tag, block] of replacements) {
  try {
    readme = replaceBetween(readme, tag, block);
    updated++;
  } catch (err) {
    console.error(`⚠️  ${err.message}`);
    process.exit(1);
  }
}

fs.writeFileSync(readmePath, readme, 'utf8');

console.log(`✅  README.md updated — ${updated} section(s) synced`);
console.log(`    Next.js  ${v.next}`);
console.log(`    React    ${v.react}`);
console.log(`    Three.js ${v.threeLabel} (${v.three})`);
console.log(`    Framer   ${v.framerMinor}`);
console.log(`    Tailwind ${v.tailwindMinor}`);
console.log(`    Synced   ${v.syncDate}`);
