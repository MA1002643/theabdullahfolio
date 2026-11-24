// Brand marks for the "Built with" tiles (issue #31, owner review 2026-11-15).
//
// Simple Icons, rendered inline from `react-icons` (already a dependency; the
// Now Playing widget draws Spotify from the same set). Self-hosted SVG paths
// in the server HTML: no request to an icon CDN, nothing for the privacy
// inventory. Since the owner request of 2026-11-23 every mark wears its own
// brand colour (`STACK_ICON_COLORS` below — the tile sets it as `--mark`);
// marks whose brand colour is black or near-black take the page ink instead,
// the way those brands themselves render on dark grounds. A slug this map
// does not know renders a monogram (`Monogram` below), never a broken image,
// and a monogram keeps the page's gold.
//
// Server-safe: plain function components, no hooks.

import {
  SiAnthropic,
  SiBootstrap,
  SiCss,
  SiDocker,
  SiEslint,
  SiExpress,
  SiFramer,
  SiGit,
  SiGithub,
  SiGithubactions,
  SiGnubash,
  SiHtml5,
  SiJavascript,
  SiJest,
  SiLighthouse,
  SiLucide,
  SiMarkdown,
  SiMysql,
  SiNextdotjs,
  SiNodedotjs,
  SiPhp,
  SiPostcss,
  SiPostgresql,
  SiPrettier,
  SiPrisma,
  SiPython,
  SiReact,
  SiReacthookform,
  SiRedis,
  SiSharp,
  SiSqlite,
  SiStryker,
  SiTailwindcss,
  SiThreedotjs,
  SiTypescript,
  SiUpstash,
  SiVercel,
  SiVite,
  SiVitest,
  SiVuedotjs,
  SiWebgl,
} from 'react-icons/si';

export const STACK_ICONS = Object.freeze({
  anthropic: SiAnthropic,
  bootstrap: SiBootstrap,
  css: SiCss,
  docker: SiDocker,
  eslint: SiEslint,
  express: SiExpress,
  framer: SiFramer,
  git: SiGit,
  github: SiGithub,
  githubactions: SiGithubactions,
  shell: SiGnubash,
  html: SiHtml5,
  javascript: SiJavascript,
  jest: SiJest,
  lighthouse: SiLighthouse,
  lucide: SiLucide,
  markdown: SiMarkdown,
  mysql: SiMysql,
  next: SiNextdotjs,
  node: SiNodedotjs,
  php: SiPhp,
  postcss: SiPostcss,
  postgresql: SiPostgresql,
  prettier: SiPrettier,
  prisma: SiPrisma,
  python: SiPython,
  react: SiReact,
  reacthookform: SiReacthookform,
  redis: SiRedis,
  sharp: SiSharp,
  sqlite: SiSqlite,
  stryker: SiStryker,
  tailwind: SiTailwindcss,
  three: SiThreedotjs,
  typescript: SiTypescript,
  upstash: SiUpstash,
  vercel: SiVercel,
  vite: SiVite,
  vitest: SiVitest,
  vue: SiVuedotjs,
  glsl: SiWebgl,
});

// Each mark's brand colour (simple-icons' canonical hex), checked against the
// case study's slate ground: a brand whose mark is black or near-black
// (Next.js, Vercel, GitHub, Express, Markdown, Three.js, Prisma, Anthropic)
// is shown the way that brand shows itself on dark — page ink, or the
// brand's own dark-ground tone — and two marks whose flat hex goes muddy on
// the slate (SQLite's navy, WebGL's deep red) take the brighter tone from
// the same logo. The tile publishes this as `--mark`; the glyph, the chip's
// hover border and the card's hover bloom all read it.
const INK = '#f4f4f4';

export const STACK_ICON_COLORS = Object.freeze({
  anthropic: '#d97757', // the brand's own terracotta; its mark hex is near-black
  bootstrap: '#7952b3',
  css: '#663399',
  docker: '#2496ed',
  eslint: '#4b32c3',
  express: INK,
  framer: '#0055ff',
  git: '#f05032',
  github: INK,
  githubactions: '#2088ff',
  shell: '#4eaa25',
  html: '#e34f26',
  javascript: '#f7df1e',
  jest: '#c21325',
  lighthouse: '#f44b21',
  lucide: '#f56565',
  markdown: INK,
  mysql: '#4479a1',
  next: INK,
  node: '#5fa04e',
  php: '#777bb4',
  postcss: '#dd3a0a',
  postgresql: '#4169e1',
  prettier: '#f7b93e',
  prisma: INK,
  python: '#3776ab',
  react: '#61dafb',
  reacthookform: '#ec5990',
  redis: '#ff4438',
  sharp: '#99cc00',
  sqlite: '#0f80cc', // the logo's sky face; its #003b57 base vanishes on slate
  stryker: '#e74c3c',
  tailwind: '#06b6d4',
  three: INK,
  typescript: '#3178c6',
  upstash: '#00e9a3',
  vercel: INK,
  vite: '#646cff',
  vitest: '#6e9f18',
  vue: '#4fc08d',
  glsl: '#e60000', // the bright end of the WebGL logo's red ramp
});

/** The brand colour for a slug, or null for a monogram tile. */
export function stackIconColor(icon) {
  return (icon && STACK_ICON_COLORS[icon]) || null;
}

/** The two letters a tile shows when no mark exists: "Pl" for Playwright. */
export function monogramOf(label) {
  const letters = String(label).replace(/[^\p{L}\p{N}]/gu, '');
  if (!letters) return '?';
  return letters.charAt(0).toUpperCase() + letters.slice(1, 2);
}

/**
 * The glyph for a tile: the brand mark when the slug is known, else the
 * monogram. Decorative either way (the tile's name is its text), so it is
 * hidden from assistive tech.
 */
export function StackGlyph({ icon, label, className }) {
  const Icon = icon ? STACK_ICONS[icon] : null;
  if (Icon) return <Icon aria-hidden="true" focusable="false" className={className} />;
  return (
    <span aria-hidden="true" className={`${className ?? ''} cs-stack__monogram`.trim()} translate="no">
      {monogramOf(label)}
    </span>
  );
}
