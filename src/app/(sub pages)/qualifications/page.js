"use client"
import React from 'react'
import Image from "next/image";
import bg from "../../../../public/background/qualifications-bg.png";
import Carousel from '@/components/qualifications/Carousel'

const page = () => {
  return (
    <>
      {/* HEADLINE */}
      <div className="z-50 pt-8 text-center">
        <h1
          className="text-transparent text-[2rem] font-extrabold uppercase leading-tight md:text-[3rem] text-glow-stroke-neon"
          style={{
            // textShadow: "0 0 10px #fcf699, 0 0 20px #fcf699, 0 0 40px #fcf699"
          }}
        >
          QUALIFICATION
        </h1>
        <h2 
          className="mt-1 text-[1rem] leading-snug md:text-[1.6rem]"
          style={{
            color: 'rgb(252 131 255 / var(--tw-text-opacity, 1))',
            textShadow: '0 0 5px #ff55f7, 0 0 10px #ff55f7, 0 0 20px #ff55f7',
            '--tw-text-opacity': '1'
          }}
        >
          -accomplishments-
        </h2>
      </div>
      <Image
        priority
        sizes="100vw"
        src={bg}
        alt="background-image"
        className="-z-50 fixed top-0 left-0 w-full h-full object-cover object-center opacity-80 blur-[0.2px] bg-black"
      />
      <div className='fixed -z-40 top-0 left-0 w-full h-full bg-black/80' />
      <Carousel />

    </>
  )
}

export default page