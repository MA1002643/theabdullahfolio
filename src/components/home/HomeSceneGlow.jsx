'use client';
import { useEffect, useRef } from 'react';
import { useSceneGate } from '@/hooks/useSceneGate';
import {
  IW,
  IH,
  LANTERNS,
  REFLECTIONS,
  MIST,
  coverProjection,
  flicker,
  flameFlicker,
} from './homeSceneLights';

// Ambient light for the homepage causeway — the living version of
// home-hero.webp, done procedurally. A canvas repaints the plate's OWN light
// sources (the two foreground lanterns, the twin rows of causeway posts, the
// unresolvable cluster at the vanishing point, their doubles in the water) as
// additive glows whose intensity and radius ride seeded value noise, plus
// fireflies drifting over the water.
//
// This is the /projects SceneEmbers pattern, and it is the ONLY motion tier
// here: no ambient video ships for this page. On the site's LCP-critical entry
// route that is the better trade and not a compromise — the layer weighs zero
// bytes over the wire, loops seamlessly by construction, stays crisp at any
// viewport, and cannot fail the way a decode can. The honest cost is that only
// the LIGHT moves: flame silhouettes and the water surface stay still. At this
// scrim level that is imperceptible, and it is the same trade SceneEmbers
// documents.
//
// Sits at -z-[45] between the plate (-z-50) and the scrim (-z-40), carrying the
// SAME opacity as the plate, so both darken identically under the scrim and the
// effect reads as "the picture is alive" rather than "an effect on top" — the
// invariant every scene layer in this codebase holds.

// SOURCES alphas are authored as relative levels; this scales them for the real
// pipeline. What the canvas draws is multiplied by the layer's CSS opacity and
// then washed by .home-scrim, so a drawn alpha of A lands near A x 0.9 x 0.45.
// 2.8 puts the brightest flame cores at roughly a 30-unit RGB swing — read as
// unmistakably alive at a glance, without pushing the lanterns past the plate's
// own baked highlights, which would look like a second light source.
const INTENSITY = 2.8;

// ── Where the flames went ───────────────────────────────────────────────────
// This layer used to also relight the flames themselves, as an additive tongue
// plus a core per lantern. Both were radial gradients, because the only size
// the rig carried was `r`, a detected core RADIUS — and a circle is not a flame
// at any tuning. Measured off the plate, the flames are tongues about 1.8 times
// taller than they are wide, so the honest description of what that drew is a
// glowing blob over a frozen flame.
//
// The flames now burn in HomeSceneLivePlate, which warps each lantern's own
// photographed flame and adds fbm fire licking out of it. This layer keeps what
// it was always right about: the light a lantern THROWS, which is a soft radial
// falloff and genuinely is shaped like this.
const FLY_COUNT = 14;
const FLY_COUNT_LITE = 5;

// ~30fps is plenty for low-frequency light noise and halves the energy cost of
// a layer that runs for the whole visit. Low-power devices get 20.
const FRAME_MS = 33;
const FRAME_MS_LITE = 50;

const HomeSceneGlow = () => {
  const canvasRef = useRef(null);
  const { mounted, running, lite } = useSceneGate(canvasRef);

  useEffect(() => {
    if (!running) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    // Buffer at CSS-pixel size (dpr 1): every mark here is a soft gradient or a
    // 2px firefly, so a retina buffer would quadruple fill cost for no visible
    // gain — the call SceneEmbers and SceneSealIgnite both make.
    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Fireflies drift in IMAGE space, so their paths survive a resize. They are
    // kept off the causeway itself (which is where the laptop and nav sit) and
    // out to the sides over the water, where the plate has no detail to fight.
    const flies = Array.from({ length: lite ? FLY_COUNT_LITE : FLY_COUNT }, (_, i) => {
      const leftSide = i % 2 === 0;
      return {
        u0: leftSide ? 0.06 + Math.random() * 0.22 : 0.72 + Math.random() * 0.22,
        v0: 0.6 + Math.random() * 0.28,
        rise: 0.04 + Math.random() * 0.06,
        sway: 0.005 + Math.random() * 0.009,
        w: 0.3 + Math.random() * 0.5,
        ph: Math.random() * Math.PI * 2,
        life: 10 + Math.random() * 8,
        off: Math.random(),
        r: 2.0 + Math.random() * 2.2,
        a: 0.075 + Math.random() * 0.07,
      };
    });

    const frameMs = lite ? FRAME_MS_LITE : FRAME_MS;
    let raf = 0;
    let last = 0;
    const t0 = performance.now();

    // One reusable radial-glow blit. Every source in this scene is the same
    // shape, so keeping it in one place is what lets the lite tier drop whole
    // categories without duplicating draw code.
    const glow = (x, y, r, colour, alpha, stretchY = 1) => {
      if (alpha < 0.004 || r <= 0) return;
      ctx.save();
      ctx.translate(x, y);
      if (stretchY !== 1) ctx.scale(1, stretchY);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(${colour},${alpha})`);
      g.addColorStop(0.5, `rgba(${colour},${alpha * 0.35})`);
      g.addColorStop(1, `rgba(${colour},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    };

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - last < frameMs) return;
      last = now;
      const t = (now - t0) / 1000;

      const cw = canvas.width;
      const ch = canvas.height;
      if (!cw || !ch) return;
      const { scale, ox, oy } = coverProjection(cw, ch);

      ctx.clearRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'lighter';

      // The cold mist at the vanishing point, breathing on its own slow axis.
      // Skipped on the lite tier: it is the largest single fill in the scene
      // (a 420px-radius gradient) and the least legible contribution.
      if (!lite) {
        const n = flicker(99, t, MIST.s);
        glow(
          ox + MIST.u * IW * scale,
          oy + MIST.v * IH * scale,
          MIST.g * scale * (0.92 + 0.16 * n),
          MIST.c,
          INTENSITY * MIST.a * (0.6 + 0.4 * n),
        );
      }

      for (let i = 0; i < LANTERNS.length; i += 1) {
        const s = LANTERNS[i];
        // Two clocks, deliberately. `flicker` is the slow breath — light spilled
        // through glass onto wet stone changes slowly, because it is an average
        // over the whole flame. `flameFlicker` is a flame's own jitter, mixed in
        // at a minority weight so the spill reads as answering fire rather than
        // as a dimmer being turned.
        //
        // It shares its seed with HomeSceneLivePlate, which mattered when that
        // layer drew the flames: the two were then genuinely in step. Now the
        // FILMED flames usually do (HomeSceneVideo), and each of those runs its
        // own loop, so this is plausible flicker rather than synchronised
        // flicker. Left uncoupled on purpose — driving a canvas off the video's
        // currentTime would tie this layer to another's decode for a
        // correlation that is invisible at this alpha under the scrim.
        const n =
          s.k === 'far'
            ? flicker(i + 1, t, s.s)
            : 0.66 * flicker(i + 1, t, s.s) + 0.34 * flameFlicker(i + 61, t);
        // Enclosed flames breathe around their glow rather than guttering: a
        // lantern that drops to nothing reads as a bulb failing, not a flame.
        // The far cluster is many lanterns averaged, so it only shimmers.
        const level =
          s.k === 'far' ? 0.62 + 0.38 * n : s.k === 'lantern' ? 0.4 + 0.6 * n : 0.34 + 0.66 * n;
        // Radius rides the same noise as alpha. Pure alpha pulsing at a fixed
        // radius reads as a dimmer switch; the swell is what reads as flame.
        glow(
          ox + s.u * IW * scale,
          oy + s.v * IH * scale,
          s.g * scale * (0.82 + 0.3 * n),
          s.c,
          INTENSITY * s.a * level,
        );
      }

      if (!lite) {
        for (let i = 0; i < REFLECTIONS.length; i += 1) {
          const s = REFLECTIONS[i];
          // Offset seed from the lanterns so a reflection never peaks in exact
          // lockstep with its source — still water lags and smears.
          const n = flicker(i + 41, t, s.s);
          // Centre passed unscaled: `glow` translates to it BEFORE applying the
          // vertical stretch, so the smear grows symmetrically about the point
          // rather than sliding down the frame.
          glow(
            ox + s.u * IW * scale,
            oy + s.v * IH * scale,
            s.g * scale * (0.85 + 0.25 * n),
            s.c,
            INTENSITY * s.a * (0.45 + 0.55 * n),
            s.y,
          );
        }
      }

      for (const f of flies) {
        const frac = (t / f.life + f.off) % 1;
        const u = f.u0 + f.sway * Math.sin(t * f.w + f.ph);
        const v = f.v0 - frac * f.rise;
        // sin envelope: fade in, fade out, so a firefly never pops.
        const a = INTENSITY * f.a * Math.sin(Math.PI * frac);
        if (a < 0.004) continue;
        ctx.fillStyle = `rgba(255,228,186,${a})`;
        ctx.beginPath();
        ctx.arc(
          ox + u * IW * scale,
          oy + v * IH * scale,
          f.r * scale * 0.55,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [running, lite]);

  if (!mounted) return null;

  return (
    <canvas
      ref={canvasRef}
      // .home-backdrop supplies the absolute inset-0 box, the drift transform
      // and the overscan shared with the plate and the scrim, so this layer
      // cannot de-sync from the artwork it is lighting. Same opacity as the
      // plate: both darken identically under the scrim.
      className="home-backdrop pointer-events-none -z-[45] opacity-90"
      aria-hidden
    />
  );
};

export default HomeSceneGlow;
