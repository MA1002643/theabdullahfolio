'use client';
import Image from 'next/image';
import bg from '../../public/background/home-hero.webp';
import laptop from '../../public/background/laptop.png';
import Navigation from '@/components/navigation';
import LiveMaintenanceHeader from '@/components/home/LiveMaintenanceHeader';
import HomeSceneWater from '@/components/home/HomeSceneWater';
import HomeSceneGlow from '@/components/home/HomeSceneGlow';
import HomePathIgnite from '@/components/home/HomePathIgnite';
import { useState } from 'react';

export default function Home() {
  const [hovered, setHovered] = useState(false);
  return (
    // `home-shell` carries no styling of its own — it exists only so the
    // portrait-phone block in globals.css can swap `h-screen` (100vh, which on
    // iOS is the toolbar-HIDDEN height) for 100svh. Nothing above that
    // breakpoint matches it.
    <div className="home-shell relative h-screen w-screen overflow-hidden">
      {/* The causeway scene itself: instant paint, and the permanent fallback
          under reduced motion. `alt=""` marks it decorative so screen readers
          skip it instead of announcing "background, image".

          NOT 100vw: this image is object-cover'd, so on any viewport NARROWER
          than its 16:9 (portrait phones, both iPad orientations) it paints
          height-bound at ~178vh CSS px wide with the sides cropped. 100vw made
          the browser pick a srcset entry sized to the viewport and then stretch
          it into that wider paint box. max() describes the real painted width
          in both regimes; engines too old to parse math in `sizes` fall back to
          100vw — the old behaviour, never worse. Same fix the projects and
          qualifications backdrops carry.

          The portrait-phone entry is where this page DIVERGES from those two.
          Their backdrops are 100lvh boxes, so 178vh IS their painted width.
          This one is not: the portrait block at the end of globals.css turns
          the plate into a 65% band of a 100svh shell, so the paint box is
          65svh tall and its cover'd width is 65 × 16/9 = 115.6svh. 178vh
          describes the box this plate had BEFORE the band existed — measured,
          1701 declared against 1104 actually painted at 440×956, and 1699
          against 1001 on a phone whose small viewport is 866. The srcset is
          bought against the DECLARED number, so that gap is paid in bytes, and
          the rungs are far enough apart that it is a whole rung's worth. Cold-
          loaded and measured: a 1× 440×956 portrait viewport took w=1920
          (190 KB) for a band w=1200 (86 KB) covers, 430×932 took 1920 where
          1080 covers, 360×640 took 1200 where 750 does. Derived on the same
          rule (smallest rung ≥ sizes × DPR, verified against the live picks at
          1×, 2× and 3×): a 2× phone of that height — XR/SE class, small
          viewport ≤ 886 — took the top rung, which the optimiser serves capped
          at the 2560px source (307 KB), where 1001 × 2 fits w=2048 (206 KB).
          A 3× phone still lands on the top rung, but honestly now: 1001 × 3 =
          3003 device px, and the only rung above 2048 is the source itself, so
          that one is unchanged rather than improved.

          `svh`, not `vh`, because the band is a percentage of `.home-shell`,
          which that same block pins to 100svh — `vh` is the toolbar-hidden
          height and would over-declare by the toolbar again (~10%). Engines
          that don't parse svh inside `sizes` drop the entry and fall through to
          the desktop rule, which is the old behaviour once more. The max() is
          belt-and-braces: portrait means height ≥ width, so 1.156 × svh can
          never fall under 100vw. Neither number carries the 1.045 overscan,
          matching /projects, which has the same scale and ignores it too.

          No `blur-[0.2px]` and no `quality={100}` any more. Both were crutches
          for the old 1536x1024 murk plate: the blur hid its upscale, and the
          quality bump fought the resulting softness. The source is native
          2560x1440 now, so softening it away would defeat the point — and
          dropping the quality override lets Next ship a smaller LCP image. */}
      <Image
        priority
        sizes="(max-width: 639.98px) and (orientation: portrait) max(100vw, 115.6svh), max(100vw, 178vh)"
        src={bg}
        alt=""
        className="home-backdrop -z-50 object-cover object-center opacity-90"
      />

      {/* The lake, moving — the one thing still giving the photograph away, and
          the one thing flame flicker cannot fix. Picks a tier: a water-only
          ambient loop (the clip masked into this exact plate, so the causeway
          measures 0.00 frame-to-frame while the water runs at 5.6–6.2), or the
          procedural shear on Save-Data/low-power, or nothing under reduced
          motion. Sits directly on the plate (-z-[46]) because it REPLACES plate
          pixels rather than adding light, and carries the plate's own opacity
          for the same reason. */}
      <HomeSceneWater />

      {/* The same scene, living: the lanterns, their doubles in the water and
          the vanishing-point mist all breathe, and fireflies drift over the
          water. Procedural, not a video — zero bytes over the wire on the one
          route where LCP matters most. Sits BETWEEN the plate and the scrim at
          the SAME opacity, so both darken identically and the effect reads as
          "the picture is alive", never as an overlay. */}
      <HomeSceneGlow />

      {/* The causeway lighting itself, once, on arrival: a wavefront sweeps the
          stone away from the viewer, each lantern catching as it passes, then
          blooms into the mist and hands back to the baked plate. Self-
          unmounting; costs nothing after ~2.5s. Under the scrim, so the flare
          is dimmed by the same wash as the lanterns it lights. */}
      <HomePathIgnite />

      {/* Art-directed scrim, not a flat wash: dark over the headline block,
          LIGHTEST across the middle so the vanishing-point mist can rim-light
          the laptop, closing again at the bottom (.home-scrim, globals.css). */}
      <div className="home-backdrop home-scrim -z-40" />

      <main className="relative z-10 flex h-full flex-col items-center overflow-x-hidden">
        {/* Live maintenance header (issue #24) — slim status bar above the hero.
            Top padding combines the safe-area inset (for notched/dynamic-island
            devices) with the breakpoint baseline so the responsive spacing
            still applies on devices without a safe area. */}
        <div className="z-50 w-full px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] max-[479px]:pt-[calc(env(safe-area-inset-top)+1.75rem)] sm:px-4 sm:pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-8 md:pt-[calc(env(safe-area-inset-top)+1rem)] lg:px-12">
          <LiveMaintenanceHeader />
        </div>

        {/* HEADLINE */}
        {/* GPU-isolated (issue #87): `transform-gpu` (translateZ(0)) gives the
            headline its own compositor layer and `[backface-visibility:hidden]`
            stops WebKit collapsing it back into the parent during the laptop's
            per-frame transform, so no sub-pixel jitter couples across. No
            `will-change` — the headline is static, so a warm layer is wasted. */}
        <div className="z-40 transform-gpu pb-2 pt-3 text-center [backface-visibility:hidden] sm:pt-5 md:pb-4 md:pt-6 lg:pb-6 lg:pt-8">
          {/* Keep the original outline-only look for the hero name. The
              shared `.text-glow-stroke-neon` class was later changed (page-
              titles unification, PR #104) to a SOLID #ff6d05 fill so the
              sub-page headers (ABOUT ME / CONTACT ME) read as filled glyphs —
              but the homepage name is meant to stay hollow (transparent fill,
              orange stroke + glow). This inline `color` restores that prior
              value (`#000e1700`, fully transparent) for this h1 only, without
              touching the shared class the sub-page titles now rely on. */}
          <h1
            className="text-glow-stroke-neon text-center text-[2.6rem] font-[500] uppercase leading-none text-transparent sm:text-[3rem] md:text-[4rem] lg:text-[5rem]"
            style={{ color: '#000e1700' }}
          >
            Muhammad
            <br /> Abdullah
          </h1>

          <h2 className="text-glow-stroke-purple mt-1 text-[1rem] font-light uppercase leading-snug text-amethyst-neon sm:text-[1.2rem] md:text-[1.4rem] lg:text-[1.6rem]">
            Software Engineer
          </h2>
        </div>

        <div className="relative z-10 flex w-full flex-1 items-center justify-center">
          {/* Wrapper for laptop + rings */}
          <div className="relative flex items-center justify-center">
            {/* Laptop */}
            <Image
              priority
              src={laptop}
              alt="laptop"
              // laptop
              className={`laptop relative z-20 mb-6 w-[70%] animate-float-laptop object-contain sm:w-[75%] md:mb-24 md:w-[22rem] lg:w-[30rem] ${hovered ? 'active' : ''}`}
            />
            {/* Contact shadow — grounds the laptop on the causeway stone.
                Over the old empty-murk plate the eye never asked where the
                laptop met the ground; over a real photographic surface it does,
                and its absence read as "pasted on". Sits AFTER the laptop in
                the DOM so `.laptop:hover ~ .laptop-contact` can widen it on
                hover, and at z-10 (under the laptop's z-20) so paint order is
                unchanged. Decorative — hidden from assistive tech.

                The two portrait-phone overrides fix a RATIO, not a size. The
                laptop is sized in percentages (`w-[70%]`) and this shadow in
                fixed px, so the two diverge as the viewport narrows: measured
                live, the shadow is 0.91x the laptop's width at 1440 but only
                0.61x at 440 — the laptop ends up standing on a shadow
                two-thirds its width, which is most of why it reads as hovering
                rather than resting. In vw the ratio holds across 440, 390 and
                360 instead of stepping at one breakpoint. `max-sm` is the exact
                complement of `sm`, so no width can match both. */}
            <div
              aria-hidden
              className="laptop-contact pointer-events-none absolute z-10 mt-16 h-[34px] w-[180px] rounded-[50%] max-sm:portrait:h-[10vw] max-sm:portrait:w-[63vw] sm:h-[38px] sm:w-[210px] md:h-[52px] md:w-[300px] lg:h-[64px] lg:w-[420px]"
            />
            {/* glowing borderline under laptop */}
            <div
              className="borderline absolute mt-16 h-[150px] w-[150px] animate-ripple-neon rounded-full sm:h-[200px] sm:w-[200px] md:h-[280px] md:w-[280px] lg:h-[340px] lg:w-[340px]"
              style={{ transform: 'perspective(600px) rotateX(80deg)' }}
            />

            <div
              className="borderline2 absolute mt-16 h-[220px] w-[220px] animate-ripple-neon rounded-full sm:h-[300px] sm:w-[300px] md:h-[400px] md:w-[400px] lg:h-[460px] lg:w-[460px]"
              style={{ transform: 'perspective(600px) rotateX(80deg)' }}
            />

            <div
              className="borderline3 absolute mt-16 h-[320px] w-[320px] animate-ripple-neon rounded-full sm:h-[460px] sm:w-[460px] md:h-[600px] md:w-[600px] lg:h-[600px] lg:w-[600px]"
              style={{ transform: 'perspective(600px) rotateX(80deg)' }}
            />
          </div>
          {/* navigation buttons */}
          <Navigation setHovered={setHovered} hovered={hovered} />
        </div>
      </main>
    </div>
  );
}
