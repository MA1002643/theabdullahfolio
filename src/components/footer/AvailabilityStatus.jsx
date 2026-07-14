'use client';

// Availability signal for the footer identity block (issue #30 redesign).
//
// The design system rations status dots hard: they're only earned when they
// convey REAL semantic state. A job-seeking engineer's availability is exactly
// that, so this is ONE breathing dot + an honest "open to new roles" line.
//
// The owner's live local time + current town used to trail this line; it now
// lives in its own engraved plate down in the calling card (LiveLocation.jsx),
// so this stays a single clean statement and the live clock still shows exactly
// once. Toggle the whole line via `availability.open` in footer-data.js.
//
// The dot is a steady, fully-lit core wrapped in one soft halo that BREATHES in
// and out on a symmetric ease-in-out (rest → peak → rest), so the infinite loop
// has no seam — a calm heartbeat, not a strobe. Transform/opacity only (GPU);
// under prefers-reduced-motion only the steady core remains.

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { availability } from './footer-data';

// `className` lets the caller place the line — it lives inline in the footer's
// full-width reach strip (no top margin), but the prop keeps it reusable.
export default function AvailabilityStatus({ className }) {
  const reduced = useReducedMotion();

  if (!availability.open) return null;

  return (
    <p
      className={cn(
        'flex items-center gap-x-2.5 text-[0.82rem] text-[#a3a3a3]',
        className,
      )}
    >
      <span
        className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        {!reduced && (
          <motion.span
            className="absolute h-2.5 w-2.5 rounded-full bg-[#ff6d05] blur-[2px]"
            initial={{ opacity: 0.4, scale: 1 }}
            animate={{ opacity: [0.4, 0.75, 0.4], scale: [1, 2.3, 1] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <span className="relative h-[7px] w-[7px] rounded-full bg-[#ff6d05] shadow-[0_0_6px_rgba(255,109,5,0.9)]" />
      </span>

      <span className="font-medium text-foreground">{availability.label}</span>
    </p>
  );
}
