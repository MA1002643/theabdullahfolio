import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Standard shadcn `cn` helper: clsx for conditional class composition, then
// tailwind-merge to dedupe conflicting Tailwind utilities. Imported by shadcn
// registry components (e.g. skiper-ui) via the `@/lib/utils` alias.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
