'use client';

import { m } from 'framer-motion';
import { MONO_D, MONO_VIEWBOX } from '@/components/emblem/monogram';
import { breaksWhenSplit } from '@/components/ui/textSegments';
import { EMBER_PALETTE } from './passagePalette';

// The Ember Passage at rest: the mark, the destination name, and a plain
// cross-fade. No canvas, no GL context, no rAF loop.
//
// It is what reduced-motion visitors and browsers without WebGL see, and it is
// split out of EmberPassageOverlay so it can stay in the first load while the
// live passage does not (issue #55). PageTransitionProvider renders it
// directly whenever the live runtime is not loaded: always under reduced
// motion (which never fetches the runtime), and for a click that lands before
// the idle-time download has finished.

export default function PassageStill({ phase, label }) {
  const revealing = phase === 'revealing';
  // No tracking at all for joined scripts (issue #82): letter-spacing pulls
  // an Arabic or Devanagari word apart into disconnected letters in the
  // engines that apply it to cursive text.
  const shaped = breaksWhenSplit(label);

  return (
    <m.div
      className="fixed inset-0 z-[9980] flex flex-col items-center justify-center"
      role="presentation"
      aria-hidden="true"
      style={{
        // The same ember the live branch burns, expressed as a still: the
        // mark's own light at the centre, falling away to the darkness the
        // swarm would otherwise have converged into.
        background:
          'radial-gradient(circle at 50% 46%, ' +
          EMBER_PALETTE.ink +
          '1f 0%, ' +
          EMBER_PALETTE.veil +
          ' 46%, #000 100%)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: revealing ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <svg
        viewBox={MONO_VIEWBOX}
        className="h-[clamp(9rem,34vmin,17rem)] w-[clamp(9rem,34vmin,17rem)]"
        aria-hidden="true"
        // The homepage headline's colour and its three-layer halo, restated
        // for an <svg> that cannot carry `.text-glow-stroke-neon` itself.
        style={{ filter: EMBER_PALETTE.glow }}
      >
        <path d={MONO_D} fillRule="evenodd" fill={EMBER_PALETTE.ink} />
      </svg>
      <div
        // Colour and glow come from the utility itself — see the live branch
        // in EmberPassageOverlay.
        className="text-glow-stroke-neon mt-8 text-sm font-[500] uppercase sm:text-base"
        style={{
          letterSpacing: shaped ? 'normal' : '0.42em',
          color: '#000e1700',
          WebkitTextStrokeWidth: '1px',
        }}
      >
        {label}
      </div>
    </m.div>
  );
}
