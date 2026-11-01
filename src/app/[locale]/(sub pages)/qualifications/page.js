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
        // NOT 100vw: this image is object-cover'd, so on any viewport
        // NARROWER than the scene's 16:9 (every portrait phone, both iPad
        // orientations) it paints height-bound at ~178vh CSS px wide
        // (100vh × 16/9) with the sides cropped off. 100vw made the browser
        // pick a srcset entry sized to the viewport and then stretch it into
        // that wider paint box — a 640w file blown up ~2.3× on a 390px phone
        // (worse at 3× DPR), i.e. a blurry background. max() describes the
        // real painted width in both regimes; engines too old to parse math
        // in `sizes` treat the value as invalid and fall back to 100vw —
        // exactly the old behaviour, never worse.
        sizes="max(100vw, 178vh)"
        src={bg}
        alt=""
        className="qualifications-backdrop -z-50 object-cover object-center opacity-80 bg-black"
      />
      {/* The same scene, living: water ripples + lantern flicker (issue #52
          follow-up, casadisolare.com pattern). Sits BETWEEN the image and
          the dimmer so both frames get identical darkening. All three fixed
          layers share .qualifications-backdrop (globals.css): 100lvh-pinned
          so the mobile URL bar collapsing can't re-zoom the cover crop. */}
      <SceneVideo />
      <div className='qualifications-backdrop -z-40 bg-black/80' />
      <Carousel />

    </>
  )
}

export default page