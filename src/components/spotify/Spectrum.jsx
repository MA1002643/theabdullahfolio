'use client';

import { useEffect, useRef } from 'react';

// Ambient equaliser ribbon for the EXPANDED card — a row of soft bars that rise
// and fall like a spectrum. It is DECORATIVE, not a real audio analysis: the
// Spotify Web API exposes no live waveform, so the bars are driven by a small
// sum of out-of-phase sine waves. That reads convincingly as "music is moving"
// while being honest — restrained amplitude, accent-tinted, no strobing.
//
// It only runs its rAF loop when `active` (playing + expanded + motion allowed).
// When inactive it paints ONE calm static frame so the card never looks broken,
// and it always cancels the loop on unmount / collapse — no orphaned frames.

const BARS = 28;
const DEFAULT_HEX = 'e6a34d'; // warm-amber fallback when `accent` isn't a valid #rrggbb

export default function Spectrum({
  accent = `#${DEFAULT_HEX}`,
  active = true,
  height = 34,
  className = '',
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    // Size the backing store to the device pixel ratio for crisp bars, but drive
    // layout via CSS width (100%). Re-measure on resize so the ribbon fills the
    // card at any width.
    let width = 0;
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);

    // Parse the accent hex once per effect run for the fill gradient. Validate
    // it's a real 6-digit hex FIRST: a malformed accent would otherwise slip
    // through parseInt as NaN (non-hex chars → bit-shifts to 0 → a silently
    // BLACK gradient) or as a truncated wrong colour (a partial hex like
    // 'e6a34z' parses only 'e6a34'). Falling back to the default amber here
    // means `int` is provably never NaN and the ribbon always renders on-brand.
    const raw = accent.replace('#', '');
    const hex = /^[0-9a-f]{6}$/i.test(raw) ? raw : DEFAULT_HEX;
    const int = parseInt(hex, 16);
    const cr = (int >> 16) & 255;
    const cg = (int >> 8) & 255;
    const cb = int & 255;

    // Vertical fill gradient — identical on every frame (it depends only on
    // accent + height, both effect deps), so build it ONCE here instead of
    // ~60×/sec inside draw(). Taller bars reach higher into its bright top, so
    // amplitude reads as intensity. Gradient coords are user-space and mapped
    // through the current transform at paint time, so reusing the object across
    // frames — and across a resize (height is fixed per run) — is exact.
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.85)`);
    grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0.16)`);

    const gap = 3;

    function draw(t) {
      ctx.clearRect(0, 0, width, height);
      const seconds = t / 1000;
      // Recompute geometry from the CURRENT measured width every frame, so the
      // ribbon fills the card even while the card is still mid-expand-animation
      // (the ResizeObserver keeps `width` fresh; deriving barW here tracks it).
      const barW = Math.max(2, (Math.min(width, 520) - gap * (BARS - 1)) / BARS);
      const usableW = barW * BARS + gap * (BARS - 1);
      const xOffset = Math.max(0, (width - usableW) / 2);

      for (let i = 0; i < BARS; i += 1) {
        // Sum of three incommensurate sines → an organic, non-repeating bob.
        // When inactive we freeze at a calm symmetric profile (no time term).
        const phase = i * 0.55;
        const wobble = active
          ? 0.5 +
            0.28 * Math.sin(seconds * 2.1 + phase) +
            0.14 * Math.sin(seconds * 3.7 + phase * 1.7) +
            0.08 * Math.sin(seconds * 5.3 + phase * 0.6)
          : 0.28 + 0.16 * Math.sin(phase);
        const level = Math.min(1, Math.max(0.06, wobble));
        const barH = level * (height - 2);
        const x = xOffset + i * (barW + gap);
        const y = height - barH;

        ctx.fillStyle = grad;

        // Rounded-top bars — a small radius keeps them soft, not spiky.
        const rad = Math.min(barW / 2, 2);
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x, y + rad);
        ctx.quadraticCurveTo(x, y, x + rad, y);
        ctx.lineTo(x + barW - rad, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + rad);
        ctx.lineTo(x + barW, height);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (active) {
      startRef.current = 0;
      const loop = (ts) => {
        if (!startRef.current) startRef.current = ts;
        draw(ts - startRef.current);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } else {
      // One static frame — a calm resting spectrum.
      draw(0);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (ro) ro.disconnect();
    };
  }, [accent, active, height]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height }}
      aria-hidden="true"
    />
  );
}
