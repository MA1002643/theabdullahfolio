'use client';

// The little animated equaliser — the universal "audio is playing" glyph.
// Four hair-thin bars bob at staggered speeds via CSS keyframes (defined in
// globals.css), so the motion runs off the main thread and costs no JS frames.
// Tinted with the LIVE album accent rather than a fixed green, so it belongs to
// whatever's playing. Under prefers-reduced-motion the keyframes hold a calm
// static frame (handled in CSS), so it degrades to a tiny static bar cluster.
//
// Rendered only while a track is actually playing — the paused/last-played state
// hides it entirely (see NowPlaying), which is the at-a-glance play/pause tell.

// Cycle the three keyframe classes across the bars so no two adjacent bars share
// a phase — reads as organic rather than a synchronised sweep.
const BAR_CLASSES = [
  'animate-eq-bar-1',
  'animate-eq-bar-2',
  'animate-eq-bar-3',
  'animate-eq-bar-2',
];

export default function SpotifyBars({ accent = '#e6a34d', className = '' }) {
  return (
    <div
      className={`flex items-end gap-[2px] h-3 shrink-0 ${className}`}
      aria-hidden="true"
    >
      {BAR_CLASSES.map((cls, i) => (
        <span
          key={i}
          className={`w-[2px] rounded-full ${cls}`}
          style={{ backgroundColor: accent }}
        />
      ))}
    </div>
  );
}
