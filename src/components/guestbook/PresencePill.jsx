'use client';

import { useReducedMotion } from 'framer-motion';
import { useCountUp } from '@/hooks/useCountUp';

// The "N here now" pill (issue #40 Phase 4) — the live-presence slot of the
// header meta strip (see GuestbookWall). Purple side of the palette on
// purpose — presence is meta-information, and the pink/purple accent is what
// this site already uses for meta (subtitles, flank pills), keeping ember
// for content. The count is emphasised (semibold, tabular) so the figure
// reads at a glance against the quieter label, matching the strip's other
// pill — and it rolls in with the site's elite count-up (useCountUp: the
// stat cards' sprint-then-settle on mount, a quick roll on live changes).
// The dot's ping is Tailwind's animate-ping (transform + opacity —
// compositor-only) and collapses to a still dot under reduced motion.
export default function PresencePill({ count, active = true }) {
  const reduceMotion = useReducedMotion();
  // Hook order: the count-up must run unconditionally, before the null gate.
  // `active` is the strip's in-view state (GuestbookWall) — the figure
  // re-climbs on every scroll back into view, with the strip's rise.
  const shown = useCountUp(count ?? 0, { active });
  if (!count || count < 1) return null;

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#fc83ff]/30 bg-black/40 px-3 py-1 font-mono text-xs text-[#fc83ff]">
      <span aria-hidden="true" className="relative flex h-2 w-2">
        {!reduceMotion ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#fc83ff] opacity-60" />
        ) : null}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#fc83ff]" />
      </span>
      <span>
        <span className="font-semibold tabular-nums">{shown}</span> here now
      </span>
    </span>
  );
}
