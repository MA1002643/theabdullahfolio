'use client';

// Grain + vignette finishing layer (issue #40 Phase 4). One fixed,
// pointer-inert div: film grain from an inline SVG feTurbulence tile
// (data: URI — allowed by the CSP's img-src, no asset to ship) blended
// `overlay` at very low opacity, plus a radial vignette that pools the edges
// of the viewport into darkness. Purely static CSS — nothing animates, so
// there is nothing to gate on reduced motion.
const NOISE_TILE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='128' height='128' filter='url(%23n)'/%3E%3C/svg%3E")`;

export default function GrainOverlay() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40">
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: NOISE_TILE,
          backgroundSize: '128px 128px',
          mixBlendMode: 'overlay',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.32) 100%)',
        }}
      />
    </div>
  );
}
