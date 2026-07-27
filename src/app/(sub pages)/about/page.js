"use client"
import Image from "next/image";
import bg from "../../../../public/background/contact-bg.png";
import AboutDetails from "@/components/about";
import AuroraDustMount from "@/components/AuroraDustMount";
import PageTitle from "@/components/PageTitle";

export default function About() {
  return (
    // Fragment, not <main>: the (sub pages) layout already provides the one
    // <main> landmark (see issue #86 — nested <main> is invalid HTML).
    <>
      {/* Background mirrors the contact page exactly: the same contact-bg.png at
          half opacity, a black overlay to deepen it, then the cursor-reactive
          aurora composited over the top (screen blend) by the mount. `alt=""`
          marks it decorative so screen readers skip it (matches NotFoundClient). */}
      <Image
        src={bg}
        alt=""
        priority
        sizes="100vw"
        className="-z-50 fixed top-0 left-0 w-full h-full object-cover object-center opacity-50"
      />
      <div className="-z-40 fixed top-0 left-0 w-full h-full bg-black/70" />

      {/* Shared aurora (drifts + bends toward the cursor), scroll-reactive: a
          gentle vertical parallax shifts the whole aurora as the page scrolls
          and eases to rest when it stops. (The earlier discrete dust-mote
          particles were removed — the soft aurora itself carries the scroll
          reaction.) Self-gates on motion preference + loader reveal; the
          static image above is the reduced-motion fallback. */}
      <AuroraDustMount />

      {/* HEADLINE — uses shared PageTitle (issue #104). The
          decorative inline dashes around "WHO I AM" were dropped per
          the acceptance criteria: the subtitle now uses the same
          plain <h2> treatment as the qualifications page. */}
      <PageTitle title="ABOUT ME" subtitle="WHO I AM" id="about" />

      <AboutDetails />
    </>
  );
}
