"use client"
import React from 'react'
import Image from "next/image";
import bg from "../../../../public/background/qualifications-bg.png";
import Carousel from '@/components/qualifications/Carousel'
import PageTitle from '@/components/PageTitle'

const page = () => {
  return (
    <>
      {/* HEADLINE — uses shared PageTitle (issue #104). */}
      <PageTitle title="QUALIFICATION" subtitle="accomplishments" />
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