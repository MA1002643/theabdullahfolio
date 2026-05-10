'use client';
import Image from 'next/image';
import bg from '../../public/background/home-bg.png';
import laptop from '../../public/background/laptop.png';
import Navigation from '@/components/navigation';
import LiveMaintenanceHeader from '@/components/home/LiveMaintenanceHeader';
import { useState } from 'react';

export default function Home() {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* full-screen background image */}
      <Image
        priority
        src={bg}
        alt="background"
        fill
        quality={100}
        sizes="100vw"
        className="absolute inset-0 -z-50 object-cover object-center opacity-80 blur-[0.2px]"
      />

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 -z-40 bg-gradient-to-t from-black via-black/20 to-transparent" />

      {/* Two-part drift defense that still respects zoom / short-viewport
          UX:
          1. `overflow-x-hidden` clips the orbital nav's horizontal
             translation on narrow screens. The cross axis (`overflow-y`)
             computes to `auto`, so the page stays scrollable when high
             zoom or large-text settings push content past the viewport
             — required for accessibility.
          2. `[overflow-anchor:none]` disables the browser's scroll-anchor
             adjustment. That's the mechanism that turned the laptop
             float / ring scale's per-frame `scrollHeight` oscillation
             into a ~6px `scrollTop` jitter and dragged the headline.
             Anchoring off ⇒ animations can't move the viewport.
          The orbital nav's `multiplier.y` is also sized so content fits
          without scrolling on common desktop viewports — the scrollbar
          is a fallback for zoom/short heights, not the everyday state. */}
      <main className="relative z-10 flex h-full flex-col items-center overflow-x-hidden [overflow-anchor:none]">
        {/* Live maintenance header (issue #24) — slim status bar above the hero.
            Top padding combines the safe-area inset (for notched/dynamic-island
            devices) with the breakpoint baseline so the responsive spacing
            still applies on devices without a safe area. */}
        <div className="z-50 w-full px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] max-[479px]:pt-[calc(env(safe-area-inset-top)+1.75rem)] sm:px-4 sm:pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-8 md:pt-[calc(env(safe-area-inset-top)+1rem)] lg:px-12">
          <LiveMaintenanceHeader />
        </div>

        {/* HEADLINE — promoted to its own GPU compositor layer via
            `transform-gpu` so the headline's sub-pixel rounding is
            independent of the laptop float-laptop keyframe's frame
            schedule. The arbitrary `[backface-visibility:hidden]` is the
            WebKit incantation that prevents the layer from collapsing
            back into the parent. We deliberately do NOT add
            `will-change: transform` — this element never animates, so
            keeping it perpetually warmed would just waste compositor
            memory. */}
        <div
          className="z-40 transform-gpu pb-2 pt-3 text-center [backface-visibility:hidden] sm:pt-5 md:pb-4 md:pt-6 lg:pb-6 lg:pt-8"
        >
          <h1 className="text-glow-stroke-neon text-center text-[2.6rem] font-[500] uppercase leading-none text-transparent sm:text-[3rem] md:text-[4rem] lg:text-[5rem]">
            Muhammad
            <br /> Abdullah
          </h1>

          <h2 className="text-glow-stroke-purple mt-1 text-[1rem] font-light uppercase leading-snug text-amethyst-neon sm:text-[1.2rem] md:text-[1.4rem] lg:text-[1.6rem]">
            Software Engineer
          </h2>
        </div>

        <div className="relative z-10 flex w-full flex-1 items-center justify-center">
          {/* Wrapper for laptop + rings. NO `contain:layout` here — that
              would establish a stacking context, trapping the laptop's
              `z-20` inside the wrapper and letting the orbital nav (z-0,
              later in DOM) paint on top of the laptop. The drift fix
              already lives on `<main>` via `overflow-clip`, so layout
              containment here is unnecessary. */}
          <div className="relative flex items-center justify-center">
            {/* Laptop */}
            <Image
              priority
              src={laptop}
              alt="laptop"
              // laptop
              className={`laptop relative z-20 mb-6 w-[70%] animate-float-laptop object-contain sm:w-[75%] md:mb-24 md:w-[22rem] lg:w-[30rem] ${hovered ? 'active' : ''}`}
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
