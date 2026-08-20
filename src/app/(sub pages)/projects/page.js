import Image from "next/image";
import bg from "../../../../public/background/project-bg.webp";
import ProjectList from "@/components/projects";
import SceneVideo from "@/components/projects/SceneVideo";
import SceneParallax from "@/components/projects/SceneParallax";
import SceneSealIgnite from "@/components/projects/SceneSealIgnite";
import { projectsData } from "../../data";
import { sectionMetadata } from "@/lib/og/meta";

export const metadata = sectionMetadata({
  title: "Projects",
  description:
    "Eleven builds tracked live from their own GitHub boards — web, systems, and apps.",
  path: "/projects",
});

export default function Project() {
  return (
    // Fragment, not <main>: the (sub pages) layout already renders the one
    // <main> landmark this page lives in, and a second nested <main> is
    // invalid HTML that screen readers may announce twice (issue #86 bonus
    // cleanup). The qualifications page already uses this fragment structure.
    <>
      {/* The workshop scene itself: instant paint, the video's "poster", and
          the permanent fallback (reduced motion / Save-Data / video error).
          Source is native 2560×1440 now (issue-era 1024×576 needed a 0.4px
          blur to hide its upscale; that crutch is gone). `alt=""` marks it
          decorative so screen readers skip it, matching the about and
          qualifications backdrops. */}
      <Image
        priority
        // NOT 100vw: this image is object-cover'd, so on any viewport
        // NARROWER than its 16:9 (portrait phones, iPads) it paints
        // height-bound at ~178vh CSS px wide (100vh × 16/9) with the sides
        // cropped. max() describes the real painted width in both regimes so
        // the browser picks a big-enough srcset entry; engines too old to
        // parse math in `sizes` fall back to 100vw — the old behaviour,
        // never worse. Same fix the qualifications backdrop carries.
        sizes="max(100vw, 178vh)"
        src={bg}
        alt=""
        className="projects-backdrop -z-50 object-cover object-center opacity-[0.88]"
      />
      {/* The same scene, living: an ambient seedance i2v loop generated from
          the exact still frame above — the lanterns and candles flicker while
          the camera stays locked (the /qualifications water-scene pattern).
          Sits BETWEEN the image and the dimmer so both get identical
          darkening, and the video appearing is a seamless "the picture
          starts moving" moment. All three fixed layers share
          .projects-backdrop (globals.css): 100lvh-pinned so the mobile URL
          bar collapsing can't re-zoom the cover crop. */}
      <SceneVideo />
      {/* The MA seal on the rug lighting itself once, on arrival — a spark
          runs the ring, blooms, and hands over to the baked mark. Self-
          unmounting; costs nothing after ~2.4s. Sits under the scrim so the
          flare is dimmed identically to the seal it lights. */}
      <SceneSealIgnite />
      {/* Art-directed scrim, not a flat wash: dark behind the reading
          column, falling away at the edges so the lantern detail survives
          where no text sits (.projects-scrim, globals.css). */}
      <div className="projects-backdrop projects-scrim -z-40" />
      {/* Renders nothing: writes --scene-dx/--scene-dy on <html> so all three
          backdrop layers drift together against the fixed content. */}
      <SceneParallax />

      <ProjectList projects={projectsData} />
    </>
  );
}
