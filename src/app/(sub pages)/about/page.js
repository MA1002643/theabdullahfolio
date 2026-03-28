"use client"
import Image from "next/image";
import bg from "../../../../public/background/about-bg.png";
import AboutDetails from "@/components/about";

export default function About() {
  return (
    <main >
      <Image
        priority
        sizes="100vw"
        src={bg}
        alt="background-image"
        className="-z-50 fixed top-0 left-0 w-full h-full object-cover object-center opacity-100"
      />

      {/* <div className="relative w-full h-screen flex flex-col items-center justify-center">
        <div className="absolute flex flex-col items-center text-center top-[60%] left-1/2 -translate-y-1/2 -translate-x-1/2">
          <h1 className="font-bold text-9xl text-accent">Muhammad Abdullah</h1>
          <p className="font-light text-foreground text-ls">
            Meet the wizard behind this portfolio
          </p>
        </div>
      </div> */}
      {/* HEADLINE */}
      <div id="about" className="z-50 pt-8 text-center">
        <h1
          className="text-transparent text-[3rem] font-extrabold uppercase leading-tight md:text-[3.5rem] text-glow-stroke-neon"
        >
          ABOUT ME
        </h1>
        <div 
          className="flex items-center justify-center gap-4 mt-1 text-[1rem] uppercase leading-snug md:text-[1.6rem]"
          style={{
            color: 'rgb(252 131 255 / var(--tw-text-opacity, 1))',
            textShadow: '0 0 5px #ff55f7, 0 0 10px #ff55f7, 0 0 20px #ff55f7',
            '--tw-text-opacity': '1'
          }}
        >
          <div className="w-6 h-[2px] rounded-full" style={{ backgroundColor: '#fc83ff', boxShadow: '0 0 5px #ff55f7, 0 0 10px #ff55f7' }} />
          <span>WHO I AM</span>
          <div className="w-6 h-[2px] rounded-full" style={{ backgroundColor: '#fc83ff', boxShadow: '0 0 5px #ff55f7, 0 0 10px #ff55f7' }} />
        </div>
      </div>

      <AboutDetails />
    </main>
  );
}
