"use client"
import React from 'react'
import Image from "next/image";
import bg from "../../../../public/background/qualifications-bg.webp";
import Carousel from '@/components/qualifications/Carousel'
import PageTitle from '@/components/PageTitle'
import SceneVideo from '@/components/qualifications/SceneVideo'

const page = () => {
  return (
    <>
      {/* HEADLINE — uses shared PageTitle (issue #104). replayOnView makes the
          letter-ignite re-run every time the heading scrolls back into view
          (issue #46), instead of once per mount. */}
      <PageTitle title="QUALIFICATION" subtitle="accomplishments" replayOnView />
      {/* Static frame of the scene: instant paint, the video's "poster", and
          the permanent fallback (reduced motion / Save-Data / video error).
          No blur — the source is native ~4MP now, softening it away defeats
          the point (the old 1024px source needed the 0.2px blur to hide its
          upscale). */}
      <Image
        priority
        sizes="100vw"
        src={bg}
        alt=""
        className="-z-50 fixed top-0 left-0 w-full h-full object-cover object-center opacity-80 bg-black"
      />
      {/* The same scene, living: water ripples + lantern flicker (issue #52
          follow-up, casadisolare.com pattern). Sits BETWEEN the image and
          the dimmer so both frames get identical darkening. */}
      <SceneVideo />
      <div className='fixed -z-40 top-0 left-0 w-full h-full bg-black/80' />
      <Carousel />

    </>
  )
}

export default page