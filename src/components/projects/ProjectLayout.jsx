"use client"

import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import TransitionLink from "@/components/pageTransition/TransitionLink"
import { warmProjectScene } from "@/components/project-detail/scene-loader"

const item = {
  hidden: { opacity: 0, y: 100 },
  show: { opacity: 1, y: 0 },
}

const ProjectLink = motion(TransitionLink)

// Mirrors the signals Next's own viewport prefetch stands down for
// (saveData, 2g/slow-2g). navigator.connection is Chromium-only; where it
// doesn't exist there is no signal to respect, so we warm as usual.
const isConstrainedConnection = () => {
  const connection = navigator.connection
  return (
    !!connection &&
    (connection.saveData || /2g/.test(connection.effectiveType || ""))
  )
}

const ProjectLayout = ({ id, name, description, date, demoLink, category }) => {
  const router = useRouter()

  const handleClick = () => {
    if (category) {
      localStorage.setItem("projects-category", category)
    }
  }

  // Warm the destination while the visitor is still deciding (issue #83).
  // <Link> prefetches the route in-viewport, and warmProjectScene starts the
  // three.js chunk download that next/dynamic would otherwise only begin
  // after navigation. Both calls dedupe, so re-hovering costs nothing.
  // onTouchStart is the mobile "intent" signal — it fires a beat before
  // click, which is enough to get the request going. On Save-Data / 2G we
  // stand down entirely: hover is a hint, not a click, and a speculative
  // ~1 MB scene chunk is exactly the spend that preference asks us to skip —
  // those visitors pay the chunk on navigation itself, as before this branch.
  const warmDetail = () => {
    if (isConstrainedConnection()) return
    router.prefetch(`/projects/${id}`)
    warmProjectScene()
  }

  return (
    <ProjectLink
      variants={item}
      href={`/projects/${id}`}
      transitionLabel={name}
      onClick={handleClick}
      onMouseEnter={warmDetail}
      onFocus={warmDetail}
      onTouchStart={warmDetail}
      className="text-sm md:text-base flex items-center justify-between w-full relative rounded-lg overflow-hidden p-4 md:p-6 custom-bg-abt"
    >
      <div className="flex items-center justify-center space-x-2">
        <h2 style={{ color: "#ff6d05", textShadow: "none" }}>{name}</h2>
        <p
          className="text-fire-amber hidden sm:inline-block"
          style={{ textShadow: "none" }}
        >
          {description}
        </p>
      </div>

      <div className="self-end flex-1 mx-2 mb-2 bg-transparent border-b border-dashed border-[#ffaa2a]" />

      <p
        id="date"
        className="text-[#ff6d05]"
        style={{ textShadow: "none" }}
      >
        {new Date(date).toDateString()}
      </p>
    </ProjectLink>
  )
}

export default ProjectLayout
