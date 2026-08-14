'use client';
import { useEffect, useRef, useState } from 'react';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { onMediaChange } from '@/lib/mediaQuery';

// Ambient ember light for /projects: the living version of project-bg.webp,
// done procedurally — no video file. A fixed canvas repaints the still's own
// light sources (hanging lanterns, table candles, their table pools and the
// rug glow) as additive radial glows whose intensity rides seeded value
// noise, plus a few dust motes drifting through the central light shaft.
// Fills the same -z-[45] slot the /qualifications SceneVideo occupies in its
// sandwich (still −z-50 · this layer · black/70 dimmer −z-40), so the effect
// reads as "the picture is alive", never as an overlay.
//
// Why procedural instead of an ambient video (the /qualifications approach):
// it weighs ~0 bytes over the wire, loops seamlessly by construction, stays
// crisp at any viewport, and needs no generation pipeline. The trade-off is
// honest: only the LIGHT moves — flame silhouettes themselves stay still,
// which at this dimming level (the black/70 wash above) is imperceptible.
//
// Every glow is authored in the IMAGE's normalised space and projected
// through the same `object-fit: cover` + center math the still renders with,
// so the glows stay glued to their lanterns across every crop regime
// (width-bound desktop, height-bound portrait, mobile URL-bar states).
//
// Mount gates (the qualifications SceneVideo contract, minus Save-Data —
// that flag guards network spend, and this layer costs none; CPU is capped
// instead by the 30fps throttle):
//   • prefers-reduced-motion — never mount; the still image IS the page.
//   • loader reveal          — start animating only after the intro loader
//                              hands the page over; nothing competes with
//                              first paint.

// project-bg.webp's intrinsic space — all source coordinates are u,v
// fractions of this frame; radii are px in this frame, scaled on draw.
const IW = 2560;
const IH = 1440;

// One flame ≈ one entry, eyeballed off the artwork. `k` picks the flicker
// character: enclosed lanterns breathe slowly and never go dark, naked
// candles flicker faster and deeper, pools/fairy clusters just swell gently.
// `s` is the noise rate (Hz-ish), `a` the peak added alpha (pre-dimmer).
const SOURCES = [
  // hanging lanterns — canopy, left to right
  { k: 'lantern', u: 0.064, v: 0.393, r: 95, a: 0.15, s: 1.0, c: '255,190,110' },
  { k: 'lantern', u: 0.268, v: 0.178, r: 85, a: 0.17, s: 1.2, c: '255,190,110' },
  { k: 'lantern', u: 0.321, v: 0.247, r: 75, a: 0.15, s: 0.9, c: '255,190,110' },
  { k: 'lantern', u: 0.432, v: 0.343, r: 60, a: 0.13, s: 1.1, c: '255,190,110' },
  { k: 'lantern', u: 0.468, v: 0.286, r: 50, a: 0.11, s: 1.3, c: '255,190,110' },
  { k: 'lantern', u: 0.768, v: 0.152, r: 110, a: 0.18, s: 1.0, c: '255,190,110' },
  { k: 'lantern', u: 0.929, v: 0.203, r: 80, a: 0.15, s: 1.15, c: '255,190,110' },
  { k: 'lantern', u: 0.971, v: 0.273, r: 70, a: 0.13, s: 0.95, c: '255,190,110' },
  { k: 'lantern', u: 0.925, v: 0.393, r: 85, a: 0.16, s: 1.05, c: '255,190,110' },
  { k: 'lantern', u: 0.8, v: 0.419, r: 55, a: 0.11, s: 1.25, c: '255,190,110' },
  { k: 'lantern', u: 0.746, v: 0.368, r: 45, a: 0.1, s: 1.4, c: '255,190,110' },
  // fairy-light clusters over the centre — a soft collective shimmer
  { k: 'pool', u: 0.614, v: 0.292, r: 120, a: 0.09, s: 0.7, c: '255,205,140' },
  { k: 'pool', u: 0.529, v: 0.324, r: 80, a: 0.08, s: 0.8, c: '255,205,140' },
  // table candles — left workbench
  { k: 'candle', u: 0.13, v: 0.6, r: 70, a: 0.16, s: 2.6, c: '255,168,84' },
  { k: 'candle', u: 0.205, v: 0.628, r: 80, a: 0.17, s: 3.0, c: '255,168,84' },
  { k: 'candle', u: 0.27, v: 0.565, r: 75, a: 0.16, s: 2.4, c: '255,168,84' },
  { k: 'candle', u: 0.33, v: 0.585, r: 70, a: 0.16, s: 3.2, c: '255,168,84' },
  { k: 'candle', u: 0.245, v: 0.615, r: 60, a: 0.14, s: 2.9, c: '255,168,84' },
  // centre table
  { k: 'candle', u: 0.532, v: 0.533, r: 55, a: 0.13, s: 2.7, c: '255,168,84' },
  { k: 'candle', u: 0.571, v: 0.565, r: 60, a: 0.14, s: 3.1, c: '255,168,84' },
  { k: 'candle', u: 0.629, v: 0.584, r: 65, a: 0.14, s: 2.5, c: '255,168,84' },
  { k: 'candle', u: 0.661, v: 0.577, r: 55, a: 0.13, s: 3.3, c: '255,168,84' },
  { k: 'candle', u: 0.689, v: 0.577, r: 50, a: 0.12, s: 2.8, c: '255,168,84' },
  // right table + its dark lantern (an open candle inside)
  { k: 'candle', u: 0.921, v: 0.622, r: 65, a: 0.14, s: 2.6, c: '255,168,84' },
  { k: 'candle', u: 0.95, v: 0.635, r: 55, a: 0.13, s: 3.0, c: '255,168,84' },
  { k: 'candle', u: 0.968, v: 0.546, r: 80, a: 0.14, s: 2.4, c: '255,168,84' },
  // lone step candle
  { k: 'candle', u: 0.471, v: 0.66, r: 40, a: 0.1, s: 2.9, c: '255,168,84' },
  // broad low pools — the light each cluster throws on wood / weave
  { k: 'pool', u: 0.235, v: 0.625, r: 340, a: 0.07, s: 0.55, c: '255,150,64' },
  { k: 'pool', u: 0.615, v: 0.575, r: 320, a: 0.065, s: 0.6, c: '255,150,64' },
  { k: 'pool', u: 0.935, v: 0.63, r: 280, a: 0.065, s: 0.5, c: '255,150,64' },
  { k: 'pool', u: 0.593, v: 0.844, r: 380, a: 0.06, s: 0.45, c: '255,150,64' },
];

// The SOURCES alphas are authored as relative levels; this one knob scales
// them for the real pipeline: what the canvas draws is multiplied by the
// layer's CSS opacity-70 and then washed by the black/70 dimmer above it,
// so a drawn alpha of A lands on screen at roughly A × 0.7 × 0.3 of full.
// 3.4 puts the brightest flame cores at a ~30-40 RGB-unit swing — the
// scene reads as unmistakably alive at a glance (an earlier 2.2 survived
// the dimmer only as sub-threshold breathing and was read as a static
// image); the glows' radius riding the same noise does the rest.
const INTENSITY = 3.4;

const MOTE_COUNT = 16;

// Deterministic hash → [0,1) keyed by (seed, lattice index) — the lattice
// for the value noise below. Integer-mixing (xorshift/imul) keeps it cheap.
const rand2 = (seed, i) => {
  let h = (seed * 374761393 + i * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// 1D value noise: random lattice values, smoothstep-blended. Two octaves
// (slow breath + faster shimmer) make organic flame noise — a plain sine
// reads as mechanical pulsing immediately.
const vnoise = (seed, t) => {
  const i = Math.floor(t);
  const f = t - i;
  const sf = f * f * (3 - 2 * f);
  return rand2(seed, i) * (1 - sf) + rand2(seed, i + 1) * sf;
};
const flicker = (seed, t, speed) =>
  0.7 * vnoise(seed, t * speed) + 0.3 * vnoise(seed ^ 0x9e37, t * speed * 3.1);

const SceneEmbers = () => {
  const canvasRef = useRef(null);
  const revealed = useLoaderRevealed();
  const [motionOk, setMotionOk] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setMotionOk(!mq.matches);
    apply();
    return onMediaChange(mq, apply);
  }, []);

  const active = revealed && motionOk;

  useEffect(() => {
    if (!active) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    // Buffer at CSS-pixel size (dpr 1): every mark this layer draws is a
    // soft gradient or a 2px mote — retina buffers would quadruple the
    // fill cost for no visible gain.
    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Motes drift in image space too, so their path survives resizes.
    const motes = Array.from({ length: MOTE_COUNT }, () => ({
      u0: 0.35 + Math.random() * 0.4,
      v0: 0.3 + Math.random() * 0.45,
      rise: 0.05 + Math.random() * 0.07,
      sway: 0.004 + Math.random() * 0.008,
      w: 0.3 + Math.random() * 0.5,
      ph: Math.random() * Math.PI * 2,
      life: 9 + Math.random() * 7,
      off: Math.random(),
      r: 2.2 + Math.random() * 2.4,
      a: 0.07 + Math.random() * 0.07,
    }));

    let raf;
    let last = 0;
    const t0 = performance.now();

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      // ~30fps is plenty for low-frequency light noise, and halves the
      // energy cost of a layer that runs for the whole visit.
      if (now - last < 33) return;
      last = now;
      const t = (now - t0) / 1000;

      const cw = canvas.width;
      const ch = canvas.height;
      if (!cw || !ch) return;
      // The still's object-fit: cover + object-center, re-derived.
      const scale = Math.max(cw / IW, ch / IH);
      const ox = (cw - IW * scale) / 2;
      const oy = (ch - IH * scale) / 2;

      ctx.clearRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < SOURCES.length; i += 1) {
        const s = SOURCES[i];
        const n = flicker(i + 1, t, s.s);
        // Candles may gutter to nothing (troughs land on the untouched
        // still — the flicker stays anchored to the artwork's own light);
        // enclosed lanterns and pools only breathe around their glow.
        const a =
          INTENSITY *
          (s.k === 'candle'
            ? s.a * Math.pow(n, 1.3)
            : s.a * (s.k === 'lantern' ? 0.35 + 0.65 * n : 0.5 + 0.5 * n));
        if (a < 0.004) continue;
        const x = ox + s.u * IW * scale;
        const y = oy + s.v * IH * scale;
        // The glow swells and shrinks WITH its light: radius modulation is
        // what the eye reads as flame motion — pure alpha pulsing at the
        // same spot reads as a dimmer switch, not a fire.
        const r = s.r * scale * (0.8 + 0.35 * n);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${s.c},${a})`);
        g.addColorStop(0.5, `rgba(${s.c},${a * 0.35})`);
        g.addColorStop(1, `rgba(${s.c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }

      for (const m of motes) {
        const frac = (t / m.life + m.off) % 1;
        const u = m.u0 + m.sway * Math.sin(t * m.w + m.ph);
        const v = m.v0 - frac * m.rise;
        const a = INTENSITY * m.a * Math.sin(Math.PI * frac);
        const x = ox + u * IW * scale;
        const y = oy + v * IH * scale;
        ctx.fillStyle = `rgba(255,228,186,${a})`;
        ctx.beginPath();
        ctx.arc(x, y, m.r * scale * 0.55, 0, Math.PI * 2);
        ctx.fill();
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
      // .projects-backdrop (globals.css) supplies fixed + 100lvh sizing
      // shared with the still image and the dimmer, so the mobile URL bar
      // collapsing can't resize this layer and de-sync the glow mapping.
      // Same opacity-70 as the still: both darken identically under the
      // dimmer, keeping "the picture is alive", never "an effect on top".
      className="projects-backdrop pointer-events-none -z-[45] opacity-70"
      aria-hidden
    />
  );
};

export default SceneEmbers;
