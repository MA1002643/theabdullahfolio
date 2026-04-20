'use client';
import Image from 'next/image';
import bg from '../../public/background/home-bg.png';
import laptop from '../../public/background/laptop.png';
import Navigation from '@/components/navigation';
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
        className="absolute inset-0 object-cover object-center opacity-80 blur-[0.2px]"
      />

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

      <main className="relative z-10 flex h-full flex-col items-center overflow-x-hidden">
        {/* HEADLINE */}
        <div className="z-50 pb-8 pt-14 text-center md:pb-12 lg:pb-16">
          <h1 className="text-glow-stroke-neon text-center text-[3rem] font-[500] uppercase leading-none text-transparent md:text-[4rem] lg:text-[5rem]">
            Muhammad
            <br /> Abdullah
          </h1>

          <h2 className="text-glow-stroke-purple mt-1 text-[1.2rem] font-light uppercase leading-snug text-amethyst-neon md:text-[1.4rem] lg:text-[1.6rem]">
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
            {/* glowing borderline under laptop */}
            <div
              className="-neon borderline absolute mt-16 h-[150px] w-[150px] animate-ripple-neon rounded-full sm:h-[200px] sm:w-[200px] md:h-[280px] md:w-[280px] lg:h-[340px] lg:w-[340px]"
              style={{ transform: 'perspective(600px) rotateX(80deg)' }}
            />

            <div
              className="-neon borderline2 absolute mt-16 h-[220px] w-[220px] animate-ripple-neon rounded-full sm:h-[300px] sm:w-[300px] md:h-[400px] md:w-[400px] lg:h-[460px] lg:w-[460px]"
              style={{ transform: 'perspective(600px) rotateX(80deg)' }}
            />

            <div
              className="-neon borderline3 absolute mt-16 h-[320px] w-[320px] animate-ripple-neon rounded-full sm:h-[460px] sm:w-[460px] md:h-[600px] md:w-[600px] lg:h-[600px] lg:w-[600px]"
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
