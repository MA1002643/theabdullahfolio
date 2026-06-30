'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';

/**
 * Contextual recovery line for a near-miss URL. When the visitor
 * mistypes a known route (`/projcts`, `/qualifcations`), the parent
 * resolves the closest match via `suggestRoute` and passes it here as
 * `suggestion`; this renders a single quiet sentence —
 *
 *     Did you mean Projects?
 *
 * — with the route name as an inline accent link. Text-only by
 * design: the page already carries plenty of ambient motion, so the
 * smart part stays in the *substance* (it knew where you were going),
 * not in another visual effect.
 *
 * Renders nothing when there's no confident match, so it never shows
 * a generic/placeholder guess.
 *
 * Entrance is gated on reduced-motion exactly like the rest of the
 * page: `initial={false}` drops the y-slide for vestibular users.
 * The delay (1.0s) slots it into the existing stagger — between the
 * "this page doesn't exist" subtitle (0.8s) and the TAKE ME BACK
 * portal (1.2s) — so it reads as the natural next beat.
 *
 * @param {Object} props
 * @param {{href:string, label:string} | null} [props.suggestion]
 */
export default function DidYouMean({ suggestion }) {
  const prefersReducedMotion = useReducedMotion();

  if (!suggestion) return null;

  return (
    <motion.p
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        prefersReducedMotion ? { duration: 0 } : { delay: 1, duration: 0.5 }
      }
      className="text-sm sm:text-base"
      style={{ color: '#ffaa2a', textShadow: 'none' }}
    >
      Did you mean{' '}
      <Link
        href={suggestion.href}
        prefetch={false}
        className="font-semibold text-[#ff6d05] underline-offset-4 transition-colors duration-200 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05]"
      >
        {suggestion.label}
      </Link>
      ?
    </motion.p>
  );
}
