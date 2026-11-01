import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware drop-ins for next/link and next/navigation. Every internal link
// on the site goes through these, so a visitor reading in Arabic stays in
// Arabic as they move around: `<Link href="/about">` renders `/ar/about` there
// and `/about` in English. `usePathname()` returns the path WITHOUT the locale
// prefix, which is what every existing `pathname === '/projects'` comparison in
// the codebase already expects.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
