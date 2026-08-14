'use client';
import { useEffect, useRef, useState } from 'react';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { onMediaChange } from '@/lib/mediaQuery';

// The MA seal lighting itself into the rug, once, on arrival.
//
// The seal is baked into the artwork (bake-rug-seal.mjs), so it is already
// there on the very first frame — it cannot animate itself. This layer draws a
// spark that runs around the seal's outer ring like a fuse, then blooms and
// fades out, leaving the baked mark behind it. The scene is unchanged a couple
// of seconds later; what this buys is the MOMENT.
//
// It also answers a real layout problem. The rug sits at roughly 86% of the
// backdrop's height, which at common desktop viewports lands underneath the
// project cards — the seal survives only as slivers between them. The one
// window where nothing covers it is arrival, before the cards have staggered
// in. This effect lives in exactly that window.
//
// ── GEOMETRY ────────────────────────────────────────────────────────────
// The ellipse below IS the seal's outer ring, in the artwork's own 2560x1440
// space, taken from the same homography bake-rug-seal.mjs paints through:
// centre (1393, 1236), semi-axes 268 x 60 (b/a = 0.224, the floor plane seen
// from ~15 degrees above). Screen position is derived with the same
// object-fit: cover projection SceneEmbers uses, and the canvas carries
// `.projects-backdrop`, so it inherits the identical 100lvh box, overscan and
// camera drift as the still, the video and the scrim. There is no second
// source of truth to drift out of sync.
const IW = 2560;
const IH = 1440;
const SEAL = { cx: 1393, cy: 1236, rx: 268, ry: 60 };

const FUSE_MS = 1500; // spark travels the ring
const BLOOM_MS = 900; // flash settles into the baked seal
const TOTAL = FUSE_MS + BLOOM_MS;

const SceneSealIgnite = () => {
  const revealed = useLoaderRevealed();
  const canvasRef = useRef(null);
  const [motionOk, setMotionOk] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setMotionOk(!mq.matches);
    apply();
    return onMediaChange(mq, apply);
  }, []);

  const active = revealed && motionOk && !done;

  useEffect(() => {
    if (!active) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    // CSS-pixel buffer: everything drawn here is a soft glow, so a retina
    // buffer would quadruple fill cost for no visible gain (the same call
    // SceneEmbers makes).
    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    const t0 = performance.now();

    const draw = (now) => {
      const t = now - t0;
      if (t >= TOTAL) {
        setDone(true); // unmount: this must cost nothing for the rest of the visit
        return;
      }
      raf = requestAnimationFrame(draw);

      const cw = canvas.width;
      const ch = canvas.height;
      if (!cw || !ch) return;
      // object-fit: cover + object-center, re-derived (SceneEmbers' math).
      const scale = Math.max(cw / IW, ch / IH);
      const ox = (cw - IW * scale) / 2;
      const oy = (ch - IH * scale) / 2;
      const cx = ox + SEAL.cx * scale;
      const cy = oy + SEAL.cy * scale;
      const rx = SEAL.rx * scale;
      const ry = SEAL.ry * scale;

      ctx.clearRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'lighter';

      const fuse = Math.min(1, t / FUSE_MS);
      // easeOutCubic: the spark leaves fast and arrives calmly, so the bloom
      // does not have to fight a still-accelerating head.
      const travelled = 1 - (1 - fuse) ** 3;
      // Overall envelope — fades the whole layer out over the bloom phase.
      const life = t < FUSE_MS ? 1 : 1 - (t - FUSE_MS) / BLOOM_MS;
      const ease = life * life;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx); // draw in circle space, squash to the floor plane

      // Burnt trail: the part of the ring the spark has already passed.
      const start = -Math.PI / 2;
      const end = start + travelled * Math.PI * 2;
      ctx.lineCap = 'round';
      for (const [w, a, c] of [
        [7, 0.32 * ease, '255,190,90'],
        [3, 0.5 * ease, '252,246,153'],
      ]) {
        ctx.beginPath();
        ctx.arc(0, 0, rx, start, end);
        ctx.strokeStyle = `rgba(${c},${a})`;
        ctx.lineWidth = w * scale;
        ctx.stroke();
      }
      ctx.restore();

      // The spark head itself, in screen space so its glow stays round.
      if (t < FUSE_MS) {
        const hx = cx + Math.cos(end) * rx;
        const hy = cy + Math.sin(end) * ry;
        const hr = 26 * scale;
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
        g.addColorStop(0, 'rgba(255,252,220,0.95)');
        g.addColorStop(0.35, 'rgba(252,246,153,0.55)');
        g.addColorStop(1, 'rgba(234,181,62,0)');
        ctx.fillStyle = g;
        ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
      }

      // Bloom: once the ring closes, the whole seal flares and settles.
      if (t >= FUSE_MS) {
        const p = (t - FUSE_MS) / BLOOM_MS;
        const flare = Math.sin(Math.PI * Math.min(1, p * 1.25)) * 0.5;
        const br = rx * 1.5;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, br);
        g.addColorStop(0, `rgba(255,240,190,${flare * 0.55})`);
        g.addColorStop(0.45, `rgba(252,246,153,${flare * 0.3})`);
        g.addColorStop(1, 'rgba(234,181,62,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-br, -br, br * 2, br * 2);
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      // Sits with the video at -z-[45], UNDER the scrim, so the flare is
      // dimmed by exactly the same wash as the seal it is lighting — an
      // un-scrimmed flash over a scrimmed rug would read as an overlay.
      className="projects-backdrop pointer-events-none -z-[45]"
      aria-hidden
    />
  );
};

export default SceneSealIgnite;
