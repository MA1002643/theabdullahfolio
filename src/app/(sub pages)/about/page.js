"use client"
import Image from "next/image";
import bg from "../../../../public/background/contact-bg.png";
import AboutDetails from "@/components/about";
import AboutAuroraDustMount from "@/components/about/AboutAuroraDustMount";
import PageTitle from "@/components/PageTitle";

export default function About() {
  return (
    <main >
      {/* Background mirrors the contact page exactly: the same contact-bg.png at
          half opacity, a black overlay to deepen it, then the cursor-reactive
          aurora composited over the top (screen blend) by the mount. */}
      <Image
        src={bg}
        alt="background-image"
        priority
        sizes="100vw"
        className="-z-50 fixed top-0 left-0 w-full h-full object-cover object-center opacity-50"
      />
      <div className="-z-40 fixed top-0 left-0 w-full h-full bg-black/70" />

      {/* Contact-page aurora (drifts + bends toward the cursor), now also
          scroll-reactive: a gentle vertical parallax shifts the whole aurora as
          the page scrolls and eases to rest when it stops. (The earlier discrete
          dust-mote particles were removed — the soft aurora itself carries the
          scroll reaction.) Self-gates on motion preference + loader reveal; the
          static image above is the reduced-motion fallback. */}
      <AboutAuroraDustMount />

      {/* HEADLINE — uses shared PageTitle (issue #104). The
          decorative inline dashes around "WHO I AM" were dropped per
          the acceptance criteria: the subtitle now uses the same
          plain <h2> treatment as the qualifications page. */}
      <PageTitle title="ABOUT ME" subtitle="WHO I AM" id="about" />

      <AboutDetails />
    </main>
  );
}
