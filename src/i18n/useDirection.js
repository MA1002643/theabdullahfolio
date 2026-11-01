import { useLocale } from 'next-intl';
import { dirFor } from './locales';

/**
 * Reading direction of the active locale (issue #82).
 *
 * CSS should not need this — logical properties and Tailwind's `rtl:` variant
 * mirror layout on their own. It exists for the motion that CSS cannot see:
 * framer-motion `x` offsets, drag constraints, the orbit's rotation sense,
 * canvas coordinates. Multiply a horizontal quantity by `sign` and the motion
 * enters from the reading-start side in both directions.
 *
 * @returns {{ dir: 'ltr' | 'rtl', isRtl: boolean, sign: 1 | -1 }}
 */
export function useDirection() {
  const dir = dirFor(useLocale());
  const isRtl = dir === 'rtl';
  return { dir, isRtl, sign: isRtl ? -1 : 1 };
}
