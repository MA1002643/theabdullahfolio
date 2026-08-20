import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Font + artwork loading for the OG card renderers (issue #88 v2).
// Everything is read once per process and cached as a module-level
// promise — a build renders many cards, a warm lambda serves many
// crawlers, and neither should touch the filesystem twice.
//
// The `path.join(process.cwd(), 'literal/…')` shape matters: Vercel's
// file tracer bundles files it can prove are read, and it can only
// prove literals. Do not refactor these into computed paths.

let fontsPromise;
export function ogFonts() {
  fontsPromise ??= Promise.all([
    readFile(path.join(process.cwd(), 'src/lib/og/fonts/Montserrat-800.ttf')),
    readFile(path.join(process.cwd(), 'src/lib/og/fonts/Inter-600.ttf')),
  ]).then(([montserrat, inter]) => [
    { name: 'Montserrat', data: montserrat, weight: 800, style: 'normal' },
    { name: 'Inter', data: inter, weight: 600, style: 'normal' },
  ]);
  return fontsPromise;
}

let monogramPromise;
export function monogramDataUri() {
  monogramPromise ??= readFile(
    path.join(process.cwd(), 'src/lib/og/assets/monogram.png'),
  ).then((buf) => `data:image/png;base64,${buf.toString('base64')}`);
  return monogramPromise;
}

let badgePromise;
export function badgeDataUri() {
  badgePromise ??= readFile(
    path.join(process.cwd(), 'src/lib/og/assets/badge.png'),
  ).then((buf) => `data:image/png;base64,${buf.toString('base64')}`);
  return badgePromise;
}
