'use client';

// Circular playback-progress arc drawn AROUND the album art. This is the
// widget's "alive" tell: NowPlaying advances `progress` locally every second
// from Spotify's reported position, so the ring visibly creeps forward in real
// time between the 30s polls instead of sitting frozen.
//
// Pure SVG, no animation library: the arc is a stroked circle whose
// `strokeDashoffset` is set from progress. Rotated −90° so 0% starts at 12
// o'clock and fills clockwise. The faint full-circle "track" sits behind it so
// the remaining time still reads as a ring rather than a gap.

export default function ProgressRing({
  size = 46,
  stroke = 2,
  progress = 0, // 0 → 1
  accent = '#e6a34d',
  trackColor = 'rgb(255 255 255 / 0.12)',
  reduceMotion = false,
  className = '',
  children,
}) {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - p);
  const center = size / 2;

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            // Snap (no tween) under reduced motion — the arc still updates each
            // poll, it just doesn't animate the perpetual per-second creep.
            transition: reduceMotion
              ? 'none'
              : 'stroke-dashoffset 900ms linear, stroke 400ms ease',
          }}
        />
      </svg>
      {/* Album art (or fallback) is slotted in the middle, inset from the ring. */}
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: stroke + 2.5 }}
      >
        {children}
      </div>
    </div>
  );
}
