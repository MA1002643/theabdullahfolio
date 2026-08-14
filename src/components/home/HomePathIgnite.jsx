'use client';
import { useEffect, useRef, useState } from 'react';
import { useSceneGate } from '@/hooks/useSceneGate';
import {
  IW,
  IH,
  LANTERNS,
  coverProjection,
  depthOf,
  bandV,
  bandHalfWidth,
  BAND_V_END,
} from './homeSceneLights';

// The causeway lighting itself, once, on arrival — running AWAY from the viewer.
//
// The lanterns are baked into the plate, so they are already lit on the very
// first frame and cannot animate themselves. This layer draws a wavefront that
// sweeps the wet stone from below the bottom edge to the vanishing point;
// each lantern catches as the front reaches its depth, and the whole thing
// blooms into the mist and fades out, leaving the baked artwork behind it. The
// scene is unchanged two and a half seconds later. What this buys is the MOMENT.
//
// It is the SceneSealIgnite verb — a spark traverses a shape anchored in the
// art, blooms, hands over to the bake, then self-unmounts and costs nothing for
// the rest of the visit — moved up a page and given a DIRECTION. The homepage
// is the one route in this site that never scrolls, so it has no scroll
// indicator to say "there is more this way". The background says it instead:
// the light goes inward, toward the rest of the portfolio.
//
// Depth, not index: the front is a position in the same normalised depth space
// the lantern rig derives from its own perspective line (homeSceneLights), so
// the two rows of posts catch in true near-to-far order without anything being
// hand-sequenced, and moving a lantern re-times the ignite automatically.

const TRAVEL_MS = 1700; // front runs the causeway
const BLOOM_MS = 800; // flare at the vanishing point settles into the bake
const TOTAL = TRAVEL_MS + BLOOM_MS;

// A frame delta longer than this means the tab was backgrounded (rAF stops).
// Clamping it makes the sequence PAUSE rather than jump, so someone who tabs
// away and back still sees the moment instead of its aftermath.
const MAX_DELTA = 50;

// How fast a lantern falls back after catching, in depth units. 5.5 leaves each
// flare visible for roughly a sixth of the causeway behind the front — long
// enough to read as a lit trail, short enough that the front stays the subject.
const DECAY = 5.5;
// Attack window before the front arrives, in depth units.
const RISE = 0.025;

const HomePathIgnite = () => {
  const canvasRef = useRef(null);
  const { mounted, running, lite } = useSceneGate(canvasRef);
  const [done, setDone] = useState(false);

  const active = mounted && !done;

  useEffect(() => {
    if (!active || !running) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Depths are derived once: they depend only on the rig, not on the frame.
    const depths = LANTERNS.map((l) => depthOf(l.v));

    let raf = 0;
    let elapsed = 0;
    let prev = 0;

    const draw = (now) => {
      if (!prev) prev = now;
      elapsed += Math.min(now - prev, MAX_DELTA);
      prev = now;

      if (elapsed >= TOTAL) {
        setDone(true); // unmount: this must cost nothing for the rest of the visit
        return;
      }
      raf = requestAnimationFrame(draw);

      const cw = canvas.width;
      const ch = canvas.height;
      if (!cw || !ch) return;
      const { scale, ox, oy } = coverProjection(cw, ch);

      ctx.clearRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'lighter';

      const p = Math.min(1, elapsed / TRAVEL_MS);
      // easeOutQuad: the front leaves fast and arrives calmly. Perspective is
      // already compressing distance near the horizon, so a stronger ease
      // (easeOutCubic, as SceneSealIgnite uses on a flat ellipse) would stall
      // the last third visibly.
      const front = 1 - (1 - p) ** 2;
      // Envelope over the bloom phase — fades the entire layer out, so the
      // hand-off to the baked plate has no visible seam.
      const life = elapsed < TRAVEL_MS ? 1 : 1 - (elapsed - TRAVEL_MS) / BLOOM_MS;
      const ease = life * life;

      // ── the wavefront on the stone ──────────────────────────────────────
      // A horizontally-stretched glow sitting on the causeway at the front's
      // current depth, its width tracking the causeway's own perspective. This
      // is what sells the motion: without it the lanterns would just light in
      // sequence with nothing travelling between them.
      if (elapsed < TRAVEL_MS) {
        const v = bandV(front);
        const halfW = bandHalfWidth(v);
        // Causeway centreline drifts very slightly right toward the vanishing
        // point; lerp rather than assume dead centre.
        const u = 0.5 + 0.0155 * front;
        const x = ox + u * IW * scale;
        const y = oy + v * IH * scale;
        const rx = halfW * IW * scale;
        // The band is a shallow ellipse: the stone is a receding plane, so a
        // round glow would read as a ball of light hovering over it.
        const ry = Math.max(1, rx * 0.16);
        // Brightest as it launches, easing off as it shrinks into the mist —
        // otherwise the tiny far band reads as a hot pinprick.
        const a = 0.5 * ease * (0.45 + 0.55 * (1 - front));

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        // The headline's own #ff6d05, flat across the ramp with alpha alone
        // carrying the falloff — the same way the ripple rings and the laptop's
        // hover bloom are written. The old stops were a temperature ramp
        // (near-white core -> warm yellow -> amber edge), which is what made
        // the front read yellow; holding one hue keeps it on the name.
        g.addColorStop(0, `rgba(255,109,5,${a})`);
        g.addColorStop(0.4, `rgba(255,109,5,${a * 0.5})`);
        g.addColorStop(1, 'rgba(255,109,5,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
        ctx.restore();
      }

      // ── the lanterns catching ───────────────────────────────────────────
      for (let i = 0; i < LANTERNS.length; i += 1) {
        const s = LANTERNS[i];
        const dt = front - depths[i];
        let flare;
        if (dt < -RISE) continue; // front has not reached it yet
        else if (dt < 0) flare = (dt + RISE) / RISE; // fast attack as it arrives
        else flare = Math.exp(-dt * DECAY); // settle back toward the bake

        const a = 0.62 * flare * ease;
        if (a < 0.005) continue;
        const x = ox + s.u * IW * scale;
        const y = oy + s.v * IH * scale;
        // Flare radius is generous relative to the ambient glow: a lantern
        // catching should visibly bloom past its resting halo, then fall back
        // into it as HomeSceneGlow takes over.
        const r = s.g * scale * (1.15 + 0.5 * flare);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,248,222,${a})`);
        g.addColorStop(0.35, `rgba(252,214,140,${a * 0.5})`);
        g.addColorStop(1, 'rgba(234,181,62,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }

      // ── the bloom at the vanishing point ────────────────────────────────
      // Once the front arrives, the far cluster flares and settles. Kept
      // deliberately modest in radius: this lands directly behind the laptop,
      // and a wide flash there would silhouette it instead of rim-lighting it.
      if (elapsed >= TRAVEL_MS) {
        const bp = (elapsed - TRAVEL_MS) / BLOOM_MS;
        const flare = Math.sin(Math.PI * Math.min(1, bp * 1.3)) * 0.5;
        const x = ox + 0.5155 * IW * scale;
        const y = oy + BAND_V_END * IH * scale;
        const r = 330 * scale;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        // Same #ff6d05 as the front that arrived here — the bloom is that
        // light landing, so it cannot be a different colour from it.
        g.addColorStop(0, `rgba(255,109,5,${flare * 0.5})`);
        g.addColorStop(0.45, `rgba(255,109,5,${flare * 0.26})`);
        g.addColorStop(1, 'rgba(255,109,5,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);

        // A single cold breath pushed out with it — the mist reacting to the
        // light rather than the light simply sitting on top of it. Skipped on
        // the lite tier, where it is the least legible of the three fills.
        if (!lite) {
          const cr = r * 1.6;
          const cg = ctx.createRadialGradient(x, y, 0, x, y, cr);
          cg.addColorStop(0, `rgba(150,198,236,${flare * 0.16})`);
          cg.addColorStop(1, 'rgba(150,198,236,0)');
          ctx.fillStyle = cg;
          ctx.fillRect(x - cr, y - cr, cr * 2, cr * 2);
        }
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [active, running, lite]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      // Sits with the ambient glow at -z-[45], UNDER the scrim, so the flare is
      // dimmed by exactly the same wash as the lanterns it is lighting. An
      // un-scrimmed flash over a scrimmed scene reads as an overlay instantly.
      className="home-backdrop pointer-events-none -z-[45]"
      aria-hidden
    />
  );
};

export default HomePathIgnite;
